import { Body, Inject, Param, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { PatchNoteHandler } from '../../../application/features/notes/patch-note/patch-note.handler.js';
import type { NoteView } from '../../../application/shared/note.view.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiNoteId, NoteIdPipe } from './note-id.pipe.js';
import { NoteResponse, PatchNoteRequest } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class PatchNoteController {
  constructor(@Inject(PatchNoteHandler) private readonly handler: PatchNoteHandler) {}

  @Patch(':id')
  @ApiOperation({
    operationId: 'patchNote',
    summary: 'Altera campos da nota',
    description:
      'Campos parciais: fixar, arquivar, cor, etiquetas, lembrete, título, marcar um item ou converter o tipo. ' +
      'A `version` é opcional; se vier, é conferida. Converter (`kind`) preserva o texto: linhas viram itens e vice-versa.',
  })
  @ApiNoteId()
  @ApiOkResponse({ type: NoteResponse, description: 'Nota alterada, com `version` incrementada' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'VERSION_CONFLICT', 'INTERNAL_ERROR')
  patch(
    @UserId() ownerId: string,
    @Param('id', NoteIdPipe) noteId: string,
    @Body() body: PatchNoteRequest,
  ): Promise<NoteView> {
    return this.handler.execute({ ownerId, noteId, version: body.version, changes: body.toPatch() });
  }
}
