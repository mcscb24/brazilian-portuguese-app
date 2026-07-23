// Pure module: no imports from storage/ or ui/ — see Phase 2 plan's module-independence
// decision. Callers pass in a progress snapshot instead of this module reading storage itself.

import type { ContentBundle, Question, QuestionType } from '../content/types';
import type { ProgressRecord } from '../review/types';
import type { SessionConfig } from './types';

// Phase 2 only renders en_to_pt; other question types exist in the schema for forward
// compatibility but are excluded from selection until a later phase adds their UI.
export const SUPPORTED_TYPES_THIS_PHASE: readonly QuestionType[] = ['en_to_pt'];

export function distinctTopics(bundle: ContentBundle): string[] {
  return [...new Set(bundle.questions.map((q) => q.topic))].sort();
}

export function distinctSupportedTypes(bundle: ContentBundle): string[] {
  const bundleTypes = new Set(bundle.questions.map((q) => q.type));
  return SUPPORTED_TYPES_THIS_PHASE.filter((t) => bundleTypes.has(t));
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function selectQuestions(
  bundle: ContentBundle,
  config: SessionConfig,
  progressByQuestionId: Map<string, ProgressRecord>
): Question[] {
  const eligible = bundle.questions.filter((q) => {
    if (q.status !== 'approved') return false;
    if (!SUPPORTED_TYPES_THIS_PHASE.includes(q.type)) return false;
    if (!config.types.includes(q.type)) return false;
    if (!config.topics.includes(q.topic)) return false;
    const status = progressByQuestionId.get(q.id)?.user_status ?? 'active';
    if (status !== 'active' && !config.include_ignored) return false;
    return true;
  });

  const shuffled = shuffle(eligible);
  if (config.count === 'unlimited') return shuffled;
  return shuffled.slice(0, config.count);
}
