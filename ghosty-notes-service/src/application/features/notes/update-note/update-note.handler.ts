import { versionConflict } from '../../../../domain/notes/note.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { NoteRepository } from '../../../ports/note.repository.js';
import { NotFoundError } from '../../../shared/not-found.error.js';
import { toNoteView, type NoteView } from '../../../shared/note.view.js';
import type { UpdateNoteCommand } from './update-note.command.js';

export class UpdateNoteHandler {
  constructor(
    private readonly notes: NoteRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: UpdateNoteCommand): Promise<NoteView> {
    const note = await this.notes.findById(command.ownerId, command.noteId);
    if (!note) throw new NotFoundError();
    const current = note.version;
    note.replace(command.content, command.version, this.clock.now(), () => this.ids.newId());
    // Outra escrita pode ter chegado entre a leitura e a gravação.
    if (!(await this.notes.update(note, current))) throw versionConflict(command.version, current + 1);
    return toNoteView(note);
  }
}
