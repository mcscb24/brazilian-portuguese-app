#!/usr/bin/env node
// Deterministic publish step: reads reviewed question/scenario YAML plus the
// Obsidian vault, assigns/version-stamps content, mirrors note text, and
// writes app/public/content-bundle.json. No AI, no network access.
//
// See /docs/design.md (§8, §12) for the full rationale.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');

const {
  generateVerbConjugationQuestions,
  generateConjugationPatternQuestions,
} = require('./conjugationQuestions');

const VAULT_TOOLS_DIR = __dirname;
const REPO_ROOT = path.resolve(VAULT_TOOLS_DIR, '..');
const REVIEW_DIR = path.join(VAULT_TOOLS_DIR, 'review');
const SCENARIOS_DIR = path.join(VAULT_TOOLS_DIR, 'scenarios');
const BUNDLE_OUT_PATH = path.join(REPO_ROOT, 'app', 'public', 'content-bundle.json');

// The publishedNotes entries that feed the two deterministic generators. Required to be present in
// vault.config.json's publishedNotes (checked in main()) so generation stays tied to the same explicit
// allowlist that governs note mirroring — no separate, implicit source-of-truth for what gets parsed.
const VERB_SINGLE_NOTES_PATTERN = 'Grammar/Verbs/Single/*.md';
const CONJUGATIONS_NOTE_PATH = 'Grammar/Verbs/Conjugations.md';

const EXACT_TYPES = new Set([
  'en_to_pt', 'pt_to_en', 'fill_blank', 'choose_form',
  'correct_sentence', 'context_choice', 'build_sentence',
]);
const SELF_ASSESSED_TYPES = new Set([
  'open_completion', 'explain_difference', 'speak_aloud',
  'verb_conjugation', 'conjugation_pattern',
]);
const ALL_QUESTION_TYPES = new Set([...EXACT_TYPES, ...SELF_ASSESSED_TYPES]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const REGISTERS = new Set(['spoken', 'written', 'neutral']);

class ValidationError extends Error {}

function loadVaultConfig() {
  const configPath = path.join(VAULT_TOOLS_DIR, 'vault.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing ${configPath}.\n` +
      `Copy vault.config.example.json to vault.config.json and set vaultPath to your Obsidian vault folder.`
    );
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.vaultPath || !fs.existsSync(config.vaultPath)) {
    throw new Error(`vaultPath in vault.config.json does not exist: ${config.vaultPath}`);
  }
  if (!Array.isArray(config.publishedNotes) || config.publishedNotes.length === 0) {
    throw new Error(
      'vault.config.json must include a non-empty "publishedNotes" array ' +
      '(e.g. ["Grammar/Verbs/Conjugations.md", "Grammar/Verbs/Single/*.md"]) — ' +
      'this is the explicit allowlist of notes to mirror into content-bundle.json.'
    );
  }
  return config;
}

function idPrefixForFile(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

// Stable hash over the fields that define what the user is actually shown /
// graded against (design doc §12: "over prompt/answers/type").
function computeContentHash(entry) {
  const fields = {
    type: entry.type ?? null,
    direction: entry.direction ?? null,
    prompt: entry.prompt ?? entry.opening_prompt ?? null,
    accepted_answers: entry.accepted_answers ?? null,
    distractors: entry.distractors ?? null,
    model_answers: entry.model_answers ?? entry.model_responses ?? null,
    useful_structures: entry.useful_structures ?? null,
    explanation: entry.explanation ?? null,
    follow_up_prompts: entry.follow_up_prompts ?? null,
    target_grammar: entry.target_grammar ?? null,
  };
  const canonical = JSON.stringify(fields, Object.keys(fields).sort());
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Assigns ids, recomputes content_hash, and bumps version for every
// `status: approved` item in a YAML document that's missing/stale one.
// Mutates the yaml.Document in place (preserving comments/formatting) and
// returns { published: [...], changed: boolean }.
function processDocument(doc, filePath, listKey, kindLabel) {
  const idPrefix = idPrefixForFile(filePath);
  const items = doc.get(listKey);
  if (!items) return { published: [], changed: false };

  const seq = items.items ?? [];
  let maxExisting = 0;
  for (const itemNode of seq) {
    const id = itemNode.toJSON().id;
    if (typeof id === 'string' && id.startsWith(idPrefix + '-')) {
      const n = parseInt(id.slice(idPrefix.length + 1), 10);
      if (!Number.isNaN(n)) maxExisting = Math.max(maxExisting, n);
    }
  }

  const published = [];
  let changed = false;

  for (const itemNode of seq) {
    const entry = itemNode.toJSON();
    if (entry.status !== 'approved') continue;

    validateEntry(entry, filePath, kindLabel);

    if (!entry.id) {
      maxExisting += 1;
      const newId = `${idPrefix}-${String(maxExisting).padStart(4, '0')}`;
      itemNode.set('id', newId);
      entry.id = newId;
      itemNode.set('created_at', todayIso());
      entry.created_at = todayIso();
      changed = true;
    }

    const newHash = computeContentHash(entry);
    if (entry.content_hash !== newHash) {
      const newVersion = (entry.version ?? 0) + 1;
      itemNode.set('content_hash', newHash);
      itemNode.set('version', newVersion);
      itemNode.set('updated_at', todayIso());
      entry.content_hash = newHash;
      entry.version = newVersion;
      entry.updated_at = todayIso();
      changed = true;
    }

    published.push(entry);
  }

  return { published, changed };
}

function validateEntry(entry, filePath, kindLabel) {
  const where = `${path.relative(REPO_ROOT, filePath)} (${kindLabel} prompt: ${JSON.stringify(entry.prompt ?? entry.opening_prompt ?? entry.title)})`;
  const errors = [];

  if (kindLabel === 'question') {
    if (!ALL_QUESTION_TYPES.has(entry.type)) errors.push(`unknown type ${JSON.stringify(entry.type)}`);
    if (!entry.topic) errors.push('missing topic');
    if (!entry.subtopic) errors.push('missing subtopic');
    if (!DIFFICULTIES.has(entry.difficulty)) errors.push(`invalid difficulty ${JSON.stringify(entry.difficulty)}`);
    if (!REGISTERS.has(entry.register)) errors.push(`invalid register ${JSON.stringify(entry.register)}`);
    if (!entry.prompt) errors.push('missing prompt');
    if (!entry.explanation) errors.push('missing explanation');
    if (!entry.source || !entry.source.note || !entry.source.heading) errors.push('missing source.note/source.heading');
    if (EXACT_TYPES.has(entry.type) && !(entry.accepted_answers && entry.accepted_answers.length > 0)) {
      errors.push(`type ${entry.type} requires at least one accepted_answers entry`);
    }
    if (SELF_ASSESSED_TYPES.has(entry.type) && !(entry.model_answers && entry.model_answers.length > 0)) {
      errors.push(`type ${entry.type} requires at least one model_answers entry`);
    }
  } else {
    if (!entry.title) errors.push('missing title');
    if (!entry.opening_prompt) errors.push('missing opening_prompt');
    if (!DIFFICULTIES.has(entry.difficulty)) errors.push(`invalid difficulty ${JSON.stringify(entry.difficulty)}`);
    if (!(entry.model_responses && entry.model_responses.length > 0)) errors.push('missing model_responses');
    if (!(entry.source && entry.source.length > 0)) errors.push('missing source');
  }

  if (errors.length > 0) {
    throw new ValidationError(`${where}:\n  - ${errors.join('\n  - ')}`);
  }
}

// Recursively finds .yaml/.yml files anywhere under dir (any folder depth),
// so review content can be organized into subfolders. Sorted for
// deterministic publish order.
function readYamlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  results.sort();
  return results;
}

// Ids are assigned per-file from the file's own basename (idPrefixForFile),
// so two files with the same basename in different folders would otherwise
// silently mint identical ids (e.g. both "basics-0001"). This checks the
// final, published id set for collisions and reports every offending pair.
function findDuplicateIds(origins, kindLabel) {
  const seen = new Map();
  const errors = [];
  for (const { id, filePath } of origins) {
    if (!id) continue;
    if (seen.has(id)) {
      errors.push(
        `duplicate ${kindLabel} id ${JSON.stringify(id)}:\n` +
        `  - ${path.relative(REPO_ROOT, seen.get(id))}\n` +
        `  - ${path.relative(REPO_ROOT, filePath)}`
      );
    } else {
      seen.set(id, filePath);
    }
  }
  return errors;
}

function publishReviewedContent({ reviewDir = REVIEW_DIR, scenariosDir = SCENARIOS_DIR } = {}) {
  const allErrors = [];
  const questions = [];
  const questionOrigins = [];
  const scenarios = [];
  const scenarioOrigins = [];
  const filesToWrite = [];

  for (const filePath of readYamlDir(reviewDir)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = YAML.parseDocument(raw);
    try {
      const { published, changed } = processDocument(doc, filePath, 'questions', 'question');
      for (const entry of published) {
        questions.push(entry);
        questionOrigins.push({ id: entry.id, filePath });
      }
      if (changed) filesToWrite.push({ filePath, doc });
    } catch (e) {
      if (e instanceof ValidationError) allErrors.push(e.message);
      else throw e;
    }
  }
  allErrors.push(...findDuplicateIds(questionOrigins, 'question'));

  for (const filePath of readYamlDir(scenariosDir)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = YAML.parseDocument(raw);
    try {
      const { published, changed } = processDocument(doc, filePath, 'scenarios', 'scenario');
      for (const entry of published) {
        scenarios.push(entry);
        scenarioOrigins.push({ id: entry.id, filePath });
      }
      if (changed) filesToWrite.push({ filePath, doc });
    } catch (e) {
      if (e instanceof ValidationError) allErrors.push(e.message);
      else throw e;
    }
  }
  allErrors.push(...findDuplicateIds(scenarioOrigins, 'scenario'));

  if (allErrors.length > 0) {
    throw new Error(`Schema validation failed:\n\n${allErrors.join('\n\n')}`);
  }

  // Only write files back after every file in the batch has validated clean,
  // so a bad entry in one file can't leave another file half-mutated on disk.
  for (const { filePath, doc } of filesToWrite) {
    fs.writeFileSync(filePath, doc.toString(), 'utf8');
  }

  return { questions, scenarios, questionOrigins, scenarioOrigins };
}

function deriveTitle(relativePath, bodyText) {
  const h1 = bodyText.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return path.basename(relativePath, '.md');
}

function deriveTopic(relativePath) {
  const segments = relativePath.split('/');
  if (segments[0] === 'Grammar' && segments.length > 2) return segments[1];
  // A note directly under Grammar/ with no subfolder (e.g. Grammar/Articles.md) has no natural
  // subfolder-derived topic - fall back to its own filename rather than the meaningless "Grammar".
  if (segments[0] === 'Grammar') return path.basename(segments[segments.length - 1], '.md');
  return segments[0];
}

function extractHeadings(bodyText) {
  const headings = [];
  for (const line of bodyText.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}

// Recursively walks an already-resolved absolute directory, collecting every .md file at any depth
// as a vault-relative path (relativePrefix is the vault-relative path to dirFull itself, '' for the
// vault root). Skips any entry - file or directory - whose name starts with "." at any depth: vault
// hygiene (.obsidian, .trash, etc.) rather than a hardcoded name list, since none currently exist in
// this vault but could reappear if it's reopened in Obsidian. Unsorted - callers sort the result.
function walkMarkdownFilesRecursive(dirFull, relativePrefix) {
  const results = [];
  for (const entry of fs.readdirSync(dirFull, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const childRelative = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    const childFull = path.join(dirFull, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFilesRecursive(childFull, childRelative));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(childRelative);
    }
  }
  return results;
}

// Resolves one vault.config.json publishedNotes entry - an exact vault-relative path, a
// non-recursive "folder/*.md" wildcard, or a recursive "folder/**/*.md" wildcard - into a sorted
// list of vault-relative note paths. Throws loudly if a configured path/folder doesn't exist, or if
// a pattern isn't one of these supported shapes (no glob dependency - each shape is matched and
// walked explicitly). A bare vault-root "**/*.md" is deliberately not supported: every recursive
// root must name an actual top-level folder, keeping the allowlist an intentional, auditable list
// rather than "everything under vaultPath, whatever that becomes."
function resolvePublishedNoteEntry(vaultPath, entry) {
  if (entry.endsWith('/**/*.md')) {
    const folder = entry.slice(0, -'/**/*.md'.length);
    const dirFull = path.join(vaultPath, ...folder.split('/'));
    if (!fs.existsSync(dirFull) || !fs.statSync(dirFull).isDirectory()) {
      throw new Error(`vault.config.json publishedNotes entry ${JSON.stringify(entry)}: folder does not exist: ${dirFull}`);
    }
    return walkMarkdownFilesRecursive(dirFull, folder).sort();
  }

  if (entry.endsWith('/*.md')) {
    const folder = entry.slice(0, -'/*.md'.length);
    const dirFull = path.join(vaultPath, ...folder.split('/'));
    if (!fs.existsSync(dirFull) || !fs.statSync(dirFull).isDirectory()) {
      throw new Error(`vault.config.json publishedNotes entry ${JSON.stringify(entry)}: folder does not exist: ${dirFull}`);
    }
    return fs
      .readdirSync(dirFull, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => `${folder}/${e.name}`)
      .sort();
  }

  if (entry.includes('*')) {
    throw new Error(
      `vault.config.json publishedNotes entry ${JSON.stringify(entry)}: only exact paths, ` +
      `non-recursive "folder/*.md" wildcards, or recursive "folder/**/*.md" wildcards are supported.`
    );
  }

  const fullPath = path.join(vaultPath, ...entry.split('/'));
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`vault.config.json publishedNotes entry ${JSON.stringify(entry)}: file does not exist: ${fullPath}`);
  }
  return [entry];
}

// Expands every publishedNotes entry, returning both the flat deduplicated/sorted list (for note
// mirroring) and a per-entry breakdown (so callers - e.g. the conjugation generators - can find exactly
// which resolved paths came from a specific configured entry, without re-deriving the pattern).
function resolvePublishedNotePaths(vaultPath, publishedNotes) {
  const perEntry = [];
  const seen = new Set();
  const merged = [];

  for (const entry of publishedNotes) {
    const paths = resolvePublishedNoteEntry(vaultPath, entry);
    perEntry.push({ entry, paths });
    for (const p of paths) {
      if (!seen.has(p)) {
        seen.add(p);
        merged.push(p);
      }
    }
  }

  merged.sort();
  return { merged, perEntry };
}

// Mirrors exactly the given (already-resolved) vault-relative note paths - no implicit whole-vault
// walk, no opt-out list needed: a path not in publishedNotes is simply never read.
function mirrorVaultNotes(vaultPath, notePaths) {
  return notePaths
    .map((relativePath) => {
      const fullPath = path.join(vaultPath, ...relativePath.split('/'));
      const bodyText = fs.readFileSync(fullPath, 'utf8');
      return {
        path: relativePath,
        title: deriveTitle(relativePath, bodyText),
        topic: deriveTopic(relativePath),
        headings: extractHeadings(bodyText),
        body_markdown: bodyText,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

// Reads the previously-published bundle (if any) so generated-question version/created_at can be
// carried forward instead of reset on every run. A missing bundle (first-ever publish) is fine and
// yields an empty map; a *present but unparseable* bundle is a real problem worth failing loudly on,
// rather than silently treating as "no history" and quietly resetting every version/created_at.
function loadPreviousQuestionsById() {
  const map = new Map();
  if (!fs.existsSync(BUNDLE_OUT_PATH)) return map;

  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(BUNDLE_OUT_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`Existing ${path.relative(REPO_ROOT, BUNDLE_OUT_PATH)} is not valid JSON: ${e.message}`);
  }

  for (const q of previous.questions ?? []) {
    if (q && q.id) map.set(q.id, q);
  }
  return map;
}

// Completes a raw generated entry (id/type/topic/.../source only) into a full Question: computes
// content_hash, and mirrors processDocument's bump-on-change semantics using the previous bundle
// instead of a YAML AST - same id + unchanged content_hash keeps version/created_at; a changed hash
// bumps version/updated_at; a brand-new id starts at version 1. status is always "approved" and
// generation_version always 1: there is no "candidate" state for a deterministic extraction - either
// the source parsed and validated cleanly (this function only runs on entries that did), or it was
// reported as an error and never reaches here.
function finalizeGeneratedQuestion(rawEntry, previousById) {
  const contentHash = computeContentHash(rawEntry);
  const previous = previousById.get(rawEntry.id);
  const today = todayIso();

  let version = 1;
  let createdAt = today;
  let updatedAt = today;

  if (previous) {
    createdAt = previous.created_at;
    if (previous.content_hash === contentHash) {
      version = previous.version;
      updatedAt = previous.updated_at;
    } else {
      version = (previous.version ?? 0) + 1;
    }
  }

  return {
    ...rawEntry,
    status: 'approved',
    generation_version: 1,
    content_hash: contentHash,
    version,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

// Every published note must have at least one Practice question - deterministic or hand/AI-authored -
// pointing at it via source.note. This is a hard invariant, not an editorial judgement: zero coverage
// silently breaks the "every published note appears in Practice" contract, whereas thin/partial
// coverage is a matter of degree that a coverage audit should report on, not one this check should
// second-guess by counting questions per note.
function findZeroCoverageNotes(notes, questions) {
  const covered = new Set(questions.map((q) => q.source.note));
  return notes.map((n) => n.path).filter((notePath) => !covered.has(notePath));
}

function main() {
  const { vaultPath, publishedNotes } = loadVaultConfig();
  const { merged: notePaths, perEntry } = resolvePublishedNotePaths(vaultPath, publishedNotes);

  const verbNotesEntry = perEntry.find((e) => e.entry === VERB_SINGLE_NOTES_PATTERN);
  if (!verbNotesEntry) {
    throw new Error(
      `vault.config.json's publishedNotes must include "${VERB_SINGLE_NOTES_PATTERN}" ` +
      `so verb_conjugation questions can be generated.`
    );
  }
  const conjugationsEntry = perEntry.find((e) => e.entry === CONJUGATIONS_NOTE_PATH);
  if (!conjugationsEntry) {
    throw new Error(
      `vault.config.json's publishedNotes must include "${CONJUGATIONS_NOTE_PATH}" ` +
      `so conjugation_pattern questions can be generated.`
    );
  }

  const allErrors = [];

  const { questions: handQuestions, scenarios, questionOrigins: handQuestionOrigins } = publishReviewedContent();

  const { entries: verbEntries, errors: verbErrors } = generateVerbConjugationQuestions(
    vaultPath,
    verbNotesEntry.paths,
    CONJUGATIONS_NOTE_PATH
  );
  const { entries: patternEntries, errors: patternErrors } = generateConjugationPatternQuestions(vaultPath, CONJUGATIONS_NOTE_PATH);
  allErrors.push(...verbErrors, ...patternErrors);

  const previousById = loadPreviousQuestionsById();
  const generatedQuestions = [...verbEntries, ...patternEntries].map((raw) => finalizeGeneratedQuestion(raw, previousById));

  const generatedOrigins = generatedQuestions.map((q) => ({
    id: q.id,
    filePath: path.join(vaultPath, ...q.source.note.split('/')),
  }));
  allErrors.push(...findDuplicateIds([...handQuestionOrigins, ...generatedOrigins], 'question'));

  if (allErrors.length > 0) {
    throw new Error(`Generation/content validation failed:\n\n${allErrors.join('\n\n')}`);
  }

  const questions = [...handQuestions, ...generatedQuestions];
  const notes = mirrorVaultNotes(vaultPath, notePaths);

  const zeroCoverageNotes = findZeroCoverageNotes(notes, questions);
  if (zeroCoverageNotes.length > 0) {
    throw new Error(
      `Coverage check failed: ${zeroCoverageNotes.length} published note(s) have zero Practice questions:\n` +
      zeroCoverageNotes.map((p) => `  - ${p}`).join('\n')
    );
  }

  const bundle = {
    schema_version: 1,
    bundle_version: new Date().toISOString(),
    questions,
    scenarios,
    notes,
  };

  fs.mkdirSync(path.dirname(BUNDLE_OUT_PATH), { recursive: true });
  fs.writeFileSync(BUNDLE_OUT_PATH, JSON.stringify(bundle, null, 2), 'utf8');

  console.log(
    `Published ${questions.length} question(s) (${handQuestions.length} hand-authored, ` +
    `${generatedQuestions.length} generated: ${verbEntries.length} verb_conjugation, ` +
    `${patternEntries.length} conjugation_pattern), ${scenarios.length} scenario(s), ${notes.length} note(s).`
  );
  console.log(`Bundle written to ${path.relative(REPO_ROOT, BUNDLE_OUT_PATH)} (version ${bundle.bundle_version}).`);
}

if (require.main === module) {
  main();
}

module.exports = {
  readYamlDir,
  findDuplicateIds,
  publishReviewedContent,
  processDocument,
  validateEntry,
  computeContentHash,
  idPrefixForFile,
  loadVaultConfig,
  resolvePublishedNotePaths,
  mirrorVaultNotes,
  finalizeGeneratedQuestion,
  loadPreviousQuestionsById,
  findZeroCoverageNotes,
  deriveTopic,
  ValidationError,
};
