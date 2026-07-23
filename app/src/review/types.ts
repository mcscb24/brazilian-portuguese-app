// Types only. review/scheduler.ts stays pure — no storage/UI imports live here either.

export type Rating = 'again' | 'difficult' | 'good' | 'easy';

export type UserStatus = 'active' | 'ignored' | 'flagged_bad' | 'needs_editing' | 'duplicate';

export interface HistoryEntry {
  at: string;
  rating: Rating;
  hint_used: boolean;
}

export interface ProgressRecord {
  question_id: string;
  last_seen_version: number;
  user_status: UserStatus;
  user_status_reason: string | null;
  attempts: number;
  correct: number;
  incorrect: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  ease: number;
  interval_days: number;
  recent_history: HistoryEntry[];
}
