// Pure markdown-table extraction/validation shared by the verb_conjugation and conjugation_pattern
// generators (conjugationQuestions.js). Deterministic only: no AI, no invented content — any shape
// or labeling problem is reported as a structured error rather than guessed around.

// Accent/case-fold for comparing person labels loosely (e.g. tolerating "eles" vs "eles / elas",
// or a missing accent) without touching the linguistic content of a conjugated form.
function foldForCompare(text) {
  let result = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0);
    // Unicode combining diacritical marks block (0x0300-0x036F) - strip accents without touching
    // any other character, so e.g. "você"/"voce" and "nós"/"nos" compare equal.
    if (code >= 0x0300 && code <= 0x036f) continue;
    result += ch;
  }
  return result.toLowerCase().trim();
}

// Removes all ** markers, keeping the rest of the cell — used where the whole cell is the answer
// (verb_conjugation, whose source cells are always fully bolded, e.g. **estou**).
function stripBoldMarkers(cell) {
  return cell.replace(/\*\*/g, '').trim();
}

// Returns only the substring inside the first **...** span, or null if the cell has none — used
// where just the delimited ending is the answer (conjugation_pattern, e.g. fal**o** -> "o").
function extractBoldSpan(cell) {
  const m = cell.match(/\*\*(.+?)\*\*/);
  return m ? m[1].trim() : null;
}

// Returns the body text strictly between a "## <headingText>" line and the next line starting a
// level-1 or level-2 heading (or end of file). Null if the heading isn't found at all.
function findSection(bodyText, headingText) {
  const lines = bodyText.split('\n');
  const target = `## ${headingText}`;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === target) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function isTableRow(line) {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 1;
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

function splitRow(line) {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, -1);
  return inner.split('|').map((c) => c.trim());
}

// Finds the first contiguous block of markdown-table lines in sectionText. Cell text is returned
// raw (bold markers intact) - callers decide whether to strip or extract a bold span. Returns
// { headerCells: string[], rows: string[][] }, or null if no table is found.
function extractFirstTable(sectionText) {
  const lines = sectionText.split('\n');
  const tableLines = [];
  let started = false;
  for (const line of lines) {
    if (isTableRow(line)) {
      tableLines.push(line);
      started = true;
    } else if (started) {
      break;
    }
  }
  if (tableLines.length < 2) return null;

  const headerCells = splitRow(tableLines[0]);
  const secondRowCells = splitRow(tableLines[1]);
  const dataLines = isSeparatorRow(secondRowCells) ? tableLines.slice(2) : tableLines.slice(1);

  return { headerCells, rows: dataLines.map(splitRow) };
}

// Locates the tense's table, validates its shape, and validates person labels positionally
// (tolerant of minor label-text variation - see foldForCompare). personLabels are expected
// substrings, in row order. Returns { ok: true, headerCells, rows } (rows keep raw cell text) or
// { ok: false, error }.
function extractTenseTable(bodyText, tenseName, expectedColumnCount, expectedRowCount, personLabels) {
  const section = findSection(bodyText, tenseName);
  if (section === null) {
    return { ok: false, error: `missing tense section: "${tenseName}"` };
  }

  const table = extractFirstTable(section);
  if (table === null) {
    return { ok: false, error: `malformed: no table found under "${tenseName}"` };
  }

  if (table.headerCells.length !== expectedColumnCount) {
    return {
      ok: false,
      error:
        `malformed table under "${tenseName}": expected ${expectedColumnCount} columns, ` +
        `found ${table.headerCells.length}`,
    };
  }

  if (table.rows.length !== expectedRowCount) {
    return {
      ok: false,
      error:
        `malformed table under "${tenseName}": expected ${expectedRowCount} rows, ` +
        `found ${table.rows.length}`,
    };
  }

  for (let i = 0; i < personLabels.length; i++) {
    const expected = foldForCompare(personLabels[i]);
    const actual = foldForCompare(table.rows[i][0]);
    if (!actual.includes(expected)) {
      return {
        ok: false,
        error:
          `ambiguous person label under "${tenseName}" row ${i + 1}: ` +
          `expected label containing ${JSON.stringify(personLabels[i])}, found ${JSON.stringify(table.rows[i][0])}`,
      };
    }
  }

  return { ok: true, headerCells: table.headerCells, rows: table.rows };
}

module.exports = {
  foldForCompare,
  stripBoldMarkers,
  extractBoldSpan,
  findSection,
  extractFirstTable,
  extractTenseTable,
};
