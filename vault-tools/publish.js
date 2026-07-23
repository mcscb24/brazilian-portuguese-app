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

const VAULT_TOOLS_DIR = __dirname;
const REPO_ROOT = path.resolve(VAULT_TOOLS_DIR, '..');
const REVIEW_DIR = path.join(VAULT_TOOLS_DIR, 'review');
const SCENARIOS_DIR = path.join(VAULT_TOOLS_DIR, 'scenarios');
const BUNDLE_OUT_PATH = path.join(REPO_ROOT, 'app', 'public', 'content-bundle.json');

const EXACT_TYPES = new Set([
  'en_to_pt', 'pt_to_en', 'fill_blank', 'choose_form',
  'correct_sentence', 'context_choice', 'build_sentence',
]);
const SELF_ASSESSED_TYPES = new Set(['open_completion', 'explain_difference', 'speak_aloud']);
const ALL_QUESTION_TYPES = new Set([...EXACT_TYPES, ...SELF_ASSESSED_TYPES]);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const REGISTERS = new Set(['spoken', 'written', 'neutral']);

// The vault's only image-only note (no extractable text) — excluded from v1
// per the design doc's revision history (§0/§15). Compared as a
// vault-relative, forward-slash path.
const EXCLUDED_NOTES = new Set(['Bits and Bobs/Telling the Time.md']);

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

function readYamlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => path.join(dir, f));
}

function publishReviewedContent() {
  const allErrors = [];
  const questions = [];
  const scenarios = [];
  const filesToWrite = [];

  for (const filePath of readYamlDir(REVIEW_DIR)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = YAML.parseDocument(raw);
    try {
      const { published, changed } = processDocument(doc, filePath, 'questions', 'question');
      questions.push(...published);
      if (changed) filesToWrite.push({ filePath, doc });
    } catch (e) {
      if (e instanceof ValidationError) allErrors.push(e.message);
      else throw e;
    }
  }

  for (const filePath of readYamlDir(SCENARIOS_DIR)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const doc = YAML.parseDocument(raw);
    try {
      const { published, changed } = processDocument(doc, filePath, 'scenarios', 'scenario');
      scenarios.push(...published);
      if (changed) filesToWrite.push({ filePath, doc });
    } catch (e) {
      if (e instanceof ValidationError) allErrors.push(e.message);
      else throw e;
    }
  }

  if (allErrors.length > 0) {
    throw new Error(`Schema validation failed:\n\n${allErrors.join('\n\n')}`);
  }

  // Only write files back after every file in the batch has validated clean,
  // so a bad entry in one file can't leave another file half-mutated on disk.
  for (const { filePath, doc } of filesToWrite) {
    fs.writeFileSync(filePath, doc.toString(), 'utf8');
  }

  return { questions, scenarios };
}

function deriveTitle(relativePath, bodyText) {
  const h1 = bodyText.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return path.basename(relativePath, '.md');
}

function deriveTopic(relativePath) {
  const segments = relativePath.split('/');
  if (segments[0] === 'Grammar' && segments.length > 2) return segments[1];
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

function mirrorVaultNotes(vaultPath) {
  const notes = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.obsidian') continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relativePath = path.relative(vaultPath, fullPath).split(path.sep).join('/');
        if (EXCLUDED_NOTES.has(relativePath)) continue;

        const bodyText = fs.readFileSync(fullPath, 'utf8');
        notes.push({
          path: relativePath,
          title: deriveTitle(relativePath, bodyText),
          topic: deriveTopic(relativePath),
          headings: extractHeadings(bodyText),
          body_markdown: bodyText,
        });
      }
    }
  }

  walk(vaultPath);
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return notes;
}

function main() {
  const { vaultPath } = loadVaultConfig();

  const { questions, scenarios } = publishReviewedContent();
  const notes = mirrorVaultNotes(vaultPath);

  const bundle = {
    schema_version: 1,
    bundle_version: new Date().toISOString(),
    questions,
    scenarios,
    notes,
  };

  fs.mkdirSync(path.dirname(BUNDLE_OUT_PATH), { recursive: true });
  fs.writeFileSync(BUNDLE_OUT_PATH, JSON.stringify(bundle, null, 2), 'utf8');

  console.log(`Published ${questions.length} question(s), ${scenarios.length} scenario(s), ${notes.length} note(s).`);
  console.log(`Bundle written to ${path.relative(REPO_ROOT, BUNDLE_OUT_PATH)} (version ${bundle.bundle_version}).`);
}

main();
