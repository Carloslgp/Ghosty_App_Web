import type { NoteRepository } from '../../../ports/note.repository.js';
import type { DeleteAllNotesOfOwnerCommand } from './delete-all-notes-of-owner.command.js';

/** Usado na exclusão da conta (direito de exclusão). É idempotente. */
export class DeleteAllNotesOfOwnerHandler {
  constructor(private readonly notes: NoteRepository) {}

  async execute(command: DeleteAllNotesOfOwnerCommand): Promise<{ deleted: number }> {
    return { deleted: await this.notes.deleteAllOfOwner(command.ownerId) };
  }
}
