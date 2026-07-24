import type { ContentBundle } from '../content/types';
import { clearActiveSession, getActiveSession, putActiveSession } from '../storage/activeSessionStore';
import { getAllProgress, replaceAllProgress } from '../storage/progressStore';
import { getAllSessionResults, replaceAllSessionResults } from '../storage/sessionHistoryStore';
import { updateSettings } from '../storage/settingsStore';
import { BackupValidationError, parseBackupJson } from './backupValidation';
import { BACKUP_SCHEMA_VERSION, type ProgressBackupFile } from './types';

export interface BackupImportResult {
  progressCount: number;
  sessionCount: number;
  hasActiveSession: boolean;
}

function backupFileName(exportedAt: string): string {
  return `bp-practice-backup-${exportedAt.replace(/[:.]/g, '-')}.json`;
}

export async function buildBackupFile(bundle: ContentBundle): Promise<ProgressBackupFile> {
  const [progressByQuestionId, sessionHistory, activeSession] = await Promise.all([
    getAllProgress(),
    getAllSessionResults(),
    getActiveSession(),
  ]);
  return {
    metadata: {
      backup_schema_version: BACKUP_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      bundle_version: bundle.bundle_version,
    },
    progress: [...progressByQuestionId.values()],
    session_history: sessionHistory,
    active_session: activeSession,
  };
}

// Standard <a download> blob technique — lands in Android's /Download/, matching the design
// doc's Syncthing-watched-folder mechanism (docs/design.md §16). Guaranteed to work regardless of
// Web Share API support, so this stays available even when shareBackupFile isn't offered.
export async function downloadBackupFile(bundle: ContentBundle): Promise<void> {
  const backup = await buildBackupFile(bundle);
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backupFileName(backup.metadata.exported_at);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  await updateSettings({ last_backup_export_at: backup.metadata.exported_at });
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
  return navigator.canShare({ files: [probe] });
}

// Extra "share straight to Drive/OneDrive" path the download-only mechanism can't provide on its
// own (Web Share API Level 2, feature-detected via canShareFiles()). A user cancel (AbortError) is
// a no-op, not an error.
export async function shareBackupFile(bundle: ContentBundle): Promise<boolean> {
  const backup = await buildBackupFile(bundle);
  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], backupFileName(backup.metadata.exported_at), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'BP Practice backup' });
    await updateSettings({ last_backup_export_at: backup.metadata.exported_at });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}

export async function readBackupFile(file: File): Promise<ProgressBackupFile> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupValidationError('This file is not valid JSON and cannot be imported.');
  }
  return parseBackupJson(raw);
}

// Fully replaces progress/session_history (design doc §16's single-writer, no-merge philosophy),
// and makes the local active-session checkpoint match the backup's — restoring it if present,
// clearing it if the backup had none — so a replacement phone can resume an interrupted session
// after restore, or correctly ends up with no resumable session if the backup didn't have one.
export async function applyBackupImport(backup: ProgressBackupFile): Promise<BackupImportResult> {
  await replaceAllProgress(backup.progress);
  await replaceAllSessionResults(backup.session_history);
  if (backup.active_session) {
    await putActiveSession(backup.active_session);
  } else {
    await clearActiveSession();
  }
  return {
    progressCount: backup.progress.length,
    sessionCount: backup.session_history.length,
    hasActiveSession: backup.active_session !== null,
  };
}
