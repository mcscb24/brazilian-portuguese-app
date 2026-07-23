import { getDB, type Settings } from './db';

const SETTINGS_ID = 'settings';

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const existing = await db.get('settings', SETTINGS_ID);
  if (existing) return existing;
  const created: Settings = {
    id: SETTINGS_ID,
    last_seen_bundle_version: null,
    storage_persist_granted: false,
    first_launch_at: new Date().toISOString(),
  };
  await db.put('settings', created);
  return created;
}

export async function updateSettings(partial: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const current = await getSettings();
  const updated: Settings = { ...current, ...partial };
  const db = await getDB();
  await db.put('settings', updated);
  return updated;
}
