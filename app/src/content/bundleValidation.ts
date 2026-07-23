import type { ContentBundle, Note, Question, Scenario } from './types';

export const SUPPORTED_SCHEMA_VERSIONS = [1];

export class BundleValidationError extends Error {}

function isQuestionShapeValid(q: unknown): q is Question {
  if (typeof q !== 'object' || q === null) return false;
  const r = q as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.type === 'string' &&
    typeof r.topic === 'string' &&
    typeof r.prompt === 'string' &&
    typeof r.explanation === 'string' &&
    typeof r.difficulty === 'string' &&
    typeof r.register === 'string' &&
    typeof r.status === 'string' &&
    typeof r.version === 'number' &&
    typeof r.source === 'object' &&
    r.source !== null &&
    typeof (r.source as Record<string, unknown>).note === 'string' &&
    typeof (r.source as Record<string, unknown>).heading === 'string'
  );
}

function isNoteShapeValid(n: unknown): n is Note {
  if (typeof n !== 'object' || n === null) return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.path === 'string' &&
    typeof r.title === 'string' &&
    typeof r.topic === 'string' &&
    Array.isArray(r.headings) &&
    typeof r.body_markdown === 'string'
  );
}

// Hard failures throw (blocking error state, see Phase 2 plan's bundle-validation rules).
// A malformed individual question/note is skipped with a console warning, not a hard failure.
export function validateBundle(data: unknown): ContentBundle {
  if (typeof data !== 'object' || data === null) {
    throw new BundleValidationError('Downloaded content is not a valid bundle (not an object).');
  }
  const raw = data as Record<string, unknown>;

  if (typeof raw.schema_version !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(raw.schema_version)) {
    throw new BundleValidationError(
      `Unsupported content bundle schema_version: ${JSON.stringify(raw.schema_version)}.`
    );
  }
  if (typeof raw.bundle_version !== 'string') {
    throw new BundleValidationError('Bundle is missing a valid bundle_version.');
  }
  if (!Array.isArray(raw.questions)) {
    throw new BundleValidationError('Bundle is missing a questions array.');
  }
  if (!Array.isArray(raw.notes)) {
    throw new BundleValidationError('Bundle is missing a notes array.');
  }
  const scenarios: Scenario[] = Array.isArray(raw.scenarios) ? (raw.scenarios as Scenario[]) : [];

  const questions: Question[] = [];
  for (const q of raw.questions) {
    if (isQuestionShapeValid(q)) {
      questions.push(q);
    } else {
      console.warn('Skipping malformed question in content bundle:', q);
    }
  }
  if (questions.length === 0) {
    throw new BundleValidationError('Bundle contains zero usable questions after validation.');
  }

  const notes: Note[] = [];
  for (const n of raw.notes) {
    if (isNoteShapeValid(n)) {
      notes.push(n);
    } else {
      console.warn('Skipping malformed note in content bundle:', n);
    }
  }

  return {
    schema_version: raw.schema_version,
    bundle_version: raw.bundle_version,
    questions,
    scenarios,
    notes,
  };
}
