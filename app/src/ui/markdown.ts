// Minimal Markdown support for the Notes screen — only the subset actually present in the
// published vault notes (headings, bold, paragraphs, lists, hr, fenced code, tables). Unknown
// constructs (italics, links, blockquotes, inline code, etc. — none observed in the real notes)
// are never specially parsed; they fall through to literal paragraph text rather than failing.
// This is deliberately more tolerant than vault-tools/tableParser.js, which is a strict
// question-generation parser — this one is display-only and must never throw or drop content.

import { el } from './dom';

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'hr' }
  | { kind: 'code'; lines: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

export interface InlineSpan {
  text: string;
  bold: boolean;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function listItemType(trimmed: string): 'ul' | 'ol' | null {
  if (/^-\s+/.test(trimmed)) return 'ul';
  if (/^\d+\.\s+/.test(trimmed)) return 'ol';
  return null;
}

function listItemText(trimmed: string): string {
  const ulMatch = /^-\s+(.*)$/.exec(trimmed);
  if (ulMatch) return ulMatch[1];
  const olMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
  if (olMatch) return olMatch[1];
  return trimmed;
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((cell) => cell.trim());
}

function isTableSeparatorRow(line: string): boolean {
  if (!line.includes('|')) return false;
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

// Ragged rows are never truncated (a display-only tolerance requested for the Notes screen — the
// strict vault-tools/tableParser.js validation used for question generation is unaffected). A row
// shorter than the header is padded with empty cells; a row longer than the header keeps every
// cell, even though that makes it wider than the header for that one row.
function normalizeTableRow(row: string[], headerLength: number): string[] {
  if (row.length >= headerLength) return row;
  return [...row, ...Array<string>(headerLength - row.length).fill('')];
}

export function parseMarkdownBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (isBlank(trimmed)) {
      i++;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push({ kind: 'heading', level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume the closing fence, if present
      blocks.push({ kind: 'code', lines: codeLines });
      continue;
    }

    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
      const header = splitTableRow(lines[i]);
      i += 2;
      const rawRows: string[][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        rawRows.push(splitTableRow(lines[i]));
        i++;
      }
      const rows = rawRows.map((row) => normalizeTableRow(row, header.length));
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    const listType = listItemType(trimmed);
    if (listType) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (listItemType(t) === listType) {
          items.push(listItemText(t));
          j++;
        } else if (isBlank(t)) {
          // Tolerates the vault's "loose list" export artifact, where separator lines between
          // items are sometimes whitespace-only rather than truly empty.
          let k = j;
          while (k < lines.length && isBlank(lines[k])) k++;
          if (k < lines.length && listItemType(lines[k].trim()) === listType) {
            j = k;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered: listType === 'ol', items });
      i = j;
      continue;
    }

    // Paragraph: consecutive non-blank lines that don't start another block. Every note in the
    // corpus uses adjacent lines only for a deliberate hard line break (e.g. a Portuguese line
    // followed by its English translation), never soft-wrapped prose — so each source line becomes
    // its own visual line (joined with <br> at render time) rather than being merged into one.
    const paraLines: string[] = [];
    let j = i;
    while (j < lines.length) {
      const t = lines[j].trim();
      if (
        isBlank(t) ||
        /^#{1,6}\s+/.test(t) ||
        /^-{3,}$/.test(t) ||
        t.startsWith('```') ||
        listItemType(t) !== null ||
        (t.includes('|') && j + 1 < lines.length && isTableSeparatorRow(lines[j + 1]))
      ) {
        break;
      }
      paraLines.push(t);
      j++;
    }
    blocks.push({ kind: 'paragraph', lines: paraLines });
    i = j;
  }

  return blocks;
}

// Splits on **bold** spans. An unmatched/odd `**` never throws — the unmatched marker and
// surrounding text simply remain in a plain (non-bold) span, which is exactly the "degrade to
// readable text" behaviour required for constructs the renderer doesn't specially handle.
export function parseInlineSpans(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    spans.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), bold: false });
  }
  return spans;
}

function inlineNodes(text: string): (Node | string)[] {
  return parseInlineSpans(text).map((span) => (span.bold ? el('strong', {}, [span.text]) : span.text));
}

function paragraphNodes(lines: string[]): (Node | string)[] {
  const out: (Node | string)[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push(el('br'));
    out.push(...inlineNodes(line));
  });
  return out;
}

function renderBlock(block: Block): HTMLElement {
  switch (block.kind) {
    case 'heading': {
      const tag = `h${block.level}` as keyof HTMLElementTagNameMap;
      return el(tag, {}, inlineNodes(block.text));
    }
    case 'paragraph':
      return el('p', {}, paragraphNodes(block.lines));
    case 'list':
      return el(
        block.ordered ? 'ol' : 'ul',
        {},
        block.items.map((item) => el('li', {}, inlineNodes(item)))
      );
    case 'hr':
      return el('hr');
    case 'code':
      return el('pre', {}, [el('code', {}, [block.lines.join('\n')])]);
    case 'table':
      return el('table', {}, [
        el('thead', {}, [el('tr', {}, block.header.map((cell) => el('th', {}, inlineNodes(cell))))]),
        el(
          'tbody',
          {},
          block.rows.map((row) => el('tr', {}, row.map((cell) => el('td', {}, inlineNodes(cell)))))
        ),
      ]);
  }
}

export function renderMarkdown(text: string): HTMLElement {
  return el(
    'div',
    { class: 'note-content' },
    parseMarkdownBlocks(text).map((block) => renderBlock(block))
  );
}
