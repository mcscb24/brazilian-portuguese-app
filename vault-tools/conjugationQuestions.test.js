const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  REQUIRED_TENSES,
  deriveFamily,
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
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Falar.md', 'Verbs/Single/Comer.md'],
    'Verbs/Conjugations.md'
  );

  assert.deepEqual(errors, []);
  assert.equal(entries.length, 2 * REQUIRED_TENSES.length);
});

test('generateVerbConjugationQuestions: exact id, prompt, and model_answers for a known entry', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Falar.md'],
    'Verbs/Conjugations.md'
  );
  assert.deepEqual(errors, []);

  // falar is a fully regular -AR verb: every person in the Present matches the mechanically
  // derived form (stem "fal" + Conjugations.md's -AR endings), so the fallback sentence applies.
  const present = entries.find((e) => e.id === 'falar-present');
  assert.ok(present, 'expected a falar-present entry');
  assert.equal(present.type, 'verb_conjugation');
  assert.equal(present.topic, 'Verbs');
  assert.equal(present.subtopic, 'Falar');
  assert.equal(present.prompt, 'Conjugate "falar" in the Present (irregular forms only).');
  assert.deepEqual(present.model_answers, ['All conjugations are regular in this tense.']);
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
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Falar.md'],
    'Verbs/Conjugations.md'
  );

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
  // "Errar" (to err) ends in -ar, so family derivation succeeds; the errors below come from the
  // malformed table shape itself (bad row count / missing sections), a separate concern from
  // family classification.
  writeNote(
    vaultPath,
    'Verbs/Single/Errar.md',
    '# Errar\n\n## Present\n\n|Person|Conjugation|\n|---|---|\n|eu|**x**|\n'
  );
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Falar.md', 'Verbs/Single/Errar.md'],
    'Verbs/Conjugations.md'
  );

  // Falar contributes 6 good entries; Errar contributes 0 (bad row count for Present, missing
  // sections for the other 5) but every problem is reported, not swallowed.
  assert.equal(entries.length, REQUIRED_TENSES.length);
  assert.equal(errors.length, REQUIRED_TENSES.length);
  assert.ok(errors.every((e) => e.startsWith('Verbs/Single/Errar.md:')));
});

test('generateVerbConjugationQuestions reports an unclassifiable verb family rather than guessing', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Falar.md', sixTenseVerbNote('Falar', falarForms()));
  // "Xis" doesn't end in -ar/-er/-ir and has no FAMILY_OVERRIDES entry, so it cannot be
  // classified deterministically - this must fail loudly rather than guess a family.
  writeNote(vaultPath, 'Verbs/Single/Xis.md', sixTenseVerbNote('Xis', falarForms()));
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Falar.md', 'Verbs/Single/Xis.md'],
    'Verbs/Conjugations.md'
  );

  // Falar is unaffected; Xis contributes zero entries and exactly one error (not six - the
  // failure is at the family-derivation step, before the per-tense loop runs).
  assert.equal(entries.length, REQUIRED_TENSES.length);
  assert.ok(!entries.some((e) => e.subtopic === 'Xis'));
  const xisErrors = errors.filter((e) => e.startsWith('Verbs/Single/Xis.md:'));
  assert.equal(xisErrors.length, 1);
  assert.match(xisErrors[0], /cannot determine verb family/);
});

test('deriveFamily: explicit pôr override, literal suffix otherwise, null when neither applies', () => {
  assert.equal(deriveFamily('Pôr'), 'er');
  assert.equal(deriveFamily('por'), 'er'); // fold-tolerant: works without the accent too
  assert.equal(deriveFamily('Falar'), 'ar');
  assert.equal(deriveFamily('Comer'), 'er');
  assert.equal(deriveFamily('Abrir'), 'ir');
  assert.equal(deriveFamily('Xis'), null);
});

// A single synthetic verb ("testar", -AR family) engineered to cover, in one fixture: a tense with
// exactly one irregular form, a tense with several, a tense where all six are irregular, a tense
// where all six are regular (the fallback sentence), and an accent-only difference. Every expected
// value below was hand-derived from conjugationsFixture's -AR endings (stem "test" + ending) before
// being written, then cross-checked against this test run.
function testarForms() {
  return {
    // 1 irregular: eu only ("tosto" instead of the regular "testo").
    Present: { eu: 'tosto', voce: 'testa', nos: 'testamos', voces: 'testam' },
    // several irregular: eu/você/ele/nós irregular, vocês/eles regular.
    Preterite: { eu: 'testive', voce: 'testeve', nos: 'testivemos', voces: 'testaram' },
    // all six irregular.
    Imperfect: { eu: 'tinha', voce: 'tinha', nos: 'tínhamos', voces: 'tinham' },
    // all six regular -> fallback sentence.
    'Present Subjunctive': { eu: 'teste', voce: 'teste', nos: 'testemos', voces: 'testem' },
    // accent-only difference: eu's "testásse" differs from the regular "testasse" only by the accent.
    'Imperfect Subjunctive': { eu: 'testásse', voce: 'testasse', nos: 'testássemos', voces: 'testassem' },
    // all six regular (filler tense, not itself a required scenario).
    'Future Subjunctive': { eu: 'testar', voce: 'testar', nos: 'testarmos', voces: 'testarem' },
  };
}

test('generateVerbConjugationQuestions: irregular-only classification across one/several/all/none/accent-only scenarios', () => {
  const vaultPath = makeTempVault();
  writeNote(vaultPath, 'Verbs/Single/Testar.md', sixTenseVerbNote('Testar', testarForms()));
  writeNote(vaultPath, 'Verbs/Conjugations.md', conjugationsFixture(true));

  const { entries, errors } = generateVerbConjugationQuestions(
    vaultPath,
    ['Verbs/Single/Testar.md'],
    'Verbs/Conjugations.md'
  );
  assert.deepEqual(errors, []);
  assert.equal(entries.length, REQUIRED_TENSES.length);

  const byTense = Object.fromEntries(entries.map((e) => [e.source.heading, e]));

  // (a) one irregular form.
  assert.deepEqual(byTense['Present'].model_answers, ['eu: tosto']);

  // (b) several irregular forms.
  assert.deepEqual(byTense['Preterite'].model_answers, [
    'eu: testive',
    'você: testeve',
    'ele / ela: testeve',
    'nós: testivemos',
  ]);

  // (c) all six irregular.
  assert.deepEqual(byTense['Imperfect'].model_answers, [
    'eu: tinha',
    'você: tinha',
    'ele / ela: tinha',
    'nós: tínhamos',
    'vocês: tinham',
    'eles / elas: tinham',
  ]);

  // (d) all six regular -> fallback sentence, prompt still says "irregular forms only".
  const presentSubj = byTense['Present Subjunctive'];
  assert.deepEqual(presentSubj.model_answers, ['All conjugations are regular in this tense.']);
  assert.equal(presentSubj.prompt, 'Conjugate "testar" in the Present Subjunctive (irregular forms only).');

  // (e) accent-only difference: only eu (testásse vs regular testasse) counts as irregular.
  assert.deepEqual(byTense['Imperfect Subjunctive'].model_answers, ['eu: testásse']);
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

  const run1 = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md'], 'Verbs/Conjugations.md');
  const run2 = generateVerbConjugationQuestions(vaultPath, ['Verbs/Single/Falar.md'], 'Verbs/Conjugations.md');
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

const CONJUGATIONS_NOTE_PATH = 'Grammar/Verbs/Conjugations.md';

test('real vault: verb_conjugation entry count equals discovered file count x 6, no errors', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  assert.ok(verbNotePaths.length > 0, 'expected at least one verb note under Grammar/Verbs/Single');

  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);

  assert.deepEqual(errors, [], `expected no content issues in the real vault:\n${errors.join('\n')}`);
  assert.equal(entries.length, verbNotePaths.length * REQUIRED_TENSES.length);

  // Point-in-time sanity check only - NOT an architectural invariant. If this fails because a verb
  // note was added or removed, update the numbers below; do not treat 26/156 as a required constant.
  assert.equal(verbNotePaths.length, 26);
  assert.equal(entries.length, 156);
});

test('real vault: Estar Present entry lists only the irregular persons (nós "estamos" is regular)', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  const estarPresent = entries.find((e) => e.id === 'estar-present');
  assert.ok(estarPresent, 'expected an estar-present entry');
  // nós "estamos" matches the mechanically-derived regular form ("est" + "-amos") exactly, so it
  // is omitted; every other person's real form diverges from the regular pattern.
  assert.deepEqual(estarPresent.model_answers, [
    'eu: estou',
    'você: está',
    'ele / ela: está',
    'vocês: estão',
    'eles / elas: estão',
  ]);
});

test('real vault: Estar Imperfect is fully regular -> fallback sentence', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  const estarImperfect = entries.find((e) => e.id === 'estar-imperfect');
  assert.ok(estarImperfect, 'expected an estar-imperfect entry');
  assert.deepEqual(estarImperfect.model_answers, ['All conjugations are regular in this tense.']);
});

test('real vault: Ter Present is irregular everywhere except nós, including an accent-only divergence', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  const terPresent = entries.find((e) => e.id === 'ter-present');
  assert.ok(terPresent, 'expected a ter-present entry');
  // vocês "têm" vs the regular "tem" differs only by the circumflex accent, and is still counted
  // as irregular under the literal, accent-sensitive comparison rule.
  assert.deepEqual(terPresent.model_answers, [
    'eu: tenho',
    'você: tem',
    'ele / ela: tem',
    'vocês: têm',
    'eles / elas: têm',
  ]);
});

test('real vault: Fazer Present mixes irregular (eu, você, ele) and regular (nós, vocês, eles) persons', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  const fazerPresent = entries.find((e) => e.id === 'fazer-present');
  assert.ok(fazerPresent, 'expected a fazer-present entry');
  assert.deepEqual(fazerPresent.model_answers, ['eu: faço', 'você: faz', 'ele / ela: faz']);

  const fazerImperfect = entries.find((e) => e.id === 'fazer-imperfect');
  assert.ok(fazerImperfect, 'expected a fazer-imperfect entry');
  assert.deepEqual(fazerImperfect.model_answers, ['All conjugations are regular in this tense.']);
});

test('real vault: Pedir, Dormir, and Seguir Present each have exactly one irregular person (eu)', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  assert.deepEqual(entries.find((e) => e.id === 'pedir-present').model_answers, ['eu: peço']);
  assert.deepEqual(entries.find((e) => e.id === 'dormir-present').model_answers, ['eu: durmo']);
  assert.deepEqual(entries.find((e) => e.id === 'seguir-present').model_answers, ['eu: sigo']);
});

test('real vault: Pôr uses the explicit -ER family override and is fully irregular in the Present', () => {
  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  // "pôr" doesn't end in -ar/-er/-ir textually; without the FAMILY_OVERRIDES entry this note would
  // fail family derivation entirely. With the override applied (stem "p" + regular -ER endings),
  // every person's real form still diverges from the derived regular form.
  const porPresent = entries.find((e) => e.id === 'por-present');
  assert.ok(porPresent, 'expected a por-present entry');
  assert.deepEqual(porPresent.model_answers, [
    'eu: ponho',
    'você: põe',
    'ele / ela: põe',
    'nós: pomos',
    'vocês: põem',
    'eles / elas: põem',
  ]);
});

test('real vault: verb_conjugation ids are unaffected by the irregular-only content change', () => {
  const bundlePath = path.join(__dirname, '..', 'app', 'public', 'content-bundle.json');
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const publishedIds = bundle.questions
    .filter((q) => q.type === 'verb_conjugation')
    .map((q) => q.id)
    .sort();

  const vaultPath = loadRealVaultPath();
  const verbNotePaths = discoverRealVerbNotePaths(vaultPath);
  const { entries, errors } = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(errors, []);

  const generatedIds = entries.map((e) => e.id).sort();
  assert.deepEqual(generatedIds, publishedIds);
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

  const run1 = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  const run2 = generateVerbConjugationQuestions(vaultPath, verbNotePaths, CONJUGATIONS_NOTE_PATH);
  assert.deepEqual(run1, run2);

  const pattern1 = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');
  const pattern2 = generateConjugationPatternQuestions(vaultPath, 'Grammar/Verbs/Conjugations.md');
  assert.deepEqual(pattern1, pattern2);
});
