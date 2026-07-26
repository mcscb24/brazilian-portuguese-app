// Tests for the review-content publish pipeline: recursive .yaml/.yml
// discovery under nested folders, and duplicate-id detection across files.
// Uses Node's built-in test runner: `node --test publish.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readYamlDir,
  publishReviewedContent,
  resolvePublishedNotePaths,
  mirrorVaultNotes,
  finalizeGeneratedQuestion,
} = require('./publish');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-tools-publish-test-'));
}

function writeYaml(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function questionYaml() {
  return `questions:
  - type: en_to_pt
    topic: Test Topic
    subtopic: Test Subtopic
    direction: null
    difficulty: easy
    register: neutral
    prompt: "Test prompt"
    explanation: "Test explanation"
    accepted_answers:
      - "resposta"
    source:
      note: "Test/Note.md"
      heading: "Heading"
    status: approved
    generation_version: 1
`;
}

function questionYamlWithId(id) {
  return `questions:
  - id: ${id}
    type: en_to_pt
    topic: Test Topic
    subtopic: Test Subtopic
    direction: null
    difficulty: easy
    register: neutral
    prompt: "Test prompt"
    explanation: "Test explanation"
    accepted_answers:
      - "resposta"
    source:
      note: "Test/Note.md"
      heading: "Heading"
    status: approved
    generation_version: 1
`;
}

test('readYamlDir discovers .yaml/.yml files nested in subfolders', () => {
  const dir = makeTempDir();
  try {
    writeYaml(path.join(dir, 'top.yaml'), questionYaml());
    writeYaml(path.join(dir, 'verbs', 'subjunctive.yaml'), questionYaml());
    writeYaml(path.join(dir, 'verbs', 'moods', 'imperative.yml'), questionYaml());
    writeYaml(path.join(dir, 'not-yaml.txt'), 'ignore me');

    const found = readYamlDir(dir).map((p) => path.relative(dir, p).split(path.sep).join('/'));
    assert.deepEqual(found.sort(), [
      'top.yaml',
      'verbs/moods/imperative.yml',
      'verbs/subjunctive.yaml',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('publishReviewedContent assigns ids from nested review folders, keyed per-file by basename', () => {
  const reviewDir = makeTempDir();
  const scenariosDir = makeTempDir();
  try {
    writeYaml(path.join(reviewDir, 'top.yaml'), questionYaml());
    writeYaml(path.join(reviewDir, 'verbs', 'subjunctive.yaml'), questionYaml());
    writeYaml(path.join(reviewDir, 'verbs', 'moods', 'imperative.yaml'), questionYaml());

    const { questions } = publishReviewedContent({ reviewDir, scenariosDir });
    const ids = questions.map((q) => q.id).sort();
    assert.deepEqual(ids, ['imperative-0001', 'subjunctive-0001', 'top-0001']);
  } finally {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    fs.rmSync(scenariosDir, { recursive: true, force: true });
  }
});

test('publishReviewedContent throws when two files in different folders mint the same auto-assigned id', () => {
  const reviewDir = makeTempDir();
  const scenariosDir = makeTempDir();
  try {
    writeYaml(path.join(reviewDir, 'a', 'basics.yaml'), questionYaml());
    writeYaml(path.join(reviewDir, 'b', 'basics.yaml'), questionYaml());

    assert.throws(
      () => publishReviewedContent({ reviewDir, scenariosDir }),
      (err) => {
        assert.match(err.message, /duplicate question id "basics-0001"/);
        assert.match(err.message, /a[\\/]basics\.yaml/);
        assert.match(err.message, /b[\\/]basics\.yaml/);
        return true;
      }
    );
  } finally {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    fs.rmSync(scenariosDir, { recursive: true, force: true });
  }
});

test('publishReviewedContent throws when two files in different folders hand-set the same explicit id', () => {
  const reviewDir = makeTempDir();
  const scenariosDir = makeTempDir();
  try {
    writeYaml(path.join(reviewDir, 'x', 'one.yaml'), questionYamlWithId('shared-0001'));
    writeYaml(path.join(reviewDir, 'y', 'two.yaml'), questionYamlWithId('shared-0001'));

    assert.throws(
      () => publishReviewedContent({ reviewDir, scenariosDir }),
      /duplicate question id "shared-0001"/
    );
  } finally {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    fs.rmSync(scenariosDir, { recursive: true, force: true });
  }
});

test('publishReviewedContent does not flag distinct ids from same-named files in different folders as duplicates', () => {
  const reviewDir = makeTempDir();
  const scenariosDir = makeTempDir();
  try {
    writeYaml(path.join(reviewDir, 'a', 'basics.yaml'), questionYamlWithId('a-basics-0001'));
    writeYaml(path.join(reviewDir, 'b', 'basics.yaml'), questionYamlWithId('b-basics-0001'));

    const { questions } = publishReviewedContent({ reviewDir, scenariosDir });
    assert.deepEqual(questions.map((q) => q.id).sort(), ['a-basics-0001', 'b-basics-0001']);
  } finally {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    fs.rmSync(scenariosDir, { recursive: true, force: true });
  }
});

test('publishReviewedContent is idempotent across nested folders: ids and hashes stay stable on re-publish', () => {
  const reviewDir = makeTempDir();
  const scenariosDir = makeTempDir();
  try {
    writeYaml(path.join(reviewDir, 'verbs', 'subjunctive.yaml'), questionYaml());

    const first = publishReviewedContent({ reviewDir, scenariosDir });
    const second = publishReviewedContent({ reviewDir, scenariosDir });

    assert.equal(first.questions[0].id, second.questions[0].id);
    assert.equal(first.questions[0].content_hash, second.questions[0].content_hash);
    assert.equal(second.questions[0].version, 1);
  } finally {
    fs.rmSync(reviewDir, { recursive: true, force: true });
    fs.rmSync(scenariosDir, { recursive: true, force: true });
  }
});

function makeVault() {
  const vaultPath = makeTempDir();
  writeYaml(path.join(vaultPath, 'Grammar', 'Verbs', 'Conjugations.md'), '# Conjugations\n');
  writeYaml(path.join(vaultPath, 'Grammar', 'Verbs', 'Single', 'Estar.md'), '# Estar\n');
  writeYaml(path.join(vaultPath, 'Grammar', 'Verbs', 'Single', 'Ter.md'), '# Ter\n');
  writeYaml(path.join(vaultPath, 'Grammar', 'Verbs', 'Single', 'notes.txt'), 'not a note');
  writeYaml(path.join(vaultPath, 'Bits and Bobs', 'Untracked.md'), '# Untracked\n');
  // Fixtures for recursive folder/**/*.md resolution: a flat note and a two-levels-deep note under
  // the same subfolder (Pronouns), a dot-prefixed directory that must never surface, and a sibling
  // top-level folder outside any configured recursive root.
  writeYaml(path.join(vaultPath, 'Grammar', 'Pronouns', 'Direct.md'), '# Direct\n');
  writeYaml(path.join(vaultPath, 'Grammar', 'Pronouns', 'Deep', 'Nested.md'), '# Nested\n');
  writeYaml(path.join(vaultPath, 'Grammar', '.obsidian', 'config.md'), 'not a real note');
  writeYaml(path.join(vaultPath, 'Scratch', 'Unrelated.md'), '# Unrelated\n');
  return vaultPath;
}

test('resolvePublishedNotePaths resolves an exact path entry', () => {
  const vaultPath = makeVault();
  try {
    const { merged, perEntry } = resolvePublishedNotePaths(vaultPath, ['Grammar/Verbs/Conjugations.md']);
    assert.deepEqual(merged, ['Grammar/Verbs/Conjugations.md']);
    assert.deepEqual(perEntry, [
      { entry: 'Grammar/Verbs/Conjugations.md', paths: ['Grammar/Verbs/Conjugations.md'] },
    ]);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths resolves a folder/*.md wildcard, sorted, .md-only', () => {
  const vaultPath = makeVault();
  try {
    const { merged, perEntry } = resolvePublishedNotePaths(vaultPath, ['Grammar/Verbs/Single/*.md']);
    assert.deepEqual(merged, ['Grammar/Verbs/Single/Estar.md', 'Grammar/Verbs/Single/Ter.md']);
    assert.equal(perEntry.length, 1);
    assert.deepEqual(perEntry[0].paths, ['Grammar/Verbs/Single/Estar.md', 'Grammar/Verbs/Single/Ter.md']);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths merges and dedupes across entries, sorted overall', () => {
  const vaultPath = makeVault();
  try {
    const { merged } = resolvePublishedNotePaths(vaultPath, [
      'Grammar/Verbs/Single/*.md',
      'Grammar/Verbs/Conjugations.md',
      'Grammar/Verbs/Single/Estar.md',
    ]);
    assert.deepEqual(merged, [
      'Grammar/Verbs/Conjugations.md',
      'Grammar/Verbs/Single/Estar.md',
      'Grammar/Verbs/Single/Ter.md',
    ]);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths throws when an exact-path entry does not exist', () => {
  const vaultPath = makeVault();
  try {
    assert.throws(
      () => resolvePublishedNotePaths(vaultPath, ['Grammar/Verbs/Missing.md']),
      /file does not exist/
    );
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths throws when a folder/*.md entry\'s folder does not exist', () => {
  const vaultPath = makeVault();
  try {
    assert.throws(
      () => resolvePublishedNotePaths(vaultPath, ['Grammar/Verbs/Missing/*.md']),
      /folder does not exist/
    );
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths rejects wildcard shapes other than folder/*.md or folder/**/*.md', () => {
  const vaultPath = makeVault();
  try {
    assert.throws(
      () => resolvePublishedNotePaths(vaultPath, ['Grammar/Verbs/Single/*.markdown']),
      /only exact paths.*folder\/\*\.md.*folder\/\*\*\/\*\.md.*wildcards are supported/
    );
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths resolves a folder/**/*.md wildcard recursively through nested subfolders', () => {
  const vaultPath = makeVault();
  try {
    const { merged, perEntry } = resolvePublishedNotePaths(vaultPath, ['Grammar/Pronouns/**/*.md']);
    assert.deepEqual(merged, [
      'Grammar/Pronouns/Deep/Nested.md',
      'Grammar/Pronouns/Direct.md',
    ]);
    assert.equal(perEntry.length, 1);
    assert.deepEqual(perEntry[0].paths, merged);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths dedupes a recursive folder/**/*.md entry against an already-explicit exact path', () => {
  const vaultPath = makeVault();
  try {
    const { merged } = resolvePublishedNotePaths(vaultPath, [
      'Grammar/Verbs/Conjugations.md',
      'Grammar/**/*.md',
    ]);
    assert.equal(merged.filter((p) => p === 'Grammar/Verbs/Conjugations.md').length, 1);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths returns a deterministically sorted list for a recursive entry', () => {
  const vaultPath = makeVault();
  try {
    const { merged } = resolvePublishedNotePaths(vaultPath, ['Grammar/**/*.md']);
    assert.deepEqual(merged, [...merged].sort());
    assert.ok(merged.length > 1);
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths skips dot-prefixed directories when resolving recursively', () => {
  const vaultPath = makeVault();
  try {
    const { merged } = resolvePublishedNotePaths(vaultPath, ['Grammar/**/*.md']);
    assert.ok(!merged.includes('Grammar/.obsidian/config.md'));
    assert.ok(!merged.some((p) => p.split('/').some((segment) => segment.startsWith('.'))));
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths does not include an unrelated sibling folder outside the configured recursive roots', () => {
  const vaultPath = makeVault();
  try {
    const { merged } = resolvePublishedNotePaths(vaultPath, ['Grammar/**/*.md', 'Bits and Bobs/**/*.md']);
    assert.ok(!merged.some((p) => p.startsWith('Scratch/')));
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('resolvePublishedNotePaths throws a clear error when a recursive folder/**/*.md root does not exist', () => {
  const vaultPath = makeVault();
  try {
    assert.throws(
      () => resolvePublishedNotePaths(vaultPath, ['Grammar/Missing/**/*.md']),
      /folder does not exist/
    );
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

test('mirrorVaultNotes mirrors exactly the given resolved paths, never an unlisted file', () => {
  const vaultPath = makeVault();
  try {
    const notes = mirrorVaultNotes(vaultPath, ['Grammar/Verbs/Single/Estar.md', 'Grammar/Verbs/Conjugations.md']);
    assert.deepEqual(notes.map((n) => n.path), [
      'Grammar/Verbs/Conjugations.md',
      'Grammar/Verbs/Single/Estar.md',
    ]);
    assert.equal(notes.find((n) => n.path === 'Grammar/Verbs/Single/Estar.md').title, 'Estar');
    assert.ok(!notes.some((n) => n.path.includes('Untracked')));
  } finally {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  }
});

function rawGenerated(overrides = {}) {
  return {
    id: 'estar-present',
    type: 'verb_conjugation',
    topic: 'Verbs',
    subtopic: 'Estar',
    direction: null,
    difficulty: 'medium',
    register: 'neutral',
    prompt: 'Conjugate "estar" in the Present (all persons).',
    model_answers: ['eu: estou', 'você: está'],
    explanation: 'Full Present conjugation of "estar", from Grammar/Verbs/Single/Estar.md.',
    source: { note: 'Grammar/Verbs/Single/Estar.md', heading: 'Present' },
    ...overrides,
  };
}

test('finalizeGeneratedQuestion starts a brand-new id at version 1 with today as created_at/updated_at', () => {
  const result = finalizeGeneratedQuestion(rawGenerated(), new Map());
  assert.equal(result.version, 1);
  assert.equal(result.created_at, result.updated_at);
  assert.equal(result.status, 'approved');
  assert.equal(result.generation_version, 1);
  assert.ok(result.content_hash.startsWith('sha256:'));
});

test('finalizeGeneratedQuestion preserves version/created_at/updated_at when content_hash is unchanged', () => {
  const raw = rawGenerated();
  const first = finalizeGeneratedQuestion(raw, new Map());
  const previousById = new Map([[first.id, first]]);

  const second = finalizeGeneratedQuestion(rawGenerated(), previousById);

  assert.equal(second.version, first.version);
  assert.equal(second.created_at, first.created_at);
  assert.equal(second.updated_at, first.updated_at);
  assert.equal(second.content_hash, first.content_hash);
});

test('finalizeGeneratedQuestion bumps version and updated_at (but not created_at) when content changes', () => {
  const raw = rawGenerated();
  const first = finalizeGeneratedQuestion(raw, new Map());
  const previousById = new Map([[first.id, first]]);

  const changed = finalizeGeneratedQuestion(
    rawGenerated({ model_answers: ['eu: estou', 'você: está', 'nós: estamos'] }),
    previousById
  );

  assert.equal(changed.version, first.version + 1);
  assert.equal(changed.created_at, first.created_at);
  assert.notEqual(changed.content_hash, first.content_hash);
});
