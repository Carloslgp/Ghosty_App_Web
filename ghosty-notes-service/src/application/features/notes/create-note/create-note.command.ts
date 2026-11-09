import type { NoteContent } from '../../../../domain/notes/note.entity.js';

export interface CreateNoteCommand {
  ownerId: string;
  content: NoteContent;
}
