import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInlineSpans, parseMarkdownBlocks } from './markdown';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('parseMarkdownBlocks', () => {
  it('parses heading levels 1 through 6', () => {
    const blocks = parseMarkdownBlocks('# One\n\n## Two\n\n### Three\n\n###### Six');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'One' },
      { kind: 'heading', level: 2, text: 'Two' },
      { kind: 'heading', level: 3, text: 'Three' },
      { kind: 'heading', level: 6, text: 'Six' },
    ]);
  });

  it('joins adjacent non-blank lines into one paragraph block (the PT/EN hard-break idiom)', () => {
    const blocks = parseMarkdownBlocks('**Cabe aqui?**  \nDoes it fit here?\n\nNext paragraph.');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['**Cabe aqui?**', 'Does it fit here?'] },
      { kind: 'paragraph', lines: ['Next paragraph.'] },
    ]);
  });

  it('parses a tight-pipe 2-column table (Verbs/Single/*.md style)', () => {
    const md = '|Person|Conjugation|\n|---|---|\n|eu|**estou**|\n|você|**está**|';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: ['Person', 'Conjugation'],
        rows: [
          ['eu', '**estou**'],
          ['você', '**está**'],
        ],
      },
    ]);
  });

  it('parses a spaced-pipe 4-column table (Conjugations.md style)', () => {
    const md =
      '| Person | **-AR** | **-ER** | **-IR** |\n' +
      '| ------ | ------- | ------- | ------- |\n' +
      '| eu     | fal**o**    | com**o**    | abr**o**    |';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: ['Person', '**-AR**', '**-ER**', '**-IR**'],
        rows: [['eu', 'fal**o**', 'com**o**', 'abr**o**']],
      },
    ]);
  });

  it('pads a ragged row with fewer cells than the header, and never truncates a row with more', () => {
    const md = '|A|B|\n|---|---|\n|only-one|\n|x|y|z (extra)|';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: ['A', 'B'],
        rows: [
          ['only-one', ''],
          ['x', 'y', 'z (extra)'],
        ],
      },
    ]);
  });

  it('does not confuse a horizontal rule with a table separator row', () => {
    const blocks = parseMarkdownBlocks('Some text with a | pipe\n\n---\n\nMore text');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Some text with a | pipe'] },
      { kind: 'hr' },
      { kind: 'paragraph', lines: ['More text'] },
    ]);
  });

  it('parses a contiguous unordered list', () => {
    const blocks = parseMarkdownBlocks('Examples\n\n- estou falando\n- estou comendo\n- estou abrindo\n\n---');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Examples'] },
      { kind: 'list', ordered: false, items: ['estou falando', 'estou comendo', 'estou abrindo'] },
      { kind: 'hr' },
    ]);
  });

  it('tolerates whitespace-only "loose list" separator lines between items', () => {
    const blocks = parseMarkdownBlocks('- first\n    \n- second\n    \n- third');
    expect(blocks).toEqual([{ kind: 'list', ordered: false, items: ['first', 'second', 'third'] }]);
  });

  it('parses fenced code blocks with no language tag', () => {
    const blocks = parseMarkdownBlocks('```\nestar (present) + gerund\n```');
    expect(blocks).toEqual([{ kind: 'code', lines: ['estar (present) + gerund'] }]);
  });

  it('closes an unterminated fenced code block at end of file rather than failing', () => {
    const blocks = parseMarkdownBlocks('```\nline one\nline two');
    expect(blocks).toEqual([{ kind: 'code', lines: ['line one', 'line two'] }]);
  });

  it('degrades unsupported constructs (italics, links) to literal paragraph text', () => {
    const blocks = parseMarkdownBlocks('This has *italic* and a [link](https://example.com) in it.');
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['This has *italic* and a [link](https://example.com) in it.'] },
    ]);
  });

  it('parses real-vault content end to end (Caber.md-style stem-map section)', () => {
    const md = '# Irregular stem map\n\nPresent\n\n**caibo**\n\n↓\n\nPresent Subjunctive\n\n**caiba**';
    const blocks = parseMarkdownBlocks(md);
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Irregular stem map' },
      { kind: 'paragraph', lines: ['Present'] },
      { kind: 'paragraph', lines: ['**caibo**'] },
      { kind: 'paragraph', lines: ['↓'] },
      { kind: 'paragraph', lines: ['Present Subjunctive'] },
      { kind: 'paragraph', lines: ['**caiba**'] },
    ]);
  });

  it('runs over every real published note without throwing, and finds at least one heading each', () => {
    const bundlePath = path.join(__dirname, '..', '..', 'public', 'content-bundle.json');
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf8')) as {
      notes: { path: string; body_markdown: string }[];
    };
    expect(bundle.notes.length).toBeGreaterThan(0);
    for (const note of bundle.notes) {
      const blocks = parseMarkdownBlocks(note.body_markdown);
      const headingCount = blocks.filter((b) => b.kind === 'heading').length;
      expect(headingCount, `expected at least one heading in ${note.path}`).toBeGreaterThan(0);
    }
  });
});

describe('parseInlineSpans', () => {
  it('returns a single plain span for text with no bold markers', () => {
    expect(parseInlineSpans('plain text')).toEqual([{ text: 'plain text', bold: false }]);
  });

  it('splits a single bold span out from surrounding plain text', () => {
    expect(parseInlineSpans('eu: **estou**')).toEqual([
      { text: 'eu: ', bold: false },
      { text: 'estou', bold: true },
    ]);
  });

  it('handles multiple bold spans in one line', () => {
    expect(parseInlineSpans('fal**o**, com**o**, abr**o**')).toEqual([
      { text: 'fal', bold: false },
      { text: 'o', bold: true },
      { text: ', com', bold: false },
      { text: 'o', bold: true },
      { text: ', abr', bold: false },
      { text: 'o', bold: true },
    ]);
  });

  it('degrades an unmatched bold marker to literal text rather than throwing', () => {
    expect(parseInlineSpans('this has an unmatched ** marker')).toEqual([
      { text: 'this has an unmatched ** marker', bold: false },
    ]);
  });
});
