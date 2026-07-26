const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  REQUIRED_TENSES,
  generateVerbConjugationQuestions,
  generateConjugationPatternQuestions,
} = require('./conjugationQuestions');

function makeTempVault() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'conj-vault-'));
}

function writeNote(vaultPath, relativePath, content) {
  const fullPath = path.join(vaultPath, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

function sixTenseVerbNote(title, forms) {
  const sections = REQUIRED_TENSES.map((tense) => {
    const f = forms[tense];
    return `## ${tense}\n\n|Person|Conjugation|\n|---|---|\n|eu|**${f.eu}**|\n|você|**${f.voce}**|\n|ele / ela|**${f.voce}**|\n|nós|**${f.nos}**|\n|vocês|**${f.voces}**|\n|eles / elas|**${f.voces}**|\n`;
  });
  return `# ${title}\n\n${sections.join('\n---\n\n')}`;
}

function falarForms() {
  return {
    Present: { eu: 'falo', voce: 'fala', nos: 'falamos', voces: 'falam' },
    Preterite: { eu: 'falei', voce: 'falou', nos: 'falamos', voces: 'falaram' },
    Imperfect: { eu: 'falava', voce: 'falava', nos: 'falávamos', voces: 'falavam' },
    'Present Subjunctive': { eu: 'fale', voce: 'fale', nos: 'falemos', voces: 'falem' },
    'Imperfect Subjunctive': { eu: 'falasse', voce: 'falasse', nos: 'falássemos', voces: 'falassem' },
    'Future Subjunctive': { eu: 'falar', voce: 'falar', nos: 'falarmos', voces: 'falarem' },
  };
}

function comerForms() {
  return {
    Present: { eu: 'como', voce: 'come', nos: 'comemos', voces: 'comem' },
    Preterite: { eu: 'comi', voce: 'comeu', nos: 'comemos', voces: 'comeram' },
    Imperfect: { eu: 'comia', voce: 'comia', nos: 'comíamos', voces: 'comiam' },
    'Present Subjunctive': { eu: 'coma', voce: 'coma', nos: 'comamos', voces: 'comam' },
    'Imperfect Subjunctive': { eu: 'comesse', voce: 'comesse', nos: 'comêssemos', voces: 'comessem' },
    'Future Subjunctive': { eu: 'comer', voce: 'comer', nos: 'comermos', voces: 'comerem' },
  };
}

// ---- generateVerbConjugationQuestions: fixture tests ----

test('generateVerbConjugationQuestions produces 6 entries per clean verb note', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));
  writeNote(vaultPath, 'Verbs/Single/Comer.md', sixTenseVerbNote('Comer', comerForms()));

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, [
    'Verbs/Single/Falar.md',
    'Verbs/Single/Comer.md',
  ]);

  assert.deepEqual(errors, []);
  assert.equal(entries.length, 2 * REQUIRED_TENSES.length);
});

test('generateVerbConjugationQuestions: exact id, prompt, and model_answers for a known entry', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md']);
  assert.deepEqual(errors, []);

  const present = entries.find((e) => e.id === 'falar-present');
  assert.ok(present, 'expected a falar-present entry');
  assert.equal(present.type, 'verb_conjugation');
  assert.equal(present.topic, 'Verbs');
  assert.equal(present.subtopic, 'Falar');
  assert.equal(present.prompt, 'Conjugate "falar" in the Present (all persons).');
  assert.deepEqual(present.model_answers, [
    'eu: falo',
    'você: fala',
    'ele / ela: fala',
    'nós: falamos',
    'vocês: falam',
    'eles / elas: falam',
  ]);
  assert.deepEqual(present.source, { note: 'Verbs/Single/Falar.md', heading: 'Present' });
});

test('generateVerbConjugationQuestions reports a missing tense section without inventing one', () => {
  const vaultPath = makeTempVault();
  const forms = falarForms();
  delete forms['Imperfect Subjunctive'];
  const sections = REQUIRED_TENSES.filter((t) => t !== 'Imperfect Subjunctive').map((tense) => {
    const f = forms[tense];
    return `## ${tense}\n\n|Person|Conjugation|\n|---|---|\n|eu|**${f.eu}**|\n|você|**${f.voce}**|\n|ele / ela|**${f.voce}**|\n|nós|**${f.nos}**|\n|vocês|**${f.voces}**|\n|eles / elas|**${f.voces}**|\n`;
  });
  writeNote(vaultPath, 'Verbs/Single/Falar.md', `# Falar\n\n${sections.join('\n---\n\n')}`);

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md']);

  assert.equal(entries.length, REQUIRED_TENSES.length - 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Verbs\/Single\/Falar\.md/);
  assert.match(errors[0], /missing tense section/);
  assert.match(errors[0], /Imperfect Subjunctive/);
  assert.ok(!entries.some((e) => e.source.heading === 'Imperfect Subjunctive'));
});

test('generateVerbConjugationQuestions collects errors from multiple files rather than stopping at the first', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));
  writeNote(
    vaultPath,
    'Verbs/Single/Broken.md',
    '# Broken\n\n## Present\n\n|Person|Conjugation|\n|---|---|\n|eu|**x**|\n'
  );

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, [
    'Verbs/Single/Falar.md',
    'Verbs/Single/Broken.md',
  ]);

  // Falar contributes 6 good entries; Broken contributes 0 (bad row count for Present, missing
  // sections for the other 5) but every problem is reported, not swallowed.
  assert.equal(entries.length, REQUIRED_TENSES.length);
  assert.equal(errors.length, REQUIRED_TENSES.length);
  assert.ok(errors.every((e) => e.startsWith('Verbs/Single/Broken.md:')));
});

// ---- generateConjugationPatternQuestions: fixture tests ----

function conjugationsFixture(futureSubjunctiveBold) {
  const future = futureSubjunctiveBold
    ? '|eu|fal**ar**|com**er**|abr**ir**|\n|você|fal**ar**|com**er**|abr**ir**|\n|nós|fal**armos**|com**ermos**|abr**irmos**|\n|vocês|fal**arem**|com**erem**|abr**irem**|\n'
    : '|eu|falar|comer|abrir|\n|você|falar|comer|abrir|\n|nós|falarmos|comermos|abrirmos|\n|vocês|falarem|comerem|abrirem|\n';

  return `# Cheat Sheet

## Present

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**o**|com**o**|abr**o**|
|você|fal**a**|com**e**|abr**e**|
|nós|fal**amos**|com**emos**|abr**imos**|
|vocês|fal**am**|com**em**|abr**em**|

---

## Preterite

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**ei**|com**i**|abr**i**|
|você|fal**ou**|com**eu**|abr**iu**|
|nós|fal**amos**|com**emos**|abr**imos**|
|vocês|fal**aram**|com**eram**|abr**iram**|

---

## Imperfect

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**ava**|com**ia**|abr**ia**|
|você|fal**ava**|com**ia**|abr**ia**|
|nós|fal**ávamos**|com**íamos**|abr**íamos**|
|vocês|fal**avam**|com**iam**|abr**iam**|

---

## Present Subjunctive

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**e**|com**a**|abr**a**|
|você|fal**e**|com**a**|abr**a**|
|nós|fal**emos**|com**amos**|abr**amos**|
|vocês|fal**em**|com**am**|abr**am**|

---

## Imperfect Subjunctive

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**asse**|com**esse**|abr**isse**|
|você|fal**asse**|com**esse**|abr**isse**|
|nós|fal**ássemos**|com**êssemos**|abr**íssemos**|
|vocês|fal**assem**|com**essem**|abr**issem**|

---

## Future Subjunctive

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
${future}`;
}

test('generateConjugationPatternQuestions produces 3 family entries per tense, endings only', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');

  assert.deepEqual(errors, []);
  assert.equal(entries.length, REQUIRED_TENSES.length * 3);

  for (const tense of REQUIRED_TENSES) {
    const forTense = entries.filter((e) => e.source.heading === tense);
    assert.equal(forTense.length, 3, `expected 3 family entries for ${tense}`);
    const families = forTense.map((e) => e.id.split('-').pop()).sort();
    assert.deepEqual(families, ['ar', 'er', 'ir']);
  }
});

test('generateConjugationPatternQuestions: exact id, prompt, and endings-only model_answers', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');
  assert.deepEqual(errors, []);

  const presentAr = entries.find((e) => e.id === 'conjugations-present-ar');
  assert.ok(presentAr);
  assert.equal(presentAr.type, 'conjugation_pattern');
  assert.equal(presentAr.subtopic, '-AR verbs');
  assert.equal(presentAr.prompt, 'What are the regular -AR verb endings for the Present tense (all persons)?');
  assert.deepEqual(presentAr.model_answers, ['eu: -o', 'você: -a', 'nós: -amos', 'vocês: -am']);
  assert.deepEqual(presentAr.source, { note: 'Verbs/Conjugations.md', heading: 'Present' });

  // Confirms the ending is extracted, never a fully conjugated example word.
  assert.ok(!presentAr.model_answers.some((a) => a.includes('falo')));
});

test('generateConjugationPatternQuestions reports missing bold markers rather than inferring the ending', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(false));

  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');

  // The other 5 tenses are unaffected; only Future Subjunctive's 3 family entries are withheld.
  assert.equal(entries.length, (REQUIRED_TENSES.length - 1) * 3);
  assert.ok(!entries.some((e) => e.source.heading === 'Future Subjunctive'));

  assert.ok(errors.length > 0);
  assert.ok(errors.every((e) => e.startsWith('Verbs/Conjugations.md:')));
  assert.ok(errors.some((e) => e.includes('no bold-marked ending') && e.includes('Future Subjunctive')));
});

test('generateConjugationPatternQuestions reports an unexpected family header rather than guessing family identity', () => {
  const vaultPath = makeTempVault();
  const bad = conjugationsFixture(true).replace(
    '## Present\n\n|Person|**-AR**|**-ER**|**-IR**|',
    '## Present\n\n|Person|**-XX**|**-ER**|**-IR**|'
  );
  writeNote(vaultPath, 'Verbs/Conjugations.md', bad);

  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');

  assert.ok(!entries.some((e) => e.source.heading === 'Present'));
  assert.ok(errors.some((e) => e.includes('unexpected family header') && e.includes('Present')));
});

// ---- Idempotency ----

test('both generators are idempotent: identical inputs produce identical ids across repeated calls', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const run1 = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md']);
  const run2 = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md']);
  assert.deepEqual(run1.entries.map((e) => e.id).sort(), run2.entries.map((e) => e.id).sort());
  assert.deepEqual(run1, run2);

  const pattern1 = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');
  const pattern2 = generateConjugationPatternQuestions(vaultPath, 'Verbs/Conjugations.md');
  assert.deepEqual(pattern1.entries.map((e) => e.id).sort(), pattern2.entries.map((e) => e.id).sort());
  assert.deepEqual(pattern1, pattern2);
});

// ---- Real-vault integration tests ----
// Deliberately expresses expectations as relationships (discovered file count x 6), per the explicit
// instruction not to hard-code the current verb count as an architectural invariant. The real count is
// only asserted as a point-in-time sanity check, clearly separated from the relationship assertions.

function loadRealVaultPath() {
  const configPath = path.join(__dirname, 'vault.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.vaultPath;
}

function discoverRealVerbNotePaths(vaultPath) {
  const dir = path.join(vaultPath, 'Grammar', 'Verbs', 'Single');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `Grammar/Verbs/Single/${name}`);
}

test('real vault: verb_conjugation entry count equals discovered file count x 6, no errors', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  assert.ok(verbNotePaths.length > 0, 'expected at least one verb note under Grammar/Verbs/Single');

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths);

  assert.deepEqual(errors, [], `expected no content issues in the real vault:\n${errors.join('\n')}`);
  assert.equal(entries.length, verbNotePaths.length * REQUIRED_TENSES.length);

  // Point-in-time sanity check only - NOT an architectural invariant. If this fails because a verb
  // note was added or removed, update the numbers below; do not treat 26/156 as a required constant.
  assert.equal(verbNotePaths.length, 26);
  assert.equal(entries.length, 156);
});

test('real vault: Estar Present entry matches the source table exactly', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths);
  assert.deepEqual(errors, []);

  const estarPresent = entries.find((e) => e.id === 'estar-present');
  assert.ok(estarPresent, 'expected an estar-present entry');
  assert.deepEqual(estarPresent.model_answers, [
    'eu: estou',
    'você: está',
    'ele / ela: está',
    'nós: estamos',
    'vocês: estão',
    'eles / elas: estão',
  ]);
});

test('real vault: conjugation_pattern produces 18 entries (6 tenses x 3 families), no errors', () => {
  const vaultPath = loadRealVaultPath();
  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');

  assert.deepEqual(errors, [], `expected no content issues in Conjugations.md:\n${errors.join('\n')}`);
  assert.equal(entries.length, REQUIRED_TENSES.length * 3);

  for (const tense of REQUIRED_TENSES) {
    const families = entries
      .filter((e) => e.source.heading === tense)
      .map((e) => e.id.split('-').pop())
      .sort();
    assert.deepEqual(families, ['ar', 'er', 'ir'], `expected exactly -AR/-ER/-IR for ${tense}`);
  }
});

test('real vault: Future Subjunctive now has bold-marked endings (the fixed content issue)', () => {
  const vaultPath = loadRealVaultPath();
  const { entries, errors } = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');
  assert.deepEqual(errors, []);

  const futureAr = entries.find((e) => e.id === 'conjugations-future-subjunctive-ar');
  assert.ok(futureAr, 'expected conjugation_pattern to include Future Subjunctive -AR now that it is fixed');
  assert.deepEqual(futureAr.model_answers, ['eu: -ar', 'você: -ar', 'nós: -armos', 'vocês: -arem']);
});

test('real vault: both generators are idempotent across repeated runs', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);

  const run1 = generateVerbConjugationQuestions(vaultPath, verbNotePaths);
  const run2 = generateVerbConjugationQuestions(vaultPath, verbNotePaths);
  assert.deepEqual(run1, run2);

  const pattern1 = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');
  const pattern2 = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');
  assert.deepEqual(pattern1, pattern2);
});
