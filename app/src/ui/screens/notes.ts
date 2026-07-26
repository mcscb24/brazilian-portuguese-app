import type { ContentBundle, Note } from '../../content/types';
import { el } from '../dom';
import { renderMarkdown } from '../markdown';
import type { Shell } from '../shell';

interface TreeNode {
  children: Map<string, TreeNode>;
  notes: Note[];
}

// If every note's leading path segment is the same (currently "Grammar" for all 27 notes), that
// segment is dropped from the *displayed* tree only — note.path itself is never altered, so
// goNoteDetail/lookups always use the real, full path. Not a recursive common-prefix strip: only
// this one leading segment is ever hidden, so e.g. "Verbs" still shows as its own tree node.
function commonRootToHide(notes: Note[]): string | null {
  if (notes.length === 0) return null;
  const first = notes[0].path.split('/')[0];
  return notes.every((note) => note.path.split('/')[0] === first) ? first : null;
}

function buildTree(notes: Note[]): TreeNode {
  const hiddenRoot = commonRootToHide(notes);
  const root: TreeNode = { children: new Map(), notes: [] };

  for (const note of notes) {
    const folderSegments = note.path.split('/').slice(0, -1);
    const segments = hiddenRoot !== null ? folderSegments.slice(1) : folderSegments;

    let cursor = root;
    for (const segment of segments) {
      let child = cursor.children.get(segment);
      if (!child) {
        child = { children: new Map(), notes: [] };
        cursor.children.set(segment, child);
      }
      cursor = child;
    }
    cursor.notes.push(note);
  }

  return root;
}

function renderTreeChildren(node: TreeNode, shell: Shell): HTMLElement[] {
  const folders = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
  const notes = [...node.notes].sort((a, b) => a.title.localeCompare(b.title));

  const items: HTMLElement[] = folders.map(([name, child]) =>
    el('details', { class: 'notes-folder', open: true }, [
      el('summary', {}, [name]),
      el('div', { class: 'notes-folder-children' }, renderTreeChildren(child, shell)),
    ])
  );

  for (const note of notes) {
    items.push(
      el('div', { class: 'notes-item' }, [
        el('button', { class: 'notes-note-button', onclick: () => shell.goNoteDetail(note) }, [note.title]),
      ])
    );
  }

  return items;
}

export function renderNotesList(bundle: ContentBundle, shell: Shell): HTMLElement {
  const tree = buildTree(bundle.notes);

  return el('div', { class: 'screen screen-notes' }, [
    el('h1', {}, ['Notes']),
    el('p', { class: 'muted' }, [`${bundle.notes.length} notes`]),
    el('div', { class: 'notes-tree' }, renderTreeChildren(tree, shell)),
    el('button', { onclick: () => shell.goHome() }, ['Home']),
  ]);
}

export function renderNoteDetail(note: Note, shell: Shell): HTMLElement {
  return el('div', { class: 'screen screen-note-detail' }, [
    el('h1', {}, [note.title]),
    renderMarkdown(note.body_markdown),
    el('div', {}, [
      el('button', { onclick: () => shell.goNotesList() }, ['Back to notes']),
      el('button', { onclick: () => shell.goHome() }, ['Home']),
    ]),
  ]);
}
