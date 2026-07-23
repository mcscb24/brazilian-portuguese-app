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
