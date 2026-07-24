import { getDB, type Settings } from './db';

const SETTINGS_ID = 'settings';

// Adding a field here needs no IDB version bump (stores are schemaless per-value) — just this
// default-merge on read, so existing rows written before the field existed still get a sane value.
function defaultSettings(): Omit<Settings, 'id'> {
  return {
    last_seen_bundle_version: null,
    storage_persist_granted: false,
    first_launch_at: new Date().toISOString(),
    last_backup_export_at: null,
  };
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB();
  const existing = await db.get('settings', SETTINGS_ID);
  if (existing) return { ...defaultSettings(), ...existing, id: SETTINGS_ID };
  const created: Settings = { id: SETTINGS_ID, ...defaultSettings() };
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
