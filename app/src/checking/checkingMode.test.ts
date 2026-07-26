import { describe, expect, it } from 'vitest';
import { isSelfAssessedType } from './checkingMode';

describe('isSelfAssessedType', () => {
  it('returns true for each self-assessed type', () => {
    expect(isSelfAssessedType('open_completion')).toBe(true);
    expect(isSelfAssessedType('explain_difference')).toBe(true);
    expect(isSelfAssessedType('speak_aloud')).toBe(true);
    expect(isSelfAssessedType('verb_conjugation')).toBe(true);
    expect(isSelfAssessedType('conjugation_pattern')).toBe(true);
  });

  it('returns false for en_to_pt and other exact-mode types', () => {
    expect(isSelfAssessedType('en_to_pt')).toBe(false);
    expect(isSelfAssessedType('fill_blank')).toBe(false);
    expect(isSelfAssessedType('pt_to_en')).toBe(false);
  });
});
