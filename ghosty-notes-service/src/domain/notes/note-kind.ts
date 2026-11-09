export const NOTE_KINDS = ['text', 'checklist'] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];

export function isNoteKind(value: unknown): value is NoteKind {
  return NOTE_KINDS.includes(value as NoteKind);
}
