// Integration test exercising SessionRunner + real storage/ modules together against an
// in-memory IndexedDB (fake-indexeddb), rather than each module in isolation. Complements the
// pure-module unit tests (checkAnswer.test.ts, scheduler.test.ts, queue.test.ts) by covering the
// verification checklist items that are otherwise only exercisable via a real browser session:
// distinct-question selection counts, Again mid-session requeue timing, ignore/flag exclusion +
// persistence, IndexedDB survival across a simulated app restart, and version-preserving edits.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBundle, Question } from '../content/types';
import type { SavedSession, SessionConfig } from './types';

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

// proceedToNext()'s auto-checkpoint write is fire-and-forget (not awaited by the caller, by
// design — see sessionRunner.ts). Tests that need to observe its result flush a macrotask tick
// first, since fake-indexeddb's transaction completion isn't guaranteed to land within the same
// microtask queue as the call that triggered it.
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
  const { getProgress, getAllProgress } = await import('../storage/progressStore');
  const { getAllSessionResults } = await import('../storage/sessionHistoryStore');
  const { getActiveSession } = await import('../storage/activeSessionStore');
  const { buildBackupFile, applyBackupImport } = await import('../backup/backupService');
  const { getDB } = await import('../storage/db');
  return {
    SessionRunner,
    getProgress,
    getAllProgress,
    getAllSessionResults,
    getActiveSession,
    buildBackupFile,
    applyBackupImport,
    getDB,
  };
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

  it('saveAndExit persists a resumable checkpoint that SessionRunner.resume continues identically', async () => {
    const { SessionRunner, getActiveSession } = await freshModules();
    const questions = Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`, 'A'));
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 5, topics: ['A'] });

    const answeredBeforeSave: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const q = runner.currentQuestion()!;
      answeredBeforeSave.push(q.id);
      runner.submitAnswer(q.id);
      await runner.confirmRating('good');
      runner.proceedToNext();
    }
    await runner.saveAndExit();

    const saved = await getActiveSession();
    expect(saved).not.toBeNull();
    expect(saved!.config).toEqual({ ...baseConfig, count: 5, topics: ['A'] });
    expect(saved!.queue_entries).toHaveLength(5);
    expect(saved!.cursor).toBe(2);
    expect(saved!.items).toHaveLength(2);
    expect(saved!.items.map((i) => i.question_id).sort()).toEqual(answeredBeforeSave.sort());
    expect(saved!.started_at).toEqual(expect.any(String));
    expect(saved!.last_active_at).toEqual(expect.any(String));

    const resumed = SessionRunner.resume(bundle, saved!);
    const answeredAfterResume: string[] = [...answeredBeforeSave];
    while (!resumed.isFinished()) {
      const q = resumed.currentQuestion()!;
      answeredAfterResume.push(q.id);
      resumed.submitAnswer(q.id);
      await resumed.confirmRating('good');
      resumed.proceedToNext();
    }
    expect(new Set(answeredAfterResume).size).toBe(5); // every question answered exactly once overall
    const result = await resumed.finish();
    expect(result.summary.answered).toBe(5);
    expect(result.summary.correct).toBe(5);
  });

  it('resume drops a question removed before the saved cursor and shifts the cursor down', async () => {
    const { SessionRunner } = await freshModules();
    const saved: SavedSession = {
      id: 'active',
      session_id: 's1',
      config: { ...baseConfig, count: 'unlimited', topics: ['A'] },
      queue_entries: ['q0', 'q1', 'q2', 'q3', 'q4'],
      cursor: 3, // q0, q1, q2 already answered; current is q3
      requeue_used: [],
      items: [],
      started_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
    };
    // q1 (index 1, before the cursor) no longer exists in the bundle.
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q2', 'A'), makeQuestion('q3', 'A'), makeQuestion('q4', 'A')]);

    const resumed = SessionRunner.resume(bundle, saved);
    expect(resumed.currentQuestion()?.id).toBe('q3');
    expect(resumed.progressLabel()).toBe('2 answered'); // cursor shifted down from 3 to 2
  });

  it('resume drops a question removed at the saved cursor and skips to the next resolvable one', async () => {
    const { SessionRunner } = await freshModules();
    const saved: SavedSession = {
      id: 'active',
      session_id: 's1',
      config: { ...baseConfig, count: 'unlimited', topics: ['A'] },
      queue_entries: ['q0', 'q1', 'q2', 'q3', 'q4'],
      cursor: 2, // q0, q1 already answered; current is q2
      requeue_used: [],
      items: [],
      started_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
    };
    // q2 (the current entry itself) no longer exists in the bundle.
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q1', 'A'), makeQuestion('q3', 'A'), makeQuestion('q4', 'A')]);

    const resumed = SessionRunner.resume(bundle, saved);
    expect(resumed.currentQuestion()?.id).toBe('q3'); // skipped straight past the removed q2
    expect(resumed.progressLabel()).toBe('2 answered'); // cursor unchanged: nothing before it was dropped
  });

  it('finish() clears the active-session checkpoint, and the final proceedToNext never wrote one', async () => {
    const { SessionRunner, getActiveSession } = await freshModules();
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q1', 'A')]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 2, topics: ['A'] });

    // Answer the first question: not yet finished, so proceedToNext auto-checkpoints.
    const q0 = runner.currentQuestion()!;
    runner.submitAnswer(q0.id);
    await runner.confirmRating('good');
    runner.proceedToNext();
    await flushAsync();
    const checkpointAfterFirst = await getActiveSession();
    expect(checkpointAfterFirst).not.toBeNull();
    expect(checkpointAfterFirst!.cursor).toBe(1);

    // Answer the second (and last) question: this proceedToNext finishes the queue, so it must
    // skip the checkpoint write entirely rather than racing finish()'s cleanup.
    const q1 = runner.currentQuestion()!;
    runner.submitAnswer(q1.id);
    await runner.confirmRating('good');
    runner.proceedToNext();
    await flushAsync();
    const checkpointBeforeFinish = await getActiveSession();
    expect(checkpointBeforeFinish).toEqual(checkpointAfterFirst); // untouched by the finishing step

    await runner.finish();
    expect(await getActiveSession()).toBeNull();
  });

  it('finish() reached via "End session" on a partially completed session also clears the checkpoint', async () => {
    const { SessionRunner, getActiveSession } = await freshModules();
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q1', 'A'), makeQuestion('q2', 'A')]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 3, topics: ['A'] });

    const q0 = runner.currentQuestion()!;
    runner.submitAnswer(q0.id);
    await runner.confirmRating('good');
    await runner.saveAndExit();
    expect(await getActiveSession()).not.toBeNull();

    // "End session" ends things early, before the queue is naturally finished.
    const result = await runner.finish();
    expect(result.summary.answered).toBe(1);
    expect(await getActiveSession()).toBeNull();
  });

  it('auto-checkpoints after every question even when saveAndExit is never called', async () => {
    const { SessionRunner, getActiveSession } = await freshModules();
    const questions = Array.from({ length: 4 }, (_, i) => makeQuestion(`q${i}`, 'A'));
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 4, topics: ['A'] });

    for (let i = 0; i < 3; i += 1) {
      const q = runner.currentQuestion()!;
      runner.submitAnswer(q.id);
      await runner.confirmRating('good');
      runner.proceedToNext();
    }
    await flushAsync();

    const saved = await getActiveSession();
    expect(saved).not.toBeNull();
    expect(saved!.cursor).toBe(3);
    expect(saved!.items).toHaveLength(3);
  });

  it('backup round-trip: buildBackupFile then applyBackupImport on a fresh DB reproduces progress and session history', async () => {
    const mod1 = await freshModules();
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q1', 'A')]);
    const runner1 = await mod1.SessionRunner.start(bundle, { ...baseConfig, count: 2, topics: ['A'] });
    while (!runner1.isFinished()) {
      const q = runner1.currentQuestion()!;
      runner1.submitAnswer(q.id);
      await runner1.confirmRating('good');
      runner1.proceedToNext();
    }
    await runner1.finish();

    const backup = await mod1.buildBackupFile(bundle);
    expect(backup.progress).toHaveLength(2);
    expect(backup.session_history).toHaveLength(1);
    expect(backup.active_session).toBeNull();

    // Simulate a fresh device: brand-new fake IndexedDB instance and module graph.
    indexedDB = new IDBFactory();
    const mod2 = await freshModules();
    const result = await mod2.applyBackupImport(backup);
    expect(result).toEqual({ progressCount: 2, sessionCount: 1, hasActiveSession: false });

    const importedProgress = await mod2.getAllProgress();
    expect([...importedProgress.keys()].sort()).toEqual(['q0', 'q1']);
    const importedHistory = await mod2.getAllSessionResults();
    expect(importedHistory).toHaveLength(1);
    expect(importedHistory[0].session_id).toBe(backup.session_history[0].session_id);
  });

  it('backup round-trip with an active_session checkpoint makes it resumable on a fresh device', async () => {
    const mod1 = await freshModules();
    const bundle = makeBundle([makeQuestion('q0', 'A'), makeQuestion('q1', 'A'), makeQuestion('q2', 'A')]);
    const runner1 = await mod1.SessionRunner.start(bundle, { ...baseConfig, count: 3, topics: ['A'] });
    const q0 = runner1.currentQuestion()!;
    runner1.submitAnswer(q0.id);
    await runner1.confirmRating('good');
    await runner1.saveAndExit();

    const backup = await mod1.buildBackupFile(bundle);
    expect(backup.active_session).not.toBeNull();
    expect(backup.active_session!.cursor).toBe(0); // saveAndExit was called before proceedToNext

    indexedDB = new IDBFactory();
    const mod2 = await freshModules();
    await mod2.applyBackupImport(backup);

    const restoredCheckpoint = await mod2.getActiveSession();
    expect(restoredCheckpoint).toEqual(backup.active_session);
  });

  it('backup round-trip with no active_session clears any checkpoint already saved on the importing device', async () => {
    const mod1 = await freshModules();
    const bundle = makeBundle([makeQuestion('q0', 'A')]);
    const runner1 = await mod1.SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });
    const q0 = runner1.currentQuestion()!;
    runner1.submitAnswer(q0.id);
    await runner1.confirmRating('good');
    runner1.proceedToNext();
    await runner1.finish(); // no active_session left on this "device"

    const backup = await mod1.buildBackupFile(bundle);
    expect(backup.active_session).toBeNull();

    indexedDB = new IDBFactory();
    const mod2 = await freshModules();
    // This device has its own in-progress session that the incoming backup knows nothing about.
    const runner2 = await mod2.SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });
    await runner2.saveAndExit();
    expect(await mod2.getActiveSession()).not.toBeNull();

    await mod2.applyBackupImport(backup);
    expect(await mod2.getActiveSession()).toBeNull();
  });

  it('migrates a v1 database to v2, preserving existing progress and adding a usable active_session store', async () => {
    vi.resetModules();
    const { openDB } = await import('idb');

    // Simulate an existing v1 install by opening the same DB name/version with the pre-2.1 schema.
    const v1db = await openDB('bp-practice-app', 1, {
      upgrade(db) {
        const progressStore = db.createObjectStore('progress', { keyPath: 'question_id' });
        progressStore.createIndex('by_next_review_at', 'next_review_at');
        db.createObjectStore('session_history', { keyPath: 'session_id' });
        db.createObjectStore('settings', { keyPath: 'id' });
      },
    });
    await v1db.put('progress', {
      question_id: 'q1',
      last_seen_version: 1,
      user_status: 'active',
      user_status_reason: null,
      attempts: 1,
      correct: 1,
      incorrect: 0,
      last_reviewed_at: null,
      next_review_at: null,
      ease: 2.5,
      interval_days: 1,
      recent_history: [],
    });
    v1db.close();

    const { getDB } = await import('../storage/db');
    const db2 = await getDB();

    const preserved = await db2.get('progress', 'q1');
    expect(preserved?.question_id).toBe('q1');
    expect(preserved?.attempts).toBe(1);

    await db2.put('active_session', {
      id: 'active',
      session_id: 's1',
      config: baseConfig,
      queue_entries: [],
      cursor: 0,
      requeue_used: [],
      items: [],
      started_at: '2026-01-01T00:00:00Z',
      last_active_at: '2026-01-01T00:00:00Z',
    });
    const active = await db2.get('active_session', 'active');
    expect(active?.session_id).toBe('s1');
  });

  it('revealSelfAssessed() on a self-assessed question returns a self_assessed FeedbackState with no outcome/autoRating', async () => {
    const { SessionRunner } = await freshModules();
    const q = makeQuestion('q1', 'A', {
      type: 'open_completion',
      accepted_answers: undefined,
      model_answers: ['Uma resposta possível.'],
      useful_structures: ['presente do indicativo'],
    });
    const bundle = makeBundle([q]);
    const runner = await SessionRunner.start(bundle, {
      ...baseConfig,
      count: 1,
      topics: ['A'],
      types: ['open_completion'],
    });

    const feedback = runner.revealSelfAssessed('minha tentativa');
    expect(feedback.kind).toBe('self_assessed');
    expect(feedback.outcome).toBeNull();
    expect(feedback.autoRating).toBeNull();
    expect(feedback.userAnswer).toBe('minha tentativa');
    expect(feedback.question.model_answers).toEqual(['Uma resposta possível.']);
  });

  it('revealSelfAssessed() throws when the current question is a checked (exact-mode) type', async () => {
    const { SessionRunner } = await freshModules();
    const bundle = makeBundle([makeQuestion('q1', 'A')]); // default type: en_to_pt
    const runner = await SessionRunner.start(bundle, { ...baseConfig, count: 1, topics: ['A'] });
    expect(() => runner.revealSelfAssessed('')).toThrow();
  });

  it("confirmRating('again') after revealSelfAssessed() requeues the question 3-5 questions later and records incorrect, exactly like a deterministic Again", async () => {
    const { SessionRunner } = await freshModules();
    const questions = Array.from({ length: 8 }, (_, i) =>
      makeQuestion(`q${i}`, 'A', { type: 'open_completion', accepted_answers: undefined, model_answers: ['x'] })
    );
    const bundle = makeBundle(questions);
    const runner = await SessionRunner.start(bundle, {
      ...baseConfig,
      count: 8,
      topics: ['A'],
      types: ['open_completion'],
    });

    const firstId = runner.currentQuestion()!.id;
    runner.revealSelfAssessed('');
    await runner.confirmRating('again');
    runner.proceedToNext();

    let stepsUntilReappearance = 0;
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      if (q.id === firstId) break;
      stepsUntilReappearance += 1;
      runner.revealSelfAssessed('');
      await runner.confirmRating('good');
      runner.proceedToNext();
    }

    expect(runner.isFinished()).toBe(false);
    expect(stepsUntilReappearance).toBeGreaterThanOrEqual(3);
    expect(stepsUntilReappearance).toBeLessThanOrEqual(5);

    // Answer the requeued question with a non-Again rating this time, then confirm it never
    // reappears again, and that its recorded final_result reflects the successful retry.
    runner.revealSelfAssessed('');
    await runner.confirmRating('good');
    runner.proceedToNext();
    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      expect(q.id).not.toBe(firstId);
      runner.revealSelfAssessed('');
      await runner.confirmRating('good');
      runner.proceedToNext();
    }

    const result = await runner.finish();
    expect(result.items.find((i) => i.question_id === firstId)?.final_result).toBe('correct');
  });

  it('confirmRating on a self-assessed item schedules identically to a checked item given the same rating', async () => {
    const { SessionRunner, getProgress } = await freshModules();
    const checkedQuestion = makeQuestion('checked-1', 'A');
    const selfQuestion = makeQuestion('self-1', 'A', {
      type: 'open_completion',
      accepted_answers: undefined,
      model_answers: ['Resposta modelo'],
    });
    const bundle = makeBundle([checkedQuestion, selfQuestion]);
    const runner = await SessionRunner.start(bundle, {
      ...baseConfig,
      count: 2,
      topics: ['A'],
      types: ['en_to_pt', 'open_completion'],
    });

    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      if (q.type === 'open_completion') {
        runner.revealSelfAssessed('');
      } else {
        runner.submitAnswer(q.id);
      }
      await runner.confirmRating('good');
      runner.proceedToNext();
    }
    await runner.finish();

    const checkedProgress = await getProgress('checked-1');
    const selfProgress = await getProgress('self-1');
    // Proves the scheduler path is genuinely shared, not reimplemented: same rating in, same
    // schedule out, regardless of whether the rating came from a check or a self-assessment.
    expect(selfProgress?.interval_days).toBe(checkedProgress?.interval_days);
    expect(selfProgress?.ease).toBe(checkedProgress?.ease);
    expect(selfProgress?.attempts).toBe(checkedProgress?.attempts);
    expect(selfProgress?.correct).toBe(checkedProgress?.correct);
  });

  it('a session mixing a checked and a self-assessed question tallies correctly through finish() and buildDisplaySummary()', async () => {
    const { SessionRunner } = await freshModules();
    const checkedQuestion = makeQuestion('checked-1', 'A');
    const selfQuestion = makeQuestion('self-1', 'B', {
      type: 'open_completion',
      accepted_answers: undefined,
      model_answers: ['Resposta modelo'],
    });
    const bundle = makeBundle([checkedQuestion, selfQuestion]);
    const runner = await SessionRunner.start(bundle, {
      ...baseConfig,
      count: 2,
      topics: ['A', 'B'],
      types: ['en_to_pt', 'open_completion'],
    });

    while (!runner.isFinished()) {
      const q = runner.currentQuestion()!;
      if (q.type === 'open_completion') {
        runner.revealSelfAssessed('');
      } else {
        runner.submitAnswer(q.id);
      }
      await runner.confirmRating('good');
      runner.proceedToNext();
    }

    const result = await runner.finish();
    expect(result.summary.answered).toBe(2);
    expect(result.summary.correct).toBe(2);

    const display = runner.buildDisplaySummary();
    expect(display.answered).toBe(2);
    expect(display.correct).toBe(2);
    expect(display.topic_breakdown.map((t) => t.topic).sort()).toEqual(['A', 'B']);
  });

  it('a mixed-type session survives save/resume and completes correctly end-to-end', async () => {
    const { SessionRunner, getActiveSession } = await freshModules();
    const checkedQuestion = makeQuestion('checked-1', 'A');
    const selfQuestion1 = makeQuestion('self-1', 'A', {
      type: 'open_completion',
      accepted_answers: undefined,
      model_answers: ['Resposta modelo 1'],
    });
    const selfQuestion2 = makeQuestion('self-2', 'A', {
      type: 'speak_aloud',
      accepted_answers: undefined,
      model_answers: ['Resposta modelo 2'],
    });
    const bundle = makeBundle([checkedQuestion, selfQuestion1, selfQuestion2]);
    const config: SessionConfig = {
      ...baseConfig,
      count: 3,
      topics: ['A'],
      types: ['en_to_pt', 'open_completion', 'speak_aloud'],
    };
    const runner = await SessionRunner.start(bundle, config);

    // Answer whichever question landed first (selectQuestions shuffles), using the right method
    // for its type, then save-and-exit mid-session.
    const firstQuestion = runner.currentQuestion()!;
    if (firstQuestion.type === 'en_to_pt') {
      runner.submitAnswer(firstQuestion.id);
    } else {
      runner.revealSelfAssessed('');
    }
    await runner.confirmRating('good');
    runner.proceedToNext();
    await runner.saveAndExit();

    const saved = await getActiveSession();
    expect(saved).not.toBeNull();
    expect(saved!.cursor).toBe(1);
    expect(saved!.items).toHaveLength(1);

    // Resume on what stands in for a fresh module graph/page load, then drive the rest of the
    // mixed-type queue to completion, using the correct method per question type.
    const resumed = SessionRunner.resume(bundle, saved!);
    while (!resumed.isFinished()) {
      const q = resumed.currentQuestion()!;
      if (q.type === 'en_to_pt') {
        resumed.submitAnswer(q.id);
      } else {
        resumed.revealSelfAssessed('');
      }
      await resumed.confirmRating('good');
      resumed.proceedToNext();
    }

    const result = await resumed.finish();
    expect(result.summary.answered).toBe(3);
    expect(result.summary.correct).toBe(3);
    expect(await getActiveSession()).toBeNull();

    const display = resumed.buildDisplaySummary();
    expect(display.answered).toBe(3);
    expect(display.correct).toBe(3);
  });
});
