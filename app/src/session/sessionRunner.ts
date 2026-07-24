// The sole orchestration point for a practice session (Phase 2 plan's module-independence
// decision): wires the pure checking/, review/, and session/queue.ts modules together with
// storage/progressStore.ts + storage/sessionHistoryStore.ts. ui/screens/* must call only the
// public methods below — never checking/, review/, or session/queue.ts directly.

import { checkAnswer, type CheckOutcome } from '../checking/checkAnswer';
import { isSelfAssessedType } from '../checking/checkingMode';
import { autoRatingForOutcome } from '../checking/ratingAuto';
import type { ContentBundle, Question } from '../content/types';
import { applyAttempt } from '../review/scheduler';
import type { Rating } from '../review/types';
import { clearActiveSession, putActiveSession } from '../storage/activeSessionStore';
import { getAllProgress, getOrCreateProgress, putProgress, setUserStatus } from '../storage/progressStore';
import { saveSessionResult } from '../storage/sessionHistoryStore';
import { selectQuestions } from './selection';
import { SessionQueue } from './queue';
import type {
  DisplaySummary,
  FinalResult,
  IncorrectItem,
  SavedSession,
  SessionConfig,
  SessionItem,
  SessionResult,
  TopicBreakdown,
} from './types';

export interface FeedbackState {
  question: Question;
  userAnswer: string;
  kind: 'checked' | 'self_assessed';
  outcome: CheckOutcome | null; // null for self_assessed — no deterministic check runs
  matchedAnswer?: string;
  autoRating: Rating | null; // null for self_assessed — no chip is pre-selected (design doc §13)
  rated: boolean;
  ratedAs: Rating | null;
}

interface RunnerInit {
  sessionId: string;
  startedAt: string;
  queue: SessionQueue;
  questions: Question[];
  items?: SessionItem[];
}

export class SessionRunner {
  private queue: SessionQueue;
  private questionsById = new Map<string, Question>();
  private items = new Map<string, SessionItem>();
  private sessionId: string;
  private startedAt: string;
  private feedback: FeedbackState | null = null;

  private constructor(
    private config: SessionConfig,
    init: RunnerInit
  ) {
    for (const q of init.questions) this.questionsById.set(q.id, q);
    this.queue = init.queue;
    this.sessionId = init.sessionId;
    this.startedAt = init.startedAt;
    for (const item of init.items ?? []) this.items.set(item.question_id, item);
  }

  static async start(bundle: ContentBundle, config: SessionConfig): Promise<SessionRunner> {
    const progressByQuestionId = await getAllProgress();
    const selected = selectQuestions(bundle, config, progressByQuestionId);
    const now = new Date().toISOString();
    return new SessionRunner(config, {
      sessionId: now,
      startedAt: now,
      queue: new SessionQueue(selected.map((q) => q.id)),
      questions: selected,
    });
  }

  // Reconstructs a runner from a saved checkpoint (Phase 2.1). A question may have been removed
  // from content between save and resume, so saved.queue_entries is filtered down to ids still
  // present in the bundle, and the restored cursor is decremented by exactly the count of dropped
  // entries whose original index was before the saved cursor — this keeps answeredCount() correct
  // without special-casing "the current question was removed" (it naturally advances to the next
  // surviving entry instead).
  static resume(bundle: ContentBundle, saved: SavedSession): SessionRunner {
    const availableIds = new Set(bundle.questions.map((q) => q.id));
    const survivingEntries: string[] = [];
    let droppedBeforeCursor = 0;
    saved.queue_entries.forEach((id, index) => {
      if (availableIds.has(id)) {
        survivingEntries.push(id);
      } else if (index < saved.cursor) {
        droppedBeforeCursor += 1;
      }
    });
    const restoredCursor = saved.cursor - droppedBeforeCursor;
    const queue = SessionQueue.restore(survivingEntries, restoredCursor, saved.requeue_used);

    // Already-completed items keep rendering correctly even if their question later disappeared
    // from content, via the same defensive `question?.prompt ?? ''` fallback buildDisplaySummary
    // already uses — so it's fine if some of these ids aren't found in bundle.questions.
    const neededIds = new Set([...survivingEntries, ...saved.items.map((i) => i.question_id)]);
    const questions = bundle.questions.filter((q) => neededIds.has(q.id));

    return new SessionRunner(saved.config, {
      sessionId: saved.session_id,
      startedAt: saved.started_at,
      queue,
      questions,
      items: saved.items,
    });
  }

  currentQuestion(): Question | null {
    const entry = this.queue.current();
    if (!entry) return null;
    return this.questionsById.get(entry.question_id) ?? null;
  }

  isFinished(): boolean {
    return this.queue.isFinished();
  }

  progressLabel(): string {
    const answered = this.queue.answeredCount();
    if (this.config.count === 'unlimited') return `${answered} answered`;
    return `Question ${Math.min(answered + 1, this.config.count)} of ${this.config.count}`;
  }

  submitAnswer(userAnswer: string): FeedbackState {
    const question = this.currentQuestion();
    if (!question) throw new Error('submitAnswer called with no current question.');

    const result = checkAnswer(userAnswer, question);
    this.feedback = {
      question,
      userAnswer,
      kind: 'checked',
      outcome: result.outcome,
      matchedAnswer: result.matchedAnswer,
      autoRating: autoRatingForOutcome(result.outcome),
      rated: false,
      ratedAs: null,
    };
    return this.feedback;
  }

  // The self-assessed counterpart to submitAnswer() (design doc §10): no deterministic check
  // runs at all. attemptText is an optional, never-persisted free-text attempt — practice.ts
  // passes '' for speak_aloud, which has no input control.
  revealSelfAssessed(attemptText: string): FeedbackState {
    const question = this.currentQuestion();
    if (!question) throw new Error('revealSelfAssessed called with no current question.');
    if (!isSelfAssessedType(question.type)) {
      throw new Error(`revealSelfAssessed called on a non-self-assessed question type: ${question.type}`);
    }

    this.feedback = {
      question,
      userAnswer: attemptText,
      kind: 'self_assessed',
      outcome: null,
      autoRating: null,
      rated: false,
      ratedAs: null,
    };
    return this.feedback;
  }

  // Lets the user flag an unanticipated-but-valid phrasing as correct before rating (design doc
  // §10's "actually correct" override). Must be called before confirmRating().
  overrideOutcomeAsCorrect(): FeedbackState {
    if (!this.feedback) throw new Error('overrideOutcomeAsCorrect called with no pending feedback.');
    this.feedback.outcome = 'correct';
    this.feedback.matchedAnswer = this.feedback.userAnswer;
    this.feedback.autoRating = 'good';
    return this.feedback;
  }

  // Persists this attempt's progress/schedule update and records the session item, but does not
  // advance the queue — ignoreCurrentQuestion/flagCurrentQuestionAsBad may still override the
  // just-recorded item until proceedToNext() is called.
  async confirmRating(rating: Rating): Promise<void> {
    const feedback = this.feedback;
    if (!feedback) throw new Error('confirmRating called with no pending feedback.');
    const question = feedback.question;

    const progress = await getOrCreateProgress(question.id, question.version);
    // Self-assessed items have no deterministic outcome to derive correctness from, so it comes
    // directly from the chosen rating instead: anything but Again counts as a successful attempt
    // (matching the existing rule that Difficult already means "correct, just hint-assisted").
    const wasCorrect = feedback.kind === 'checked' ? feedback.outcome !== 'incorrect' : rating !== 'again';
    const updated = applyAttempt(progress, rating, wasCorrect, false);
    updated.last_seen_version = question.version;
    await putProgress(updated);

    const requeued = rating === 'again' ? this.queue.requeueAgain(question.id) : false;

    const finalResult: FinalResult =
      feedback.kind === 'checked'
        ? feedback.outcome === 'correct'
          ? 'correct'
          : feedback.outcome === 'correct_accent_only'
            ? 'correct_accent_only'
            : 'incorrect'
        : wasCorrect
          ? 'correct'
          : 'incorrect';

    this.items.set(question.id, {
      question_id: question.id,
      version: question.version,
      final_result: finalResult,
      final_rating: rating,
      requeued,
    });

    feedback.rated = true;
    feedback.ratedAs = rating;
  }

  // Immediate exclusion (design doc §11): never a delete, just a status flip. Cancels any
  // pending duplicate from an earlier Again-requeue and overwrites this session's own item so
  // it doesn't count as an ordinary right/wrong answer, even if a rating was just confirmed.
  async ignoreCurrentQuestion(): Promise<void> {
    await this.markCurrentQuestion('ignored', null);
  }

  async flagCurrentQuestionAsBad(reason: string): Promise<void> {
    await this.markCurrentQuestion('flagged_bad', reason);
  }

  private async markCurrentQuestion(status: 'ignored' | 'flagged_bad', reason: string | null): Promise<void> {
    const feedback = this.feedback;
    if (!feedback) throw new Error('No current question to ignore/flag.');
    const question = feedback.question;

    await setUserStatus(question.id, status, reason);
    this.queue.removeAllUpcomingOccurrences(question.id);

    this.items.set(question.id, {
      question_id: question.id,
      version: question.version,
      final_result: 'ignored_mid_session',
      final_rating: feedback.ratedAs,
      requeued: false,
    });
  }

  proceedToNext(): void {
    this.feedback = null;
    this.queue.advance();
    // Skip the checkpoint when the queue just finished: finish() clears the active-session record
    // right after, and writing one here would race that clear for no benefit (nothing is left to
    // resume once the session is over).
    if (!this.queue.isFinished()) {
      void this.persistCheckpoint();
    }
  }

  // Explicit "Save and leave" action — the UI awaits this before navigating home, guaranteeing the
  // checkpoint is written before the practice screen unmounts. Auto-checkpointing in proceedToNext
  // covers the OS/browser-kill case; this covers the deliberate-exit case with the same mechanism.
  async saveAndExit(): Promise<void> {
    await this.persistCheckpoint();
  }

  private async persistCheckpoint(): Promise<void> {
    const saved: SavedSession = {
      id: 'active',
      session_id: this.sessionId,
      config: this.config,
      queue_entries: this.queue.snapshotEntries(),
      cursor: this.queue.cursorPosition(),
      requeue_used: this.queue.requeueUsedIds(),
      items: [...this.items.values()],
      started_at: this.startedAt,
      last_active_at: new Date().toISOString(),
    };
    await putActiveSession(saved);
  }

  async endSessionEarly(): Promise<SessionResult> {
    return this.finish();
  }

  async finish(): Promise<SessionResult> {
    const items = [...this.items.values()];
    const countable = items.filter((i) => i.final_result !== 'ignored_mid_session');
    const correctCount = countable.filter(
      (i) => i.final_result === 'correct' || i.final_result === 'correct_accent_only'
    ).length;
    const incorrectCount = countable.filter((i) => i.final_result === 'incorrect').length;
    const answered = countable.length;
    const accuracy = answered > 0 ? correctCount / answered : 0;

    const topicAccuracy = this.computeTopicBreakdown(countable);
    const weakestTopics = [...topicAccuracy]
      .filter((t) => t.accuracy < 1)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map((t) => t.topic);

    const result: SessionResult = {
      session_id: this.sessionId,
      config: this.config,
      items,
      summary: {
        answered,
        correct: correctCount,
        incorrect: incorrectCount,
        accuracy,
        weakest_topics: weakestTopics,
      },
    };

    await saveSessionResult(result);
    // Centralizes cleanup so every path that ends a session (natural completion, "End session
    // early", the new "End session" exit-dialog option) leaves no stale resumable checkpoint.
    await clearActiveSession();
    return result;
  }

  private computeTopicBreakdown(countable: SessionItem[]): TopicBreakdown[] {
    const byTopic = new Map<string, { correct: number; incorrect: number }>();
    for (const item of countable) {
      const question = this.questionsById.get(item.question_id);
      if (!question) continue;
      const entry = byTopic.get(question.topic) ?? { correct: 0, incorrect: 0 };
      if (item.final_result === 'incorrect') entry.incorrect += 1;
      else entry.correct += 1;
      byTopic.set(question.topic, entry);
    }
    return [...byTopic.entries()].map(([topic, { correct, incorrect }]) => ({
      topic,
      correct,
      incorrect,
      accuracy: correct + incorrect > 0 ? correct / (correct + incorrect) : 0,
    }));
  }

  // UI-facing detail beyond the persisted SessionResult.summary schema (see session/types.ts).
  buildDisplaySummary(): DisplaySummary {
    const items = [...this.items.values()];
    const countable = items.filter((i) => i.final_result !== 'ignored_mid_session');
    const correct = countable.filter((i) => i.final_result === 'correct').length;
    const correctAccentOnly = countable.filter((i) => i.final_result === 'correct_accent_only').length;
    const incorrect = countable.filter((i) => i.final_result === 'incorrect').length;
    const ignoredOrFlagged = items.filter((i) => i.final_result === 'ignored_mid_session').length;
    const answered = countable.length;
    const accuracy = answered > 0 ? (correct + correctAccentOnly) / answered : 0;

    const incorrectItems: IncorrectItem[] = countable
      .filter((i) => i.final_result === 'incorrect')
      .map((i) => {
        const question = this.questionsById.get(i.question_id);
        return { question_id: i.question_id, prompt: question?.prompt ?? '', topic: question?.topic ?? '' };
      });

    return {
      answered,
      correct,
      correct_accent_only: correctAccentOnly,
      incorrect,
      ignored_or_flagged: ignoredOrFlagged,
      accuracy,
      topic_breakdown: this.computeTopicBreakdown(countable),
      incorrect_items: incorrectItems,
    };
  }
}
