import type { Note } from './api';

/** Minúsculas e sem acentos: "café" acha "Cafe" e vice-versa. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Busca local no título, no texto, nos itens e nas etiquetas. Nada vai para o servidor. */
export function matchesQuery(note: Note, query: string): boolean {
  const needle = normalize(query.trim());
  if (!needle) return true;
  const haystack = [
    note.title,
    note.body ?? '',
    ...(note.items ?? []).map((item) => item.text),
    ...note.labels,
  ];
  return haystack.some((text) => normalize(text).includes(needle));
}

/** Fixadas primeiro, depois as atualizadas mais recentemente. */
export function splitPinned(notes: Note[]): { pinned: Note[]; others: Note[] } {
  const byDate = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { pinned: byDate.filter((note) => note.pinned), others: byDate.filter((note) => !note.pinned) };
}
