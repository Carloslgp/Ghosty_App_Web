import type { NoteContent } from '../../../../domain/notes/note.entity.js';

export interface UpdateNoteCommand {
  ownerId: string;
  noteId: string;
  /** A versão que o cliente leu. */
  version: number;
  content: NoteContent;
}
