// Tests for the shared markdown-table extraction/validation helpers used by both deterministic
// conjugation-question generators. Uses Node's built-in test runner: `node --test tableParser.test.js`.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  foldForCompare,
  stripBoldMarkers,
  extractBoldSpan,
  findSection,
  extractFirstTable,
  extractTenseTable,
} = require('./tableParser');

const SIX_PERSON_LABELS = ['eu', 'você', 'ele', 'nós', 'vocês', 'eles'];
const FOUR_PERSON_LABELS = ['eu', 'você', 'nós', 'vocês'];

function cleanVerbNoteFixture() {
  return `# Estar

## Meaning

**estar** = to be

---

## Present

|Person|Conjugation|
|---|---|
|eu|**estou**|
|você|**está**|
|ele / ela|**está**|
|nós|**estamos**|
|vocês|**estão**|
|eles / elas|**estão**|

---

## Preterite

|Person|Conjugation|
|---|---|
|eu|**estive**|
|você|**esteve**|
|ele / ela|**esteve**|
|nós|**estivemos**|
|vocês|**estiveram**|
|eles / elas|**estiveram**|

---

# How the stems are related

Some prose.
`;
}

function spacedPipeStyleFixture() {
  return `## Present Continuous

### Estar

| Person | Conjugation |
| ------ | ----------- |
| eu     | estou       |
| você   | está        |
| nós    | estamos     |
| vocês  | estão       |

---

## Preterite

| Person | Conjugation |
| ------ | ----------- |
| eu     | estive      |
| você   | esteve      |
| nós    | estivemos   |
| vocês  | estiveram   |
`;
}

function conjugationsFamilyFixture() {
  return `# Cheat Sheet

## Present

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|fal**o**|com**o**|abr**o**|
|você|fal**a**|com**e**|abr**e**|
|nós|fal**amos**|com**emos**|abr**imos**|
|vocês|fal**am**|com**em**|abr**em**|

---

## Future Subjunctive

|Person|**-AR**|**-ER**|**-IR**|
|---|---|---|---|
|eu|falar|comer|abrir|
|você|falar|comer|abrir|
|nós|falarmos|comermos|abrirmos|
|vocês|falarem|comerem|abrirem|
`;
}

test('foldForCompare strips accents and case for comparison', () => {
  assert.equal(foldForCompare('você'), foldForCompare('voce'));
  assert.equal(foldForCompare('Nós'), foldForCompare('nos'));
  assert.equal(foldForCompare('ESTÁ'), foldForCompare('esta'));
});

test('stripBoldMarkers removes ** but keeps the whole cell', () => {
  assert.equal(stripBoldMarkers('**estou**'), 'estou');
  assert.equal(stripBoldMarkers('fal**o**'), 'falo');
  assert.equal(stripBoldMarkers('falar'), 'falar');
});

test('extractBoldSpan returns only the delimited span, or null if absent', () => {
  assert.equal(extractBoldSpan('fal**o**'), 'o');
  assert.equal(extractBoldSpan('**estou**'), 'estou');
  assert.equal(extractBoldSpan('falar'), null);
});

test('findSection locates a tense section and stops at the next heading', () => {
  const body = cleanVerbNoteFixture();
  const present = findSection(body, 'Present');
  assert.ok(present.includes('|eu|**estou**|'));
  assert.ok(!present.includes('Preterite'));
  assert.ok(!present.includes('How the stems are related'));
});

test('findSection returns null when the heading is missing', () => {
  const body = cleanVerbNoteFixture();
  assert.equal(findSection(body, 'Future Subjunctive'), null);
});

test('extractFirstTable parses the tight pipe style with bold markers intact', () => {
  const section = findSection(cleanVerbNoteFixture(), 'Present');
  const table = extractFirstTable(section);
  assert.deepEqual(table.headerCells, ['Person', 'Conjugation']);
  assert.deepEqual(table.rows[0], ['eu', '**estou**']);
  assert.equal(table.rows.length, 6);
});

test('extractFirstTable parses the spaced pipe style', () => {
  const section = findSection(spacedPipeStyleFixture(), 'Preterite');
  const table = extractFirstTable(section);
  assert.deepEqual(table.headerCells, ['Person', 'Conjugation']);
  assert.deepEqual(table.rows[0], ['eu', 'estive']);
  assert.equal(table.rows.length, 4);
});

test('extractFirstTable returns null when no table follows the heading', () => {
  const body = '## Present\n\nJust some prose, no table here.\n\n## Next\n';
  const section = findSection(body, 'Present');
  assert.equal(extractFirstTable(section), null);
});

test('extractFirstTable only takes the first table (Present Continuous style with two tables)', () => {
  const body = spacedPipeStyleFixture();
  const section = findSection(body, 'Present Continuous');
  const table = extractFirstTable(section);
  // The first table under "Present Continuous" is the Estar sub-table (4 rows), not a later one.
  assert.equal(table.rows.length, 4);
  assert.deepEqual(table.rows[0], ['eu', 'estou']);
});

test('extractTenseTable succeeds end-to-end for a clean 6-row verb-note table', () => {
  const result = extractTenseTable(cleanVerbNoteFixture(), 'Present', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows[0], ['eu', '**estou**']);
  assert.deepEqual(result.rows[5], ['eles / elas', '**estão**']);
});

test('extractTenseTable succeeds end-to-end for a clean 4-row/4-col family table', () => {
  const result = extractTenseTable(conjugationsFamilyFixture(), 'Present', 4, 4, FOUR_PERSON_LABELS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.headerCells, ['Person', '**-AR**', '**-ER**', '**-IR**']);
  assert.deepEqual(result.rows[0], ['eu', 'fal**o**', 'com**o**', 'abr**o**']);
});

test('extractTenseTable tolerates Ser.md-style "eles" without "/ elas"', () => {
  const body = `## Present

|Person|Conjugation|
|---|---|
|eu|**sou**|
|você|**é**|
|ele / ela|**é**|
|nós|**somos**|
|vocês|**são**|
|eles|**são**|
`;
  const result = extractTenseTable(body, 'Present', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows[5], ['eles', '**são**']);
});

test('extractTenseTable reports a missing tense section rather than inventing one', () => {
  const result = extractTenseTable(cleanVerbNoteFixture(), 'Future Subjunctive', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, false);
  assert.match(result.error, /missing tense section/);
  assert.match(result.error, /Future Subjunctive/);
});

test('extractTenseTable reports a table with the wrong row count', () => {
  const body = `## Present

|Person|Conjugation|
|---|---|
|eu|**estou**|
|você|**está**|
`;
  const result = extractTenseTable(body, 'Present', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, false);
  assert.match(result.error, /expected 6 rows, found 2/);
});

test('extractTenseTable reports a table with the wrong column count', () => {
  const result = extractTenseTable(conjugationsFamilyFixture(), 'Present', 2, 4, FOUR_PERSON_LABELS);
  assert.equal(result.ok, false);
  assert.match(result.error, /expected 2 columns, found 4/);
});

test('extractTenseTable reports an ambiguous/shuffled person label rather than guessing', () => {
  const body = `## Present

|Person|Conjugation|
|---|---|
|eu|**estou**|
|nós|**estamos**|
|ele / ela|**está**|
|você|**está**|
|vocês|**estão**|
|eles / elas|**estão**|
`;
  // Row 2 says "nós" but position 2 (index 1) expects "você".
  const result = extractTenseTable(body, 'Present', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, false);
  assert.match(result.error, /ambiguous person label/);
  assert.match(result.error, /row 2/);
});

test('extractTenseTable reports no-table-under-heading distinctly from missing-heading', () => {
  const body = '## Present\n\nNo table here at all.\n\n## Preterite\n';
  const result = extractTenseTable(body, 'Present', 2, 6, SIX_PERSON_LABELS);
  assert.equal(result.ok, false);
  assert.match(result.error, /malformed: no table found/);
});
