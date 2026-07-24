import type { SessionResult } from '../session/types';
import { getDB } from './db';

export async function saveSessionResult(result: SessionResult): Promise<void> {
  const db = await getDB();
  await db.put('session_history', result);
}

export async function getAllSessionResults(): Promise<SessionResult[]> {
  const db = await getDB();
  return db.getAll('session_history');
}

// Bulk replace for backup import — see replaceAllProgress in progressStore.ts for the same
// clear-then-put-all-in-one-transaction rationale.
export async function replaceAllSessionResults(results: SessionResult[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('session_history', 'readwrite');
  await tx.store.clear();
  await Promise.all(results.map((result) => tx.store.put(result)));
  await tx.done;
}
