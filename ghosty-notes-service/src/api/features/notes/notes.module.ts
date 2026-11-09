import { Module, type Provider } from '@nestjs/common';
import { CreateNoteHandler } from '../../../application/features/notes/create-note/create-note.handler.js';
import { DeleteAllNotesOfOwnerHandler } from '../../../application/features/notes/delete-all-notes-of-owner/delete-all-notes-of-owner.handler.js';
import { DeleteNoteHandler } from '../../../application/features/notes/delete-note/delete-note.handler.js';
import { GetNoteHandler } from '../../../application/features/notes/get-note/get-note.handler.js';
import { GetNotesSummaryHandler } from '../../../application/features/notes/get-notes-summary/get-notes-summary.handler.js';
import { ListNotesHandler } from '../../../application/features/notes/list-notes/list-notes.handler.js';
import { PatchNoteHandler } from '../../../application/features/notes/patch-note/patch-note.handler.js';
import { UpdateNoteHandler } from '../../../application/features/notes/update-note/update-note.handler.js';
import { CLOCK, type Clock } from '../../../application/ports/clock.js';
import { ID_GENERATOR, type IdGenerator } from '../../../application/ports/id-generator.js';
import { NOTE_REPOSITORY, type NoteRepository } from '../../../application/ports/note.repository.js';
import { CreateNoteController } from './create-note.controller.js';
import { DeleteAllNotesOfOwnerController } from './delete-all-notes-of-owner.controller.js';
import { DeleteNoteController } from './delete-note.controller.js';
import { GetNoteController } from './get-note.controller.js';
import { GetNotesSummaryController } from './get-notes-summary.controller.js';
import { ListNotesController } from './list-notes.controller.js';
import { PatchNoteController } from './patch-note.controller.js';
import { UpdateNoteController } from './update-note.controller.js';

type Deps = [NoteRepository, Clock, IdGenerator];
const ALL = [NOTE_REPOSITORY, CLOCK, ID_GENERATOR];

/** Os handlers não conhecem o NestJS: são montados aqui, com as portas injetadas por token. */
const handlers: Provider[] = [
  { provide: CreateNoteHandler, useFactory: (...d: Deps) => new CreateNoteHandler(...d), inject: ALL },
  { provide: UpdateNoteHandler, useFactory: (...d: Deps) => new UpdateNoteHandler(...d), inject: ALL },
  { provide: PatchNoteHandler, useFactory: (...d: Deps) => new PatchNoteHandler(...d), inject: ALL },
  {
    provide: GetNotesSummaryHandler,
    useFactory: (notes: NoteRepository, clock: Clock) => new GetNotesSummaryHandler(notes, clock),
    inject: [NOTE_REPOSITORY, CLOCK],
  },
  ...[ListNotesHandler, GetNoteHandler, DeleteNoteHandler, DeleteAllNotesOfOwnerHandler].map((Handler) => ({
    provide: Handler,
    useFactory: (notes: NoteRepository) => new Handler(notes),
    inject: [NOTE_REPOSITORY],
  })),
];

@Module({
  controllers: [
    CreateNoteController,
    ListNotesController,
    DeleteAllNotesOfOwnerController,
    // `/notes/summary` antes de `/notes/:id`, senão "summary" seria lido como id.
    GetNotesSummaryController,
    GetNoteController,
    UpdateNoteController,
    PatchNoteController,
    DeleteNoteController,
  ],
  providers: handlers,
})
export class NotesModule {}
