import { versionConflict } from '../../../../domain/notes/note.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { NoteRepository } from '../../../ports/note.repository.js';
import { NotFoundError } from '../../../shared/not-found.error.js';
import { toNoteView, type NoteView } from '../../../shared/note.view.js';
import type { PatchNoteCommand } from './patch-note.command.js';

export class PatchNoteHandler {
  constructor(
    private readonly notes: NoteRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: PatchNoteCommand): Promise<NoteView> {
    const note = await this.notes.findById(command.ownerId, command.noteId);
    if (!note) throw new NotFoundError();
    const current = note.version;
    note.patch(command.changes, this.clock.now(), () => this.ids.newId(), command.version);
    if (!(await this.notes.update(note, current))) {
      throw versionConflict(command.version ?? current, current + 1);
    }
    return toNoteView(note);
  }
}
