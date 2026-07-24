import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProgressRecord } from '../review/types';
import type { SavedSession, SessionResult } from '../session/types';

export interface Settings {
  id: 'settings';
  last_seen_bundle_version: string | null;
  storage_persist_granted: boolean;
  first_launch_at: string;
  last_backup_export_at: string | null;
}

interface AppDB extends DBSchema {
  progress: {
    key: string;
    value: ProgressRecord;
    indexes: { by_next_review_at: string };
  };
  session_history: {
    key: string;
    value: SessionResult;
  };
  settings: {
    key: string;
    value: Settings;
  };
  active_session: {
    key: string;
    value: SavedSession;
  };
}

const DB_NAME = 'bp-practice-app';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const progressStore = db.createObjectStore('progress', { keyPath: 'question_id' });
          // Unused this phase — added now so phase 4's Due Review mode needs no migration.
          progressStore.createIndex('by_next_review_at', 'next_review_at');
          db.createObjectStore('session_history', { keyPath: 'session_id' });
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('active_session', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}
