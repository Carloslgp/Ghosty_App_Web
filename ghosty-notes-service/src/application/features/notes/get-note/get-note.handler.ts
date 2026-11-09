import type { NoteRepository } from '../../../ports/note.repository.js';
import { NotFoundError } from '../../../shared/not-found.error.js';
import { toNoteView, type NoteView } from '../../../shared/note.view.js';
import type { GetNoteQuery } from './get-note.query.js';

export class GetNoteHandler {
  constructor(private readonly notes: NoteRepository) {}

  async execute(query: GetNoteQuery): Promise<NoteView> {
    const note = await this.notes.findById(query.ownerId, query.noteId);
    if (!note) throw new NotFoundError();
    return toNoteView(note);
  }
}
