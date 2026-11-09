import { Get, Inject, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { GetNoteHandler } from '../../../application/features/notes/get-note/get-note.handler.js';
import type { NoteView } from '../../../application/shared/note.view.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiNoteId, NoteIdPipe } from './note-id.pipe.js';
import { NoteResponse } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class GetNoteController {
  constructor(@Inject(GetNoteHandler) private readonly handler: GetNoteHandler) {}

  @Get(':id')
  @ApiOperation({ operationId: 'getNote', summary: 'Busca uma nota' })
  @ApiNoteId()
  @ApiOkResponse({ type: NoteResponse, description: 'A nota' })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  get(@UserId() ownerId: string, @Param('id', NoteIdPipe) noteId: string): Promise<NoteView> {
    return this.handler.execute({ ownerId, noteId });
  }
}
