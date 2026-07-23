import './style.css';
import { loadBundle } from './content/loader';
import { initUpdates } from './content/updates';
import { requestPersistentStorage } from './storage/persistence';
import { el, mount } from './ui/dom';
import { Shell } from './ui/shell';
import { mountUpdateBanner } from './ui/updateBanner';

const appRoot = document.getElementById('app');
if (!appRoot) throw new Error('Missing #app root element.');

// Separate containers so the update banner survives screen navigation — Shell.mount() clears
// and replaces only the screen container, never appRoot itself.
const bannerContainer = el('div', { class: 'banner-container' }, []);
const screenContainer = el('div', { class: 'screen-container' }, []);
appRoot.append(bannerContainer, screenContainer);

initUpdates();
mountUpdateBanner(bannerContainer);
void requestPersistentStorage();

function renderLoadError(message: string): void {
  mount(
    screenContainer,
    el('div', { class: 'screen screen-error' }, [
      el('h1', {}, ['Could not load content']),
      el('p', {}, [message]),
      el('button', { class: 'primary', onclick: () => void bootstrap() }, ['Retry']),
    ])
  );
}

async function bootstrap(): Promise<void> {
  const result = await loadBundle();
  if (!result.ok) {
    renderLoadError(result.message);
    return;
  }
  const shell = new Shell(screenContainer, result.bundle);
  shell.goHome();
}

void bootstrap();
