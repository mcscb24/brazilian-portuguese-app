// Pure module: no imports from storage/, ui/, session/, or review/ — only content/types (type-only).
// See checkAnswer.ts header. Mirrors vault-tools/publish.js's own SELF_ASSESSED_TYPES set,
// independently maintained on each side (design doc §7: app and vault-tools share only the JSON
// schema, not code).

import type { QuestionType } from '../content/types';

export const SELF_ASSESSED_TYPES: ReadonlySet<QuestionType> = new Set([
  'open_completion',
  'explain_difference',
  'speak_aloud',
]);

export function isSelfAssessedType(type: QuestionType): boolean {
  return SELF_ASSESSED_TYPES.has(type);
}
