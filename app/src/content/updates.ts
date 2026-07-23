import { registerSW } from 'virtual:pwa-register';

type UpdateListener = () => void;

let needRefresh = false;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
const listeners = new Set<UpdateListener>();

export function initUpdates(): void {
  updateSWFn = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((listener) => listener());
    },
  });
}

export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isUpdateAvailable(): boolean {
  return needRefresh;
}

export async function applyUpdate(): Promise<void> {
  if (updateSWFn) await updateSWFn(true);
}

// Manual "check for updates" action (Settings screen) — nudges the registered service worker
// to look for a new version instead of waiting for the browser's own opportunistic checks.
export async function checkForUpdates(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const registration of registrations) {
    await registration.update();
  }
}
