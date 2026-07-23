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
