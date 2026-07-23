import type { ContentBundle } from '../../content/types';
import { el } from '../dom';
import type { Shell } from '../shell';

export function renderHome(bundle: ContentBundle, shell: Shell): HTMLElement {
  return el('div', { class: 'screen screen-home' }, [
    el('h1', {}, ['BP Practice']),
    el('p', { class: 'muted' }, [`Content version: ${bundle.bundle_version}`]),
    el(
      'button',
      { class: 'primary', onclick: () => shell.goSessionSetup() },
      ['Start a session']
    ),
    el('button', { onclick: () => shell.goSettings() }, ['Settings / About']),
  ]);
}
