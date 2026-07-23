import { describe, expect, it } from 'vitest';
import { checkAnswer } from './checkAnswer';
import type { Question } from '../content/types';

// Fixtures below are copied verbatim from the live app/public/content-bundle.json
// (pronouns-direct-object-0001/0002/0006/0007) rather than a synthetic bundle, per the
// Phase 2 plan's verification item 3 — these are the app's real multi-answer questions.
function realQuestion(id: string, prompt: string, acceptedTexts: string[]): Question {
  return {
    id,
    version: 1,
    content_hash: 'sha256:fixture',
    type: 'en_to_pt',
    topic: 'Pronouns',
    subtopic: 'Direct object pronouns',
    direction: 'en_to_pt',
    difficulty: 'medium',
    register: 'spoken',
    prompt,
    accepted_answers: acceptedTexts.map((text) => ({ text, accent_sensitive: true })),
    explanation: 'fixture',
    source: { note: 'Grammar/Pronouns/Direct Object Pronouns.md', heading: 'Mini practice' },
    status: 'approved',
    generation_version: 1,
    created_at: '2026-07-23',
    updated_at: '2026-07-23',
  };
}

const q0001 = realQuestion('pronouns-direct-object-0001', 'I saw him.', ['Eu vi ele.', 'Eu o vi.']);
const q0002 = realQuestion('pronouns-direct-object-0002', 'I know her.', ['Eu conheço ela.', 'Eu a conheço.']);
const q0006 = realQuestion('pronouns-direct-object-0006', 'I love you.', ['Eu te amo.', 'Eu amo você.']);
const q0007 = realQuestion('pronouns-direct-object-0007', 'I saw you.', ['Eu te vi.', 'Eu vi você.']);

describe('checkAnswer — real multi-answer questions', () => {
  it('accepts either accepted form for pronouns-direct-object-0001', () => {
    expect(checkAnswer('Eu vi ele.', q0001).outcome).toBe('correct');
    expect(checkAnswer('Eu o vi.', q0001).outcome).toBe('correct');
  });

  it('accepts either accepted form for pronouns-direct-object-0002', () => {
    expect(checkAnswer('Eu conheço ela.', q0002).outcome).toBe('correct');
    expect(checkAnswer('Eu a conheço.', q0002).outcome).toBe('correct');
  });

  it('accepts either accepted form for pronouns-direct-object-0006', () => {
    expect(checkAnswer('Eu te amo.', q0006).outcome).toBe('correct');
    expect(checkAnswer('Eu amo você.', q0006).outcome).toBe('correct');
  });

  it('accepts either accepted form for pronouns-direct-object-0007', () => {
    expect(checkAnswer('Eu te vi.', q0007).outcome).toBe('correct');
    expect(checkAnswer('Eu vi você.', q0007).outcome).toBe('correct');
  });

  it('normalises whitespace, case, and trailing punctuation', () => {
    expect(checkAnswer('  eu VI   ele  ', q0001).outcome).toBe('correct');
    expect(checkAnswer('Eu vi ele', q0001).outcome).toBe('correct');
    expect(checkAnswer('Eu vi ele!!!', q0001).outcome).toBe('correct');
  });

  it('classifies an accent-stripped match on a real cedilla+accent answer as correct_accent_only', () => {
    expect(checkAnswer('Eu conheco ela.', q0002).outcome).toBe('correct_accent_only');
    expect(checkAnswer('Eu amo voce.', q0006).outcome).toBe('correct_accent_only');
  });

  it('classifies an unrelated answer as incorrect', () => {
    expect(checkAnswer('Eu gosto de café.', q0001).outcome).toBe('incorrect');
  });

  it('returns incorrect when the question has no accepted answers', () => {
    const bare = realQuestion('fixture-empty', 'test', []);
    expect(checkAnswer('anything', bare).outcome).toBe('incorrect');
  });
});
