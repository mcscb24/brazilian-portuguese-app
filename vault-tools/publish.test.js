// Tests for the review-content publish pipeline: recursive .yaml/.yml
// discovery under nested folders, and duplicate-id detection across files.
// Uses Node's built-in test runner: `node --test publish.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readYamlDir, publishReviewedContent } = require('./publish');

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
