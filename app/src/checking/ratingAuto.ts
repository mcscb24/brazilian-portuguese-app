// Pure module — see checkAnswer.ts header.

import type { Rating } from '../review/types';
import type { CheckOutcome } from './checkAnswer';

// Per design doc §13: incorrect -> Again, correct (with or without an accent slip) -> Good.
// Correct-with-hint would auto-downgrade to Difficult, but no hint mechanic exists yet in Phase 2.
export function autoRatingForOutcome(outcome: CheckOutcome): Rating {
  return outcome === 'incorrect' ? 'again' : 'good';
}
