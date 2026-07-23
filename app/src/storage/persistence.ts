import { updateSettings } from './settingsStore';

// Best-effort: Android can otherwise evict this site's storage under pressure (design doc §6).
// The periodic backup export remains the real safety net regardless of what this returns.
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;

  const alreadyPersisted = (await navigator.storage.persisted?.()) ?? false;
  if (alreadyPersisted) {
    await updateSettings({ storage_persist_granted: true });
    return true;
  }

  const granted = await navigator.storage.persist();
  await updateSettings({ storage_persist_granted: granted });
  return granted;
}
