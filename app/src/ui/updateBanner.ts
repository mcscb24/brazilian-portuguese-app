import { applyUpdate, onUpdateAvailable } from '../content/updates';
import { el } from './dom';

// Design doc §6: update propagation isn't always picked up instantly, so a visible banner is
// required rather than relying on a silent background update the user might not notice.
export function mountUpdateBanner(root: HTMLElement): void {
  const show = () => {
    if (root.querySelector('[data-update-banner]')) return;
    const banner = el('div', { class: 'update-banner', 'data-update-banner': 'true' }, [
      'An update is available. ',
      el('button', { onclick: () => applyUpdate() }, ['Reload now']),
    ]);
    root.append(banner);
  };
  onUpdateAvailable(show);
}
