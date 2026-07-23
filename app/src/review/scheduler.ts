// Pure module: no imports from storage/, ui/, session/, or checking/ — see Phase 2 plan's
// module-independence decision. Operates only on plain ProgressRecord snapshots.

import { INITIAL_EASE, MAX_EASE, MAX_INTERVAL_DAYS, MIN_EASE, RECENT_HISTORY_LIMIT } from './constants';
import type { ProgressRecord, Rating } from './types';

export function createInitialProgress(questionId: string, version: number): ProgressRecord {
  return {
    question_id: questionId,
    last_seen_version: version,
    user_status: 'active',
    user_status_reason: null,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    last_reviewed_at: null,
    next_review_at: null,
    ease: INITIAL_EASE,
    interval_days: 0,
    recent_history: [],
  };
}

function clampInterval(days: number): number {
  return Math.max(1, Math.min(MAX_INTERVAL_DAYS, Math.round(days)));
}

export interface ScheduleUpdate {
  ease: number;
  interval_days: number;
  next_review_at: string;
}

export function scheduleNext(progress: ProgressRecord, rating: Rating, now: Date = new Date()): ScheduleUpdate {
  const isFirstAttempt = progress.attempts === 0;
  let ease = progress.ease;
  let intervalDays: number;

  if (isFirstAttempt) {
    intervalDays = rating === 'good' ? 3 : rating === 'easy' ? 4 : 1;
  } else {
    switch (rating) {
      case 'again':
        intervalDays = 1;
        ease = Math.max(MIN_EASE, ease - 0.2);
        break;
      case 'difficult':
        intervalDays = progress.interval_days * 1.2;
        break;
      case 'good':
        intervalDays = progress.interval_days * ease;
        break;
      case 'easy':
        intervalDays = progress.interval_days * ease * 1.3;
        ease = Math.min(MAX_EASE, ease + 0.15);
        break;
    }
  }

  intervalDays = clampInterval(intervalDays);
  const nextReviewAt = new Date(now.getTime() + intervalDays * 86400000).toISOString();
  return { ease, interval_days: intervalDays, next_review_at: nextReviewAt };
}

export function applyAttempt(
  progress: ProgressRecord,
  rating: Rating,
  wasCorrect: boolean,
  hintUsed: boolean,
  now: Date = new Date()
): ProgressRecord {
  const schedule = scheduleNext(progress, rating, now);
  const recent_history = [
    ...progress.recent_history,
    { at: now.toISOString(), rating, hint_used: hintUsed },
  ].slice(-RECENT_HISTORY_LIMIT);

  return {
    ...progress,
    attempts: progress.attempts + 1,
    correct: progress.correct + (wasCorrect ? 1 : 0),
    incorrect: progress.incorrect + (wasCorrect ? 0 : 1),
    last_reviewed_at: now.toISOString(),
    next_review_at: schedule.next_review_at,
    interval_days: schedule.interval_days,
    ease: schedule.ease,
    recent_history,
  };
}
