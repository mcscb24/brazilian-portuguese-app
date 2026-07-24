// Pure module: plain data in, plain data out, no imports of anything else in the app — see
// Phase 2 plan's module-independence decision and the design doc §13 Again-requeue mechanic.

export interface QueueEntry {
  question_id: string;
}

export class SessionQueue {
  private entries: QueueEntry[];
  private cursor = 0;
  private requeueUsed = new Set<string>();

  constructor(questionIds: string[]) {
    this.entries = questionIds.map((question_id) => ({ question_id }));
  }

  // Reconstructs a queue from a saved checkpoint (Phase 2.1 save/resume). questionIds is already
  // the full ordered entry list including any Again-requeue duplicates and with removed-question
  // ids filtered out and cursor adjusted by the caller (SessionRunner.resume) — this constructor
  // just replays the resulting cursor/requeue-used state verbatim.
  static restore(questionIds: string[], cursor: number, requeueUsedIds: string[]): SessionQueue {
    const queue = new SessionQueue(questionIds);
    queue.cursor = cursor;
    queue.requeueUsed = new Set(requeueUsedIds);
    return queue;
  }

  snapshotEntries(): string[] {
    return this.entries.map((e) => e.question_id);
  }

  cursorPosition(): number {
    return this.cursor;
  }

  requeueUsedIds(): string[] {
    return [...this.requeueUsed];
  }

  current(): QueueEntry | null {
    return this.entries[this.cursor] ?? null;
  }

  advance(): void {
    this.cursor += 1;
  }

  isFinished(): boolean {
    return this.cursor >= this.entries.length;
  }

  answeredCount(): number {
    return Math.min(this.cursor, this.entries.length);
  }

  totalCount(): number {
    return this.entries.length;
  }

  // Inserts one duplicate 3-5 positions ahead (capped at the queue's end) so an "Again" doesn't
  // repeat immediately. Marks the one-shot requeue used regardless of whether a slot existed —
  // capped at one requeue per question per session either way.
  requeueAgain(questionId: string): boolean {
    if (this.requeueUsed.has(questionId)) return false;
    this.requeueUsed.add(questionId);

    const upcoming = this.entries.length - (this.cursor + 1);
    if (upcoming < 2) return false;

    const offset = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
    const insertAt = Math.min(this.entries.length, this.cursor + 1 + offset);
    this.entries.splice(insertAt, 0, { question_id: questionId });
    return true;
  }

  // Drops every not-yet-answered occurrence of a question (used on ignore/flag), including any
  // duplicate a prior requeueAgain() call inserted.
  removeAllUpcomingOccurrences(questionId: string): void {
    const done = this.entries.slice(0, this.cursor + 1);
    const upcoming = this.entries.slice(this.cursor + 1).filter((e) => e.question_id !== questionId);
    this.entries = [...done, ...upcoming];
  }
}
