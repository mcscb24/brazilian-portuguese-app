import type { ContentBundle } from '../../content/types';
import { checkForUpdates } from '../../content/updates';
import { requestPersistentStorage } from '../../storage/persistence';
import { getSettings } from '../../storage/settingsStore';
import { el } from '../dom';
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

  void getSettings().then((settings) => {
    statusLine.textContent = settings.storage_persist_granted
      ? 'Persistent storage is granted.'
      : 'Persistent storage is not yet granted.';
  });

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
    el('h2', {}, ['About']),
    el('p', { class: 'muted' }, [
      'Offline Brazilian Portuguese grammar practice, built from a personal Obsidian vault of grammar notes.',
    ]),
    el('button', { onclick: () => shell.goHome() }, ['Back to home']),
  ]);
}
