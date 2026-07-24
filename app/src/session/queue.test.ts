import { describe, expect, it } from 'vitest';
import { SessionQueue } from './queue';

describe('SessionQueue', () => {
  it('walks entries in order and reports finished at the end', () => {
    const queue = new SessionQueue(['a', 'b', 'c']);
    expect(queue.current()?.question_id).toBe('a');
    queue.advance();
    expect(queue.current()?.question_id).toBe('b');
    queue.advance();
    expect(queue.current()?.question_id).toBe('c');
    queue.advance();
    expect(queue.isFinished()).toBe(true);
    expect(queue.current()).toBeNull();
  });

  it('requeues an Again 3-5 positions ahead, not immediately next', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const queue = new SessionQueue(ids);
    // requeueAgain is called while 'a' is still current, matching sessionRunner's real
    // call order (before proceedToNext() advances past it).
    const inserted = queue.requeueAgain('a');
    expect(inserted).toBe(true);
    expect(queue.totalCount()).toBe(8);
    queue.advance(); // simulate proceeding past the original 'a'

    // Walk forward and find where the duplicate 'a' reappears.
    let position = 0;
    while (queue.current() && queue.current()!.question_id !== 'a') {
      queue.advance();
      position += 1;
    }
    expect(queue.current()).not.toBeNull();
    expect(position).toBeGreaterThanOrEqual(3);
    expect(position).toBeLessThanOrEqual(5);
  });

  it('does not requeue when fewer than 2 unanswered entries remain', () => {
    const queue = new SessionQueue(['a', 'b']);
    expect(queue.requeueAgain('a')).toBe(false);
    expect(queue.totalCount()).toBe(2);
  });

  it('caps requeue at one per question per session', () => {
    const queue = new SessionQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(queue.requeueAgain('a')).toBe(true);
    expect(queue.requeueAgain('a')).toBe(false);
    expect(queue.totalCount()).toBe(7);
  });

  it('removes all upcoming occurrences of a question, including a requeued duplicate', () => {
    const queue = new SessionQueue(['a', 'b', 'c', 'd', 'e']);
    queue.requeueAgain('a'); // called while 'a' is current, per sessionRunner's real order
    expect(queue.totalCount()).toBe(6);
    queue.removeAllUpcomingOccurrences('a');
    // The current entry itself ('a', not yet advanced past) is untouched — only the
    // requeued duplicate further ahead is dropped.
    const remaining: string[] = [];
    while (!queue.isFinished()) {
      remaining.push(queue.current()!.question_id);
      queue.advance();
    }
    expect(remaining).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never removes the already-answered (current/past) entries', () => {
    const queue = new SessionQueue(['a', 'b', 'a']);
    queue.advance(); // 'a' is now answered, cursor on 'b'
    queue.removeAllUpcomingOccurrences('a');
    expect(queue.current()?.question_id).toBe('b');
    queue.advance();
    expect(queue.isFinished()).toBe(true);
  });

  it('snapshot -> restore round-trip reproduces identical current/isFinished/answeredCount behavior', () => {
    const original = new SessionQueue(['a', 'b', 'c', 'd', 'e']);
    original.requeueAgain('a');
    original.advance();
    original.advance();

    const restored = SessionQueue.restore(
      original.snapshotEntries(),
      original.cursorPosition(),
      original.requeueUsedIds()
    );

    expect(restored.current()?.question_id).toBe(original.current()?.question_id);
    expect(restored.isFinished()).toBe(original.isFinished());
    expect(restored.answeredCount()).toBe(original.answeredCount());
    expect(restored.totalCount()).toBe(original.totalCount());

    // Walk both queues to the end and confirm they see the exact same sequence.
    const originalRemaining: string[] = [];
    const restoredRemaining: string[] = [];
    while (!original.isFinished()) {
      originalRemaining.push(original.current()!.question_id);
      original.advance();
    }
    while (!restored.isFinished()) {
      restoredRemaining.push(restored.current()!.question_id);
      restored.advance();
    }
    expect(restoredRemaining).toEqual(originalRemaining);
  });

  it('a restored requeueUsed set still blocks a second requeue of the same id post-restore', () => {
    const original = new SessionQueue(['a', 'b', 'c', 'd', 'e']);
    original.requeueAgain('a'); // uses up 'a's one-shot requeue

    const restored = SessionQueue.restore(
      original.snapshotEntries(),
      original.cursorPosition(),
      original.requeueUsedIds()
    );

    expect(restored.requeueAgain('a')).toBe(false);
    expect(restored.totalCount()).toBe(original.totalCount());
  });
});
