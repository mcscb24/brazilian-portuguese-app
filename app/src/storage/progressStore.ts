import { createInitialProgress } from '../review/scheduler';
import type { ProgressRecord, UserStatus } from '../review/types';
import { getDB } from './db';

export async function getProgress(questionId: string): Promise<ProgressRecord | undefined> {
  const db = await getDB();
  return db.get('progress', questionId);
}

export async function getAllProgress(): Promise<Map<string, ProgressRecord>> {
  const db = await getDB();
  const all = await db.getAll('progress');
  return new Map(all.map((record) => [record.question_id, record]));
}

export async function putProgress(record: ProgressRecord): Promise<void> {
  const db = await getDB();
  await db.put('progress', record);
}

export async function getOrCreateProgress(questionId: string, version: number): Promise<ProgressRecord> {
  const existing = await getProgress(questionId);
  if (existing) return existing;
  const created = createInitialProgress(questionId, version);
  await putProgress(created);
  return created;
}

export async function setUserStatus(
  questionId: string,
  status: UserStatus,
  reason: string | null = null
): Promise<void> {
  const existing = await getProgress(questionId);
  const record = existing ?? createInitialProgress(questionId, 0);
  record.user_status = status;
  record.user_status_reason = reason;
  await putProgress(record);
}
