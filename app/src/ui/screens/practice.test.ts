// @vitest-environment jsdom
//
// Regression coverage for the disappearing-prompt bug: both feedback phases used to drop the
// question prompt as soon as feedback replaced the question phase, leaving the user looking at
// an answer/outcome with no memory of what was asked. Drives a real SessionRunner + Shell through
// renderPractice()'s actual DOM output (no exported internals to unit-test directly) rather than
// mocking either collaborator.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContentBundle, Question } from '../../content/types';
import type { SessionConfig } from '../../session/types';
import { SessionRunner } from '../../session/sessionRunner';
import type { Shell } from '../shell';
import { renderPractice } from './practice';

// A minimal stand-in for Shell rather than the real class: the real Shell drags in every screen
// module (settings -> content/updates.ts -> the `virtual:pwa-register` Vite plugin module), which
// only resolves inside Vite's own build pipeline and breaks under plain vitest. renderPractice
// only ever calls these three members on its shell argument.
function makeFakeShell(): Shell {
  return {
    setExitHandler: () => {},
    goHome: () => {},
    goSessionSummaryFrom: () => {},
  } as unknown as Shell;
}

function makeQuestion(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    version: 1,
    content_hash: 'sha256:fixture',
    type: 'en_to_pt',
    topic: 'A',
    subtopic: 'A',
    direction: 'en_to_pt',
    difficulty: 'easy',
    register: 'neutral',
    prompt: `Prompt for ${id}`,
    accepted_answers: [{ text: id, accent_sensitive: false }],
    explanation: `Explanation for ${id}`,
    source: { note: 'fixture.md', heading: 'Fixture' },
    status: 'approved',
    generation_version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBundle(questions: Question[]): ContentBundle {
  return { schema_version: 1, bundle_version: 'test-1', questions, scenarios: [], notes: [] };
}

const baseConfig: SessionConfig = {
  count: 1,
  topics: ['A'],
  types: [],
  source_filter: 'random',
  include_ignored: false,
};

function clickButtonWithText(container: HTMLElement, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);
  if (!button) throw new Error(`no button with text "${text}" found`);
  button.click();
}

describe('renderPractice: question prompt stays visible during feedback', () => {
  beforeEach(() => {
    indexedDB = new IDBFactory();
  });

  it('keeps the prompt visible after submitting a checked (exact-answer) question', async () => {
    const question = makeQuestion('q1', {
      type: 'en_to_pt',
      prompt: 'Translate: the cat',
      accepted_answers: [{ text: 'o gato', accent_sensitive: false }],
    });
    const bundle = makeBundle([question]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, types: ['en_to_pt'] });
    const shell = makeFakeShell();

    const container = renderPractice(runner, shell);
    document.body.append(container);

    const input = container.querySelector('#answer-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = 'o gato';
    clickButtonWithText(container, 'Submit');

    expect(container.querySelector('.outcome')).toBeTruthy();
    expect(container.querySelector('.prompt')?.textContent).toBe('Translate: the cat');
  });

  it('keeps the prompt visible after revealing a self-assessed question', async () => {
    const question = makeQuestion('q2', {
      type: 'open_completion',
      prompt: 'Complete: Eu ___ português.',
      accepted_answers: undefined,
      model_answers: ['falo'],
    });
    const bundle = makeBundle([question]);
    const runner = await SessionRunner.start(bundle, { ...baseConfig, types: ['open_completion'] });
    const shell = makeFakeShell();

    const container = renderPractice(runner, shell);
    document.body.append(container);

    clickButtonWithText(container, 'Reveal answer');

    expect(container.querySelector('.reveal-section')).toBeTruthy();
    expect(container.querySelector('.prompt')?.textContent).toBe('Complete: Eu ___ português.');
  });
});
