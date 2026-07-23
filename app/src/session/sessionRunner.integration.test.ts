// Integration test exercising SessionRunner + real storage/ modules together against an
// in-memory IndexedDB (fake-indexeddb), rather than each module in isolation. Complements the
// pure-module unit tests (checkAnswer.test.ts, scheduler.test.ts, queue.test.ts) by covering the
// verification checklist items that are otherwise only exercisable via a real browser session:
// distinct-question selection counts, Again mid-session requeue timing, ignore/flag exclusion +
// persistence, IndexedDB survival across a simulated app restart, and version-preserving edits.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBundle, Question } from '../content/types';
import type { SessionConfig } from './types';

function makeQuestion(id: string, topic: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    version: 1,
    content_hash: 'sha256:fixture',
    type: 'en_to_pt',
    topic,
    subtopic: topic,
    direction: 'en_to_pt',
    difficulty: 'easy',
    register: 'neutral',
    prompt: `Prompt for ${id}`,
    accepted_answers: [{ text: id, accent_sensitive: false }],
    explanation: `Explanation for ${id}`,
    source: { note: 'fixture.md', heading: 'Fixture' },
    status: 'approved',
    generation_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBundle(questions: Question[]): ContentBundle {
  return { schema_version: 1, bundle_version: 'test-1', questions, scenarios: [], notes: [] };
}

const baseConfig: SessionConfig = {
  count: 'unlimited',
  topics: ['A', 'B'],
  types: ['en_to_pt'],
  source_filter: 'random',
  include_ignored: false,
};

// Each test gets a fresh module graph so storage/db.ts's module-scoped `dbPromise` singleton
// doesn't leak an already-open connection between tests (mirrors a real app reload, which also
// re-opens the DB from scratch).
async function freshModules() {
  vi.resetModules();
  const { SessionRunner } = await import('./sessionRunner');
  const { getProgress } = await import('../storage/progressStore');
  return { SessionRunner, getProgress };
}

describe('SessionRunner integration (real checking + review + storage)', () => {
  beforeEach(async () => {
    // Wipe the fake IndexedDB between tests so they don't see each other's data.
    indexedDB = new IDBFactory();
  });

  it('a 10-count session selects exactly 10 distinct questions', async () => {
    const { SessionRunner } = await freshModules();
    const questions = Array.from({ length: 15 }, (_, i) => makeQuestion(`q${i}`, 'A'));
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 10, topics: ['A'] });

    const seen = new Set<string>();
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      seen.add(q.id);
      runner.submitAnswer(q.id);
      await runner.confirmRating('good');
      runner.proceedToNext();
    }
    expect(seen.size).toBe(10);
    const result = await runner.finish();
    expect(result.summary.answered).toBe(10);
    expect(result.summary.correct).toBe(10);
  });

  it('typing an accepted answer scores correct and schedules Good (3-day first interval)', async () => {
    const { SessionRunner, getProgress } = await freshModules();
    const q = makeQuestion('q1', 'A', {
      accepted_answers: [
        { text: 'Eu vi ele.', accent_sensitive: false },
        { text: 'Eu o vi.', accent_sensitive: false },
      ],
    });
    const bundle = makeBundle([q]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });

    const feedback = runner.submitAnswer('eu o vi');
    expect(feedback.outcome).toBe('correct');
    await runner.confirmRating('good');
    runner.proceedToNext();
    await runner.finish();

    const progress = await getProgress('q1');
    expect(progress?.interval_days).toBe(3);
    expect(progress?.attempts).toBe(1);
    expect(progress?.correct).toBe(1);
  });

  it('rating Again requeues the question 3-5 questions later, exactly once', async () => {
    const { SessionRunner } = await freshModules();
    const questions = Array.from({ length: 8 }, (_, i) => makeQuestion(`q${i}`, 'A'));
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 8, topics: ['A'] });

    // selectQuestions() shuffles, so don't assume a fixed id lands first — capture whichever
    // question is actually current and track that one.
    const firstId = runner.currentQuestion()!.id;
    runner.submitAnswer('wrong answer entirely');
    await runner.confirmRating('again');
    runner.proceedToNext();

    let stepsUntilReappearance = 0;
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      if (q.id === firstId) break;
      stepsUntilReappearance += 1;
      runner.submitAnswer(q.id);
      await runner.confirmRating('good');
      runner.proceedToNext();
    }

    expect(runner.isFinished()).toBe(false);
    expect(stepsUntilReappearance).toBeGreaterThanOrEqual(3);
    expect(stepsUntilReappearance).toBeLessThanOrEqual(5);

    // Answer the requeued question correctly this time, then confirm it never reappears again.
    runner.submitAnswer(firstId);
    await runner.confirmRating('good');
    runner.proceedToNext();
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      expect(q.id).not.toBe(firstId);
      runner.submitAnswer(q.id);
      await runner.confirmRating('good');
      runner.proceedToNext();
    }
  });

  it('ignoring a question mid-session excludes it from tallies and persists user_status', async () => {
    const { SessionRunner, getProgress } = await freshModules();
    const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'A'), makeQuestion('q3', 'A')];
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 3, topics: ['A'] });

    // selectQuestions() shuffles, so walk the whole (order-independent) queue and single out
    // 'q1' for ignoring wherever it lands, answering everything else correctly.
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      runner.submitAnswer(q.id);
      if (q.id === 'q1') {
        await runner.ignoreCurrentQuestion();
      } else {
        await runner.confirmRating('good');
      }
      runner.proceedToNext();
    }

    const result = await runner.finish();
    expect(result.summary.answered).toBe(2);
    expect(result.summary.correct).toBe(2);
    expect(result.items.find((i) => i.question_id === 'q1')?.final_result).toBe('ignored_mid_session');

    const progress = await getProgress('q1');
    expect(progress?.user_status).toBe('ignored');
  });

  it('flagging overrides an already-confirmed rating before proceedToNext', async () => {
    const { SessionRunner, getProgress } = await freshModules();
    const bundle = makeBundle([makeQuestion('q1', 'A')]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });

    runner.submitAnswer('q1');
    await runner.confirmRating('good'); // rated once
    await runner.flagCurrentQuestionAsBad('ambiguous prompt'); // overrides before advancing
    runner.proceedToNext();

    const result = await runner.finish();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].final_result).toBe('ignored_mid_session');

    const progress = await getProgress('q1');
    expect(progress?.user_status).toBe('flagged_bad');
    expect(progress?.user_status_reason).toBe('ambiguous prompt');
  });

  it('an ignored question is excluded from the next session unless include_ignored is set', async () => {
    const mod1 = await freshModules();
    const bundle = makeBundle([makeQuestion('q1', 'A'), makeQuestion('q2', 'A')]);
    const runner1 = await mod1.SessionRunner.start(bundle, { ...baseConfig, count: 2, topics: ['A'] });
    while (!runner1.isFinished()) {
      const q = runner1.currentQuestion()!;
      runner1.submitAnswer(q.id);
      if (q.id === 'q1') {
        await runner1.ignoreCurrentQuestion();
      } else {
        await runner1.confirmRating('good');
      }
      runner1.proceedToNext();
    }
    await runner1.finish();

    const mod2 = await freshModules();
    const runner2 = await mod2.SessionRunner.start(bundle, { ...baseConfig, count: 2, topics: ['A'] });
    const idsInSession2 = new Set<string>();
    while (!runner2.isFinished()) {
      idsInSession2.add(runner2.currentQuestion()!.id);
      runner2.submitAnswer('x');
      await runner2.confirmRating('again');
      runner2.proceedToNext();
    }
    expect(idsInSession2.has('q1')).toBe(false);
    expect(idsInSession2.has('q2')).toBe(true);

    const mod3 = await freshModules();
    const runner3 = await mod3.SessionRunner.start(bundle, {
      ...baseConfig,
      count: 2,
      topics: ['A'],
      include_ignored: true,
    });
    const idsInSession3 = new Set<string>();
    while (!runner3.isFinished()) {
      idsInSession3.add(runner3.currentQuestion()!.id);
      runner3.proceedToNext();
    }
    expect(idsInSession3.has('q1')).toBe(true);
  });

  it('progress survives a simulated app restart (fresh module graph, same underlying DB)', async () => {
    const mod1 = await freshModules();
    const bundle = makeBundle([makeQuestion('q1', 'A')]);
    const runner1 = await mod1.SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });
    runner1.submitAnswer('q1');
    await runner1.confirmRating('easy');
    runner1.proceedToNext();
    await runner1.finish();

    const before = await mod1.getProgress('q1');
    expect(before?.interval_days).toBe(4); // first-attempt Easy interval

    // Simulate an app restart: reload the module graph without touching the fake IndexedDB
    // instance itself (a real reload re-opens the same on-disk DB; it doesn't wipe it).
    const mod2 = await freshModules();
    const after = await mod2.getProgress('q1');
    expect(after).toEqual(before);
  });

  it('editing a question (new version/wording) preserves the existing progress record and updates last_seen_version on next attempt', async () => {
    const mod1 = await freshModules();
    const q1v1 = makeQuestion('q1', 'A', { version: 1, prompt: 'Original prompt' });
    const runner1 = await mod1.SessionRunner.start(makeBundle([q1v1]), { ...baseConfig, count: 1, topics: ['A'] });
    runner1.submitAnswer('q1');
    await runner1.confirmRating('good');
    runner1.proceedToNext();
    await runner1.finish();

    const beforeEdit = await mod1.getProgress('q1');
    expect(beforeEdit?.last_seen_version).toBe(1);
    expect(beforeEdit?.attempts).toBe(1);

    // Hand-edit the question: bump version + reword, exactly like publish.js would after a
    // laptop-side content edit. question_id is unchanged, so identity is preserved (design §12).
    const mod2 = await freshModules();
    const q1v2 = makeQuestion('q1', 'A', { version: 2, prompt: 'Reworded prompt' });
    const runner2 = await mod2.SessionRunner.start(makeBundle([q1v2]), { ...baseConfig, count: 1, topics: ['A'] });

    const unchangedYet = await mod2.getProgress('q1');
    expect(unchangedYet?.last_seen_version).toBe(1); // not yet touched by merely starting a session
    expect(unchangedYet?.attempts).toBe(1); // scheduler history intact across the edit

    runner2.submitAnswer('q1');
    await runner2.confirmRating('good');
    runner2.proceedToNext();
    await runner2.finish();

    const afterEdit = await mod2.getProgress('q1');
    expect(afterEdit?.last_seen_version).toBe(2);
    expect(afterEdit?.attempts).toBe(2); // accumulated, not reset by the edit
  });
});
