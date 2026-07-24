// Types only. Mirrors content/types.ts's "no logic here" convention.

import type { ProgressRecord } from '../review/types';
import type { SavedSession, SessionResult } from '../session/types';

// Independent of the content bundle's schema_version — this is the backup *file format's* own
// version, so old backup files can be rejected with a clear message if the format ever changes.
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupMetadata {
  backup_schema_version: number;
  exported_at: string;
  bundle_version: string;
}

export interface ProgressBackupFile {
  metadata: BackupMetadata;
  progress: ProgressRecord[];
  session_history: SessionResult[];
  active_session: SavedSession | null;
}
