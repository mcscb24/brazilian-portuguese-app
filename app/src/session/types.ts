import type { Rating } from '../review/types';

export type SourceFilter = 'random' | 'topic' | 'weak' | 'mistakes' | 'due' | 'custom';

export interface SessionConfig {
  count: number | 'unlimited';
  topics: string[];
  types: string[];
  source_filter: SourceFilter;
  include_ignored: boolean;
}

// "correct_accent_only" is additive to the design doc §9 schema (see Phase 2 plan's
// ignore/flag-mid-session decision) so the summary's accent-only breakdown needs no new field.
export type FinalResult = 'correct' | 'correct_accent_only' | 'incorrect' | 'ignored_mid_session';

export interface SessionItem {
  question_id: string;
  version: number;
  final_result: FinalResult;
  final_rating: Rating | null;
  requeued: boolean;
}

export interface SessionSummary {
  answered: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  weakest_topics: string[];
}

export interface SessionResult {
  session_id: string;
  config: SessionConfig;
  items: SessionItem[];
  summary: SessionSummary;
}

export interface TopicBreakdown {
  topic: string;
  correct: number;
  incorrect: number;
  accuracy: number;
}

export interface IncorrectItem {
  question_id: string;
  prompt: string;
  topic: string;
}

// UI-facing detail beyond the persisted SessionResult.summary schema — derived on demand from
// items + the bundle, never itself persisted.
export interface DisplaySummary {
  answered: number;
  correct: number;
  correct_accent_only: number;
  incorrect: number;
  ignored_or_flagged: number;
  accuracy: number;
  topic_breakdown: TopicBreakdown[];
  incorrect_items: IncorrectItem[];
}

// A resumable checkpoint of an in-progress session (Phase 2.1). Singleton row in the
// active_session store, keyed by the fixed id below — at most one session can be "in progress"
// at a time in this single-user app.
export interface SavedSession {
  id: 'active';
  session_id: string;
  config: SessionConfig;
  queue_entries: string[]; // full ordered question_id list, including any Again-requeue duplicate
  cursor: number;
  requeue_used: string[]; // question_ids that already used their one-shot requeue
  items: SessionItem[]; // completed items so far
  started_at: string;
  last_active_at: string;
}
