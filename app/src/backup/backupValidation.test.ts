import { describe, expect, it, vi } from 'vitest';
import type { ProgressRecord } from '../review/types';
import type { SavedSession, SessionResult } from '../session/types';
import { BackupValidationError, parseBackupJson } from './backupValidation';
import { BACKUP_SCHEMA_VERSION } from './types';

function makeProgress(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    question_id: 'q1',
    last_seen_version: 1,
    user_status: 'active',
    user_status_reason: null,
    attempts: 1,
    correct: 1,
    incorrect: 0,
    last_reviewed_at: '2026-01-01T00:00:00Z',
    next_review_at: '2026-01-04T00:00:00Z',
    ease: 2.5,
    interval_days: 3,
    recent_history: [],
    ...overrides,
  };
}

function makeSessionResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    session_id: '2026-01-01T00:00:00Z',
    config: { count: 10, topics: ['A'], types: ['en_to_pt'], source_filter: 'random', include_ignored: false },
    items: [],
    summary: { answered: 0, correct: 0, incorrect: 0, accuracy: 0, weakest_topics: [] },
    ...overrides,
  };
}

function makeSavedSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: 'active',
    session_id: '2026-01-01T00:00:00Z',
    config: { count: 10, topics: ['A'], types: ['en_to_pt'], source_filter: 'random', include_ignored: false },
    queue_entries: ['q1', 'q2'],
    cursor: 1,
    requeue_used: [],
    items: [],
    started_at: '2026-01-01T00:00:00Z',
    last_active_at: '2026-01-01T00:05:00Z',
    ...overrides,
  };
}

function makeValidFile(overrides: Record<string, unknown> = {}) {
  return {
    metadata: { backup_schema_version: BACKUP_SCHEMA_VERSION, exported_at: '2026-01-01T00:00:00Z', bundle_version: 'v1' },
    progress: [makeProgress()],
    session_history: [makeSessionResult()],
    active_session: makeSavedSession(),
    ...overrides,
  };
}

describe('parseBackupJson', () => {
  it('parses a valid backup file', () => {
    const parsed = parseBackupJson(makeValidFile());
    expect(parsed.progress).toHaveLength(1);
    expect(parsed.session_history).toHaveLength(1);
    expect(parsed.active_session).not.toBeNull();
    expect(parsed.metadata.bundle_version).toBe('v1');
  });

  it('throws when metadata is missing', () => {
    const file = makeValidFile();
    delete (file as Record<string, unknown>).metadata;
    expect(() => parseBackupJson(file)).toThrow(BackupValidationError);
  });

  it('throws when progress array is missing', () => {
    const file = makeValidFile();
    delete (file as Record<string, unknown>).progress;
    expect(() => parseBackupJson(file)).toThrow(BackupValidationError);
  });

  it('throws on an unsupported backup_schema_version', () => {
    const file = makeValidFile({
      metadata: { backup_schema_version: 999, exported_at: '2026-01-01T00:00:00Z', bundle_version: 'v1' },
    });
    expect(() => parseBackupJson(file)).toThrow(BackupValidationError);
  });

  it('accepts an empty progress array (not an error)', () => {
    const parsed = parseBackupJson(makeValidFile({ progress: [] }));
    expect(parsed.progress).toEqual([]);
  });

  it('defaults session_history to [] when absent', () => {
    const file = makeValidFile();
    delete (file as Record<string, unknown>).session_history;
    const parsed = parseBackupJson(file);
    expect(parsed.session_history).toEqual([]);
  });

  it('skips a malformed progress entry with a warning, keeping valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseBackupJson(
      makeValidFile({ progress: [makeProgress({ question_id: 'good' }), { bogus: true }] })
    );
    expect(parsed.progress).toHaveLength(1);
    expect(parsed.progress[0].question_id).toBe('good');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a malformed session_history entry with a warning, keeping valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseBackupJson(
      makeValidFile({ session_history: [makeSessionResult(), { bogus: true }] })
    );
    expect(parsed.session_history).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats a missing active_session as null (not an error)', () => {
    const parsed = parseBackupJson(makeValidFile({ active_session: null }));
    expect(parsed.active_session).toBeNull();
  });

  it('treats a malformed active_session as null with a warning, without failing the whole import', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseBackupJson(makeValidFile({ active_session: { bogus: true } }));
    expect(parsed.active_session).toBeNull();
    expect(parsed.progress).toHaveLength(1); // rest of the file still parsed successfully
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
