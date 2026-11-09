import type { ChecklistItemSnapshot } from '../../domain/notes/checklist-item.js';
import type { NoteColor } from '../../domain/notes/note-color.js';
import type { NoteKind } from '../../domain/notes/note-kind.js';
import type { Note } from '../../domain/notes/note.entity.js';

/** A nota como sai dos casos de uso: datas em ISO 8601 (UTC), `body` só em texto e `items` só em checklist. */
export interface NoteView {
  id: string;
  ownerId: string;
  kind: NoteKind;
  title: string;
  body?: string;
  items?: ChecklistItemSnapshot[];
  color: NoteColor;
  labels: string[];
  pinned: boolean;
  archived: boolean;
  reminderAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface NotePageView {
  items: NoteView[];
  page: number;
  pageSize: number;
  total: number;
}

export function toNoteView(note: Note): NoteView {
  const s = note.toSnapshot();
  return {
    id: s.id,
    ownerId: s.ownerId,
    kind: s.kind,
    title: s.title,
    ...(s.kind === 'text' ? { body: s.body ?? '' } : { items: s.items ?? [] }),
    color: s.color,
    labels: s.labels,
    pinned: s.pinned,
    archived: s.archived,
    reminderAt: s.reminderAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    version: s.version,
  };
}
