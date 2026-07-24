import type { SavedSession } from '../session/types';
import { getDB } from './db';

const ACTIVE_SESSION_ID = 'active';

export async function getActiveSession(): Promise<SavedSession | null> {
  const db = await getDB();
  const existing = await db.get('active_session', ACTIVE_SESSION_ID);
  return existing ?? null;
}

export async function putActiveSession(saved: SavedSession): Promise<void> {
  const db = await getDB();
  await db.put('active_session', saved);
}

export async function clearActiveSession(): Promise<void> {
  const db = await getDB();
  await db.delete('active_session', ACTIVE_SESSION_ID);
}
