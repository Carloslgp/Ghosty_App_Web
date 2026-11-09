import type { NotePatch } from '../../../../domain/notes/note.entity.js';

export interface PatchNoteCommand {
  ownerId: string;
  noteId: string;
  /** Opcional: se vier, é conferida. */
  version?: number;
  changes: NotePatch;
}
