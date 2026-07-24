import type { ContentBundle } from '../../content/types';
import { clearActiveSession, getActiveSession } from '../../storage/activeSessionStore';
import { getSettings } from '../../storage/settingsStore';
import { showConfirmDialog } from '../dialog';
import { el } from '../dom';
import { formatRelativeTime } from '../format';
import type { Shell } from '../shell';

const BACKUP_REMINDER_THRESHOLD_DAYS = 7;

export function renderHome(bundle: ContentBundle, shell: Shell): HTMLElement {
  const resumeContainer = el('div', {}, []);
  const reminderContainer = el('div', {}, []);

  const container = el('div', { class: 'screen screen-home' }, [
    el('h1', {}, ['BP Practice']),
    el('p', { class: 'muted' }, [`Content version: ${bundle.bundle_version}`]),
    resumeContainer,
    el('button', { class: 'primary', onclick: () => shell.goSessionSetup() }, ['Start a session']),
    el('button', { onclick: () => shell.goSettings() }, ['Settings / About']),
    reminderContainer,
  ]);

  // Sync render above, then patch in from an async fetch — matches the existing settings.ts
  // pattern rather than making renderHome/Shell.goHome async.
  void getActiveSession().then((saved) => {
    if (!saved) return;
    const answered = saved.items.length;
    const progressText =
      saved.config.count === 'unlimited' ? `${answered} completed` : `${answered} of ${saved.config.count} completed`;

    const card = el('div', { class: 'resume-card' }, [
      el('h2', {}, ['Resume session']),
      el('p', {}, [progressText]),
      el('p', { class: 'muted' }, [`Last active ${formatRelativeTime(saved.last_active_at)}`]),
      el('div', {}, [
        el('button', { class: 'primary', onclick: () => void shell.resumeSession() }, ['Resume']),
        el(
          'button',
          {
            class: 'danger',
            onclick: async () => {
              const confirmed = await showConfirmDialog(
                'Discard saved session?',
                'This permanently discards your in-progress session and cannot be undone.',
                'Discard',
                true
              );
              if (!confirmed) return;
              await clearActiveSession();
              card.remove();
            },
          },
          ['Discard']
        ),
      ]),
    ]);
    resumeContainer.append(card);
  });

  void getSettings().then((settings) => {
    const referenceIso = settings.last_backup_export_at ?? settings.first_launch_at;
    const daysSince = (Date.now() - new Date(referenceIso).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < BACKUP_REMINDER_THRESHOLD_DAYS) return;

    const message = settings.last_backup_export_at
      ? "You haven't backed up your progress in a while. "
      : "You haven't backed up your progress yet. ";
    reminderContainer.append(
      el('p', { class: 'muted backup-reminder' }, [
        message,
        el(
          'a',
          {
            href: '#',
            onclick: (e: Event) => {
              e.preventDefault();
              shell.goSettings();
            },
          },
          ['Back up now']
        ),
      ])
    );
  });

  return container;
}
