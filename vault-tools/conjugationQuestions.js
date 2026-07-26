// Deterministic question generators sourced from the vault's verb-conjugation notes. No AI, no
// invented content: every entry is built strictly from a source table validated by tableParser.js;
// anything that doesn't parse cleanly is reported in `errors` instead of guessed around.

const fs = require('fs');
const path = require('path');
const { extractTenseTable, stripBoldMarkers, extractBoldSpan } = require('./tableParser');

// The six tenses in scope, per the feature spec — never more, never fewer, regardless of what other
// tense sections a note happens to contain (e.g. Present Continuous, Near Future are out of scope).
const REQUIRED_TENSES = [
  'Present',
  'Preterite',
  'Imperfect',
  'Present Subjunctive',
  'Imperfect Subjunctive',
  'Future Subjunctive',
];

const VERB_PERSON_LABELS = ['eu', 'você', 'ele', 'nós', 'vocês', 'eles'];
const PATTERN_PERSON_LABELS = ['eu', 'você', 'nós', 'vocês'];
const FAMILY_ORDER = ['ar', 'er', 'ir'];

// Accent/case-fold + collapse to a dash-separated id fragment (e.g. "Pôr" -> "por",
// "Imperfect Subjunctive" -> "imperfect-subjunctive"). Deterministic and stateless, so the same
// source name always mints the same id fragment.
function slug(text) {
  let stripped = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue;
    stripped += ch;
  }
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// One question per (verb note x required tense). model_answers preserve the source's own person
// label verbatim (e.g. "ele / ela"), with only the ** markers stripped from the conjugated form -
// the form itself is never re-derived.
function generateVerbConjugationQuestions(vaultPath, verbNotePaths) {
  const entries = [];
  const errors = [];

  for (const notePath of verbNotePaths) {
    const fullPath = path.join(vaultPath, notePath);
    const bodyText = fs.readFileSync(fullPath, 'utf8');
    const verbName = path.basename(notePath, path.extname(notePath));

    for (const tenseName of REQUIRED_TENSES) {
      const result = extractTenseTable(bodyText, tenseName, 2, 6, VERB_PERSON_LABELS);
      if (!result.ok) {
        errors.push(`${notePath}: ${result.error}`);
        continue;
      }

      const modelAnswers = result.rows.map(([person, form]) => `${person}: ${stripBoldMarkers(form)}`);

      entries.push({
        id: `${slug(verbName)}-${slug(tenseName)}`,
        type: 'verb_conjugation',
        topic: 'Verbs',
        subtopic: verbName,
        direction: null,
        difficulty: 'medium',
        register: 'neutral',
        prompt: `Conjugate "${verbName.toLowerCase()}" in the ${tenseName} (all persons).`,
        model_answers: modelAnswers,
        explanation: `Full ${tenseName} conjugation of "${verbName.toLowerCase()}", from ${notePath}.`,
        source: { note: notePath, heading: tenseName },
      });
    }
  }

  return { entries, errors };
}

// One question per (tense x verb family), never combining families or tenses. model_answers are the
// bold-marked ENDING only (e.g. "eu: -o"), never a fully conjugated example word - that distinction is
// the whole point of this generator vs. generateVerbConjugationQuestions.
function generateConjugationPatternQuestions(vaultPath, conjugationsPath) {
  const entries = [];
  const errors = [];

  const fullPath = path.join(vaultPath, conjugationsPath);
  const bodyText = fs.readFileSync(fullPath, 'utf8');

  for (const tenseName of REQUIRED_TENSES) {
    const result = extractTenseTable(bodyText, tenseName, 4, 4, PATTERN_PERSON_LABELS);
    if (!result.ok) {
      errors.push(`${conjugationsPath}: ${result.error}`);
      continue;
    }

    const headerFamilies = result.headerCells
      .slice(1)
      .map((cell) => stripBoldMarkers(cell).replace(/^-/, '').toLowerCase());
    const headerMatches = FAMILY_ORDER.every((family, i) => headerFamilies[i] === family);
    if (!headerMatches) {
      errors.push(
        `${conjugationsPath}: unexpected family header under "${tenseName}": ` +
          `expected [-AR, -ER, -IR], found ${JSON.stringify(result.headerCells.slice(1))}`
      );
      continue;
    }

    for (let familyIndex = 0; familyIndex < FAMILY_ORDER.length; familyIndex++) {
      const family = FAMILY_ORDER[familyIndex];
      const columnIndex = familyIndex + 1;
      const modelAnswers = [];
      let familyOk = true;

      for (const row of result.rows) {
        const person = row[0];
        const cell = row[columnIndex];
        const ending = extractBoldSpan(cell);
        if (ending === null) {
          errors.push(
            `${conjugationsPath}: no bold-marked ending found under "${tenseName}" (-${family.toUpperCase()}) ` +
              `for person ${JSON.stringify(person)} (cell: ${JSON.stringify(cell)})`
          );
          familyOk = false;
          continue;
        }
        modelAnswers.push(`${person}: -${ending}`);
      }

      if (!familyOk) continue;

      entries.push({
        id: `conjugations-${slug(tenseName)}-${family}`,
        type: 'conjugation_pattern',
        topic: 'Verbs',
        subtopic: `-${family.toUpperCase()} verbs`,
        direction: null,
        difficulty: 'medium',
        register: 'neutral',
        prompt: `What are the regular -${family.toUpperCase()} verb endings for the ${tenseName} tense (all persons)?`,
        model_answers: modelAnswers,
        explanation: `Regular -${family.toUpperCase()} verb endings for the ${tenseName} tense, from ${conjugationsPath}.`,
        source: { note: conjugationsPath, heading: tenseName },
      });
    }
  }

  return { entries, errors };
}

module.exports = {
  REQUIRED_TENSES,
  slug,
  generateVerbConjugationQuestions,
  generateConjugationPatternQuestions,
};
