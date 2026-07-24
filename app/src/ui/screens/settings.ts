import { applyBackupImport, canShareFiles, downloadBackupFile, readBackupFile, shareBackupFile } from '../../backup/backupService';
import { BackupValidationError } from '../../backup/backupValidation';
import type { ContentBundle } from '../../content/types';
import { checkForUpdates } from '../../content/updates';
import { requestPersistentStorage } from '../../storage/persistence';
import { getSettings } from '../../storage/settingsStore';
import { showConfirmDialog } from '../dialog';
import { el } from '../dom';
import { formatDate } from '../format';
import type { Shell } from '../shell';

export function renderSettings(bundle: ContentBundle, shell: Shell): HTMLElement {
  const statusLine = el('p', { class: 'muted' }, ['Checking storage persistence status…']);

  const persistButton = el(
    'button',
    {
      onclick: async () => {
        const granted = await requestPersistentStorage();
        statusLine.textContent = granted
          ? 'Persistent storage is granted.'
          : 'Persistent storage was not granted by the browser.';
      },
    },
    ['Request persistent storage']
  );

  const checkUpdatesButton = el(
    'button',
    {
      onclick: async () => {
        checkUpdatesButton.setAttribute('disabled', '');
        checkUpdatesButton.textContent = 'Checking…';
        await checkForUpdates();
        checkUpdatesButton.textContent = 'Check for updates';
        checkUpdatesButton.removeAttribute('disabled');
      },
    },
    ['Check for updates']
  );

  // --- Backup & Restore ---

  const lastExportLine = el('p', {}, ['Last successful export: checking…']);
  const exportStatusLine = el('p', { class: 'muted' }, []);
  const importStatusLine = el('p', { class: 'muted' }, []);

  async function refreshLastExport(): Promise<void> {
    const settings = await getSettings();
    lastExportLine.textContent = `Last successful export: ${
      settings.last_backup_export_at ? formatDate(settings.last_backup_export_at) : 'Never'
    }`;
  }

  const exportButton = el(
    'button',
    {
      class: 'primary',
      onclick: async () => {
        exportButton.setAttribute('disabled', '');
        try {
          await downloadBackupFile(bundle);
          exportStatusLine.textContent = 'Backup exported.';
          await refreshLastExport();
        } catch (err) {
          exportStatusLine.textContent = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
          exportButton.removeAttribute('disabled');
        }
      },
    },
    ['Export backup']
  );

  const shareButton = el(
    'button',
    {
      hidden: !canShareFiles(),
      onclick: async () => {
        shareButton.setAttribute('disabled', '');
        try {
          const shared = await shareBackupFile(bundle);
          if (shared) {
            exportStatusLine.textContent = 'Backup shared.';
            await refreshLastExport();
          }
        } catch (err) {
          exportStatusLine.textContent = `Share failed: ${err instanceof Error ? err.message : String(err)}`;
        } finally {
          shareButton.removeAttribute('disabled');
        }
      },
    },
    ['Share backup…']
  );

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json',
    hidden: true,
    onchange: async (e: Event) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = ''; // reset so re-selecting the same filename still fires change next time
      if (!file) return;

      try {
        const backup = await readBackupFile(file);

        const bundleNote =
          backup.metadata.bundle_version !== bundle.bundle_version
            ? `\nNote: this backup was exported from content version ${backup.metadata.bundle_version}; ` +
              `this device has ${bundle.bundle_version}. Progress still applies by question id.`
            : '';
        const checkpointNote = backup.active_session
          ? '\nThis backup also has an in-progress session — it will become resumable on this ' +
            'device (Home screen), replacing any session currently saved here.'
          : '\nThis backup has no in-progress session — any session currently saved on this ' +
            'device will be cleared.';

        const message =
          `Exported ${formatDate(backup.metadata.exported_at)}: ${backup.progress.length} progress ` +
          `records, ${backup.session_history.length} past sessions.${bundleNote}${checkpointNote}\n\n` +
          'This replaces all progress and session history currently on this device and cannot be undone.';

        const confirmed = await showConfirmDialog('Import this backup?', message, 'Import', true);
        if (!confirmed) return;

        const result = await applyBackupImport(backup);
        importStatusLine.textContent =
          `Imported ${result.progressCount} progress records and ${result.sessionCount} past sessions.` +
          (result.hasActiveSession ? ' A resumable session is now available on Home.' : '');
      } catch (err) {
        importStatusLine.textContent =
          err instanceof BackupValidationError
            ? err.message
            : `Import failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  }) as HTMLInputElement;

  const importButton = el('button', { onclick: () => fileInput.click() }, ['Import backup']);

  void getSettings().then((settings) => {
    statusLine.textContent = settings.storage_persist_granted
      ? 'Persistent storage is granted.'
      : 'Persistent storage is not yet granted.';
  });
  void refreshLastExport();

  return el('div', { class: 'screen screen-settings' }, [
    el('h1', {}, ['Settings / About']),
    el('h2', {}, ['Content']),
    el('p', {}, [`Bundle version: ${bundle.bundle_version}`]),
    el('p', {}, [`Schema version: ${bundle.schema_version}`]),
    el('p', {}, [`Questions loaded: ${bundle.questions.length}`]),
    checkUpdatesButton,
    el('h2', {}, ['Storage']),
    statusLine,
    persistButton,
    el('h2', {}, ['Backup & Restore']),
    el('p', { class: 'muted' }, [
      'Export your progress to a file you can keep in Downloads, Google Drive, OneDrive, or a Syncthing-watched folder — this is how you stay protected if this phone is lost or replaced.',
    ]),
    lastExportLine,
    exportButton,
    shareButton,
    importButton,
    fileInput,
    exportStatusLine,
    importStatusLine,
    el('h2', {}, ['About']),
    el('p', { class: 'muted' }, [
      'Offline Brazilian Portuguese grammar practice, built from a personal Obsidian vault of grammar notes.',
    ]),
    el('button', { onclick: () => shell.goHome() }, ['Back to home']),
  ]);
}
