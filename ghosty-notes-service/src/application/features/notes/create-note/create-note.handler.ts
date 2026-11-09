import { Note } from '../../../../domain/notes/note.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { NoteRepository } from '../../../ports/note.repository.js';
import { toNoteView, type NoteView } from '../../../shared/note.view.js';
import type { CreateNoteCommand } from './create-note.command.js';

export class CreateNoteHandler {
  constructor(
    private readonly notes: NoteRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateNoteCommand): Promise<NoteView> {
    const note = Note.create({
      id: this.notes.nextId(),
      ownerId: command.ownerId,
      now: this.clock.now(),
      content: command.content,
      newItemId: () => this.ids.newId(),
    });
    await this.notes.insert(note);
    return toNoteView(note);
  }
}
