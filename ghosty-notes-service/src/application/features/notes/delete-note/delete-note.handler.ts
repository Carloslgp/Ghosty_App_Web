import type { NoteRepository } from '../../../ports/note.repository.js';
import { NotFoundError } from '../../../shared/not-found.error.js';
import type { DeleteNoteCommand } from './delete-note.command.js';

export class DeleteNoteHandler {
  constructor(private readonly notes: NoteRepository) {}

  async execute(command: DeleteNoteCommand): Promise<void> {
    if (!(await this.notes.delete(command.ownerId, command.noteId))) throw new NotFoundError();
  }
}
