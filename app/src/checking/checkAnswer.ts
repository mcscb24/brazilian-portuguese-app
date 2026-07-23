// Pure module: no imports from storage/, ui/, session/, or review/ — only content/types (type-only)
// and the sibling normalise helpers. See Phase 2 plan's module-independence decision.

import type { Question } from '../content/types';
import { normaliseSurface, stripAccents } from './normalise';

export type CheckOutcome = 'correct' | 'correct_accent_only' | 'incorrect';

export interface CheckResult {
  outcome: CheckOutcome;
  matchedAnswer?: string;
}

export function checkAnswer(input: string, question: Question): CheckResult {
  const accepted = question.accepted_answers ?? [];
  const normalisedInput = normaliseSurface(input);

  for (const answer of accepted) {
    if (normaliseSurface(answer.text) === normalisedInput) {
      return { outcome: 'correct', matchedAnswer: answer.text };
    }
  }

  const strippedInput = stripAccents(normalisedInput);
  for (const answer of accepted) {
    if (!answer.accent_sensitive) continue;
    if (stripAccents(normaliseSurface(answer.text)) === strippedInput) {
      return { outcome: 'correct_accent_only', matchedAnswer: answer.text };
    }
  }

  return { outcome: 'incorrect' };
}
