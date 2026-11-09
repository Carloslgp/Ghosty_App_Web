export const NOTE_COLORS = ['default', 'yellow', 'green', 'blue', 'pink', 'gray'] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export function isNoteColor(value: unknown): value is NoteColor {
  return NOTE_COLORS.includes(value as NoteColor);
}
