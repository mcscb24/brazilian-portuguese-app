import type { ProgressRecord } from '../review/types';
import type { SavedSession, SessionResult } from '../session/types';
import { BACKUP_SCHEMA_VERSION, type ProgressBackupFile } from './types';

export const SUPPORTED_BACKUP_SCHEMA_VERSIONS = [BACKUP_SCHEMA_VERSION];

export class BackupValidationError extends Error {}

function isProgressRecordShapeValid(p: unknown): p is ProgressRecord {
  if (typeof p !== 'object' || p === null) return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.question_id === 'string' &&
    typeof r.last_seen_version === 'number' &&
    typeof r.user_status === 'string' &&
    (r.user_status_reason === null || typeof r.user_status_reason === 'string') &&
    typeof r.attempts === 'number' &&
    typeof r.correct === 'number' &&
    typeof r.incorrect === 'number' &&
    (r.last_reviewed_at === null || typeof r.last_reviewed_at === 'string') &&
    (r.next_review_at === null || typeof r.next_review_at === 'string') &&
    typeof r.ease === 'number' &&
    typeof r.interval_days === 'number' &&
    Array.isArray(r.recent_history)
  );
}

function isSessionResultShapeValid(s: unknown): s is SessionResult {
  if (typeof s !== 'object' || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.session_id === 'string' &&
    typeof r.config === 'object' &&
    r.config !== null &&
    Array.isArray(r.items) &&
    typeof r.summary === 'object' &&
    r.summary !== null
  );
}

function isSavedSessionShapeValid(s: unknown): s is SavedSession {
  if (typeof s !== 'object' || s === null) return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.session_id === 'string' &&
    typeof r.config === 'object' &&
    r.config !== null &&
    Array.isArray(r.queue_entries) &&
    typeof r.cursor === 'number' &&
    Array.isArray(r.requeue_used) &&
    Array.isArray(r.items) &&
    typeof r.started_at === 'string' &&
    typeof r.last_active_at === 'string'
  );
}

// Hard failures throw (blocking error, shown to the user before any import happens). A malformed
// individual progress/session_history entry is skipped with a console warning rather than failing
// the whole file, mirroring content/bundleValidation.ts's tolerant-skip convention. Unlike a
// content bundle, an empty progress array is valid — a fresh install has no progress yet.
export function parseBackupJson(raw: unknown): ProgressBackupFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupValidationError('This file is not a valid backup (not a JSON object).');
  }
  const data = raw as Record<string, unknown>;

  const metadata = data.metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    throw new BackupValidationError('This file is missing its backup metadata and cannot be imported.');
  }
  const m = metadata as Record<string, unknown>;
  if (
    typeof m.backup_schema_version !== 'number' ||
    !SUPPORTED_BACKUP_SCHEMA_VERSIONS.includes(m.backup_schema_version)
  ) {
    throw new BackupValidationError(
      `This backup's format (version ${JSON.stringify(m.backup_schema_version)}) isn't supported by this app version.`
    );
  }
  if (typeof m.exported_at !== 'string' || typeof m.bundle_version !== 'string') {
    throw new BackupValidationError('This file is missing required backup metadata fields.');
  }

  if (!Array.isArray(data.progress)) {
    throw new BackupValidationError('This file is missing its progress data and cannot be imported.');
  }

  const progress: ProgressRecord[] = [];
  for (const p of data.progress) {
    if (isProgressRecordShapeValid(p)) progress.push(p);
    else console.warn('Skipping malformed progress record in backup file:', p);
  }

  const sessionHistoryRaw = Array.isArray(data.session_history) ? data.session_history : [];
  const session_history: SessionResult[] = [];
  for (const s of sessionHistoryRaw) {
    if (isSessionResultShapeValid(s)) session_history.push(s);
    else console.warn('Skipping malformed session history entry in backup file:', s);
  }

  // A broken checkpoint shouldn't block restoring the more important progress/history data, so
  // this falls back to null with a warning rather than throwing.
  let active_session: SavedSession | null = null;
  if (data.active_session !== null && data.active_session !== undefined) {
    if (isSavedSessionShapeValid(data.active_session)) {
      active_session = data.active_session;
    } else {
      console.warn('Ignoring malformed active_session checkpoint in backup file:', data.active_session);
    }
  }

  return {
    metadata: {
      backup_schema_version: m.backup_schema_version,
      exported_at: m.exported_at,
      bundle_version: m.bundle_version,
    },
    progress,
    session_history,
    active_session,
  };
}
