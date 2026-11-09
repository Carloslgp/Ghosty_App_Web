import { ObjectId } from 'mongodb';
import type { NoteColor } from '../../domain/notes/note-color.js';
import type { NoteKind } from '../../domain/notes/note-kind.js';
import { Note, type NoteSnapshot } from '../../domain/notes/note.entity.js';

/** Como a nota fica gravada na coleção `notes`. `body` só existe em texto, e `items` só em checklist. */
export interface NoteDocument {
  _id: ObjectId;
  ownerId: string;
  kind: NoteKind;
  title: string;
  body?: string;
  items?: { id: string; text: string; done: boolean }[];
  color: NoteColor;
  labels: string[];
  pinned: boolean;
  archived: boolean;
  /** Ausente quando não há lembrete (o índice parcial só considera quem tem). */
  reminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export function toDocument(note: Note): NoteDocument {
  const s = note.toSnapshot();
  return {
    _id: new ObjectId(s.id),
    ownerId: s.ownerId,
    kind: s.kind,
    title: s.title,
    ...(s.body !== null ? { body: s.body } : {}),
    ...(s.items !== null ? { items: s.items } : {}),
    color: s.color,
    labels: s.labels,
    pinned: s.pinned,
    archived: s.archived,
    ...(s.reminderAt !== null ? { reminderAt: s.reminderAt } : {}),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    version: s.version,
  };
}

export function fromDocument(doc: NoteDocument): Note {
  const snapshot: NoteSnapshot = {
    id: doc._id.toHexString(),
    ownerId: doc.ownerId,
    kind: doc.kind,
    title: doc.title,
    body: doc.kind === 'text' ? (doc.body ?? '') : null,
    items: doc.kind === 'checklist' ? (doc.items ?? []) : null,
    color: doc.color,
    labels: doc.labels ?? [],
    pinned: doc.pinned,
    archived: doc.archived,
    reminderAt: doc.reminderAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    version: doc.version,
  };
  return Note.restore(snapshot);
}
