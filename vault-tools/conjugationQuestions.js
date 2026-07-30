// Deterministic question generators sourced from the vault's verb-conjugation notes. No AI, no
// invented content: every entry is built strictly from a source table validated by tableParser.js;
// anything that doesn't parse cleanly is reported in `errors` instead of guessed around.

const fs = require('fs');
const path = require('path');
const { extractTenseTable, stripBoldMarkers, extractBoldSpan, foldForCompare } = require('./tableParser');

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

// Maps each of the 6 verb-note person rows (VERB_PERSON_LABELS order) to the row index it shares
// in the 4-person Conjugations.md table (PATTERN_PERSON_LABELS order): ele/ela takes the same
// regular ending as você, eles/elas the same as vocês.
const VERB_TO_PATTERN_INDEX = [0, 1, 1, 2, 3, 3];

// Verbs whose infinitive doesn't end in -ar/-er/-ir, keyed by foldForCompare so accents/case don't
// matter. "pôr" and its compounds (compor, propor, etc., not yet in the vault) conjugate as -ER
// verbs despite the spelling - this is the only override the current 26-verb corpus needs. Do not
// add further entries speculatively; see deriveFamily's failure path for verbs this can't cover.
const FAMILY_OVERRIDES = { por: 'er' };

// Deterministic family lookup for a verb's infinitive: the override map first, then the literal
// last-two-letters suffix. Returns null (never a guess) when neither applies, so callers can report
// an error instead of silently misclassifying every form as "irregular".
function deriveFamily(verbName) {
  const overridden = FAMILY_OVERRIDES[foldForCompare(verbName)];
  if (overridden) return overridden;
  const suffix = verbName.toLowerCase().slice(-2);
  return FAMILY_ORDER.includes(suffix) ? suffix : null;
}

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

// Parses Conjugations.md's 4-person regular-ending tables into a lookup keyed by
// [tenseName][family][personIndex] -> bold-marked ending (e.g. endings.Present.ar[0] === 'o').
// This is the same table generateConjugationPatternQuestions reads - reusing it here (rather than
// hand-coding a second copy of the regular endings) means generateVerbConjugationQuestions never
// duplicates the linguistic data, only re-derives a lookup shape suited to per-person comparison.
function loadRegularEndings(vaultPath, conjugationsPath) {
  const endings = {};
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

    const tenseEndings = { ar: {}, er: {}, ir: {} };
    let tenseOk = true;
    for (let familyIndex = 0; familyIndex < FAMILY_ORDER.length; familyIndex++) {
      const family = FAMILY_ORDER[familyIndex];
      const columnIndex = familyIndex + 1;
      for (let personIndex = 0; personIndex < result.rows.length; personIndex++) {
        const cell = result.rows[personIndex][columnIndex];
        const ending = extractBoldSpan(cell);
        if (ending === null) {
          errors.push(
            `${conjugationsPath}: no bold-marked ending found under "${tenseName}" (-${family.toUpperCase()}) ` +
              `for person ${JSON.stringify(result.rows[personIndex][0])} (cell: ${JSON.stringify(cell)})`
          );
          tenseOk = false;
          continue;
        }
        tenseEndings[family][personIndex] = ending;
      }
    }

    if (tenseOk) endings[tenseName] = tenseEndings;
  }

  return { endings, errors };
}

// One question per (verb note x required tense). model_answers keep only the persons whose actual
// form differs (literal, accent-sensitive comparison) from the mechanically-derived expected
// regular form (stem + the matching regular ending from Conjugations.md) - never a re-derivation of
// the actual form itself, which always comes straight from the source table. If every person
// matches the regular pattern, the single fallback sentence below is used instead.
function generateVerbConjugationQuestions(vaultPath, verbNotePaths, conjugationsPath) {
  const entries = [];
  const errors = [];

  const { endings: regularEndings, errors: endingErrors } = loadRegularEndings(vaultPath, conjugationsPath);
  errors.push(...endingErrors);

  for (const notePath of verbNotePaths) {
    const fullPath = path.join(vaultPath, notePath);
    const bodyText = fs.readFileSync(fullPath, 'utf8');
    const verbName = path.basename(notePath, path.extname(notePath));

    const family = deriveFamily(verbName);
    if (!family) {
      errors.push(
        `${notePath}: cannot determine verb family for "${verbName}" ` +
          `(expected an infinitive ending in -ar/-er/-ir, or an explicit override in FAMILY_OVERRIDES)`
      );
      continue;
    }
    const stem = verbName.toLowerCase().slice(0, -2);

    for (const tenseName of REQUIRED_TENSES) {
      const result = extractTenseTable(bodyText, tenseName, 2, 6, VERB_PERSON_LABELS);
      if (!result.ok) {
        errors.push(`${notePath}: ${result.error}`);
        continue;
      }

      const tenseEndings = regularEndings[tenseName];
      if (!tenseEndings) {
        errors.push(
          `${notePath}: no regular-ending data available for "${tenseName}" (see ${conjugationsPath} errors above)`
        );
        continue;
      }
      const familyEndings = tenseEndings[family];

      const irregularPairs = [];
      for (let i = 0; i < VERB_PERSON_LABELS.length; i++) {
        const person = result.rows[i][0];
        const actualForm = stripBoldMarkers(result.rows[i][1]);
        const expectedForm = stem + familyEndings[VERB_TO_PATTERN_INDEX[i]];
        if (actualForm !== expectedForm) {
          irregularPairs.push(`${person}: ${actualForm}`);
        }
      }

      const isFullyRegular = irregularPairs.length === 0;
      const modelAnswers = isFullyRegular ? ['All conjugations are regular in this tense.'] : irregularPairs;

      entries.push({
        id: `${slug(verbName)}-${slug(tenseName)}`,
        type: 'verb_conjugation',
        topic: 'Verbs',
        subtopic: verbName,
        direction: null,
        difficulty: 'medium',
        register: 'neutral',
        prompt: `Conjugate "${verbName.toLowerCase()}" in the ${tenseName} (irregular forms only).`,
        model_answers: modelAnswers,
        explanation: isFullyRegular
          ? `Every person in the ${tenseName} of "${verbName.toLowerCase()}" follows the regular pattern, from ${notePath}.`
          : `Irregular ${tenseName} form(s) of "${verbName.toLowerCase()}" (regular persons follow the standard pattern and are omitted), from ${notePath}.`,
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
  deriveFamily,
  generateVerbConjugationQuestions,
  generateConjugationPatternQuestions,
};
