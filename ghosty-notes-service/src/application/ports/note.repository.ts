import type { Note } from '../../domain/notes/note.entity.js';
import type { NotesSummary, SummaryWindow } from '../../domain/notes/notes-summary.js';

export const NOTE_REPOSITORY = Symbol('NoteRepository');

export interface NoteListFilter {
  archived: boolean;
  label?: string;
  /** Busca no título, no texto e nos itens, sem diferenciar maiúsculas. */
  q?: string;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface NoteListResult {
  items: Note[];
  total: number;
}

/** Notas de uma conta. Toda consulta é filtrada pelo dono: nota de outra conta "não existe". */
export interface NoteRepository {
  /** Id para uma nota nova (ObjectId em texto). */
  nextId(): string;
  findById(ownerId: string, id: string): Promise<Note | null>;
  /** Fixadas primeiro, depois `updatedAt` decrescente. */
  list(ownerId: string, filter: NoteListFilter, page: PageRequest): Promise<NoteListResult>;
  insert(note: Note): Promise<void>;
  /** Grava só se a versão no banco ainda for `expectedVersion`. Devolve `false` se outra escrita chegou antes. */
  update(note: Note, expectedVersion: number): Promise<boolean>;
  /** Devolve `false` se a nota não existe (ou é de outra conta). */
  delete(ownerId: string, id: string): Promise<boolean>;
  deleteAllOfOwner(ownerId: string): Promise<number>;
  summarize(ownerId: string, window: SummaryWindow): Promise<NotesSummary>;
}
