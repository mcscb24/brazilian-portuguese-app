// Pure string helpers only -- no imports from anywhere else in the app.

export function normaliseSurface(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/[.!?,;:]+$/, '')
    .replace(/([.!?,;:])\1+/g, '$1');
}

// Strips Unicode combining diacritical marks (U+0300-U+036F) left behind by
// normalize('NFD'), covering all Portuguese accents plus the decomposed cedilla in c-cedilla.
export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
