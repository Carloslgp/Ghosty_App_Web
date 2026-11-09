import { Body, Inject, Param, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { UpdateNoteHandler } from '../../../application/features/notes/update-note/update-note.handler.js';
import type { NoteView } from '../../../application/shared/note.view.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiNoteId, NoteIdPipe } from './note-id.pipe.js';
import { NoteResponse, UpdateNoteRequest } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class UpdateNoteController {
  constructor(@Inject(UpdateNoteHandler) private readonly handler: UpdateNoteHandler) {}

  @Put(':id')
  @ApiOperation({
    operationId: 'updateNote',
    summary: 'Substitui a nota inteira',
    description:
      'Exige a `version` atual. Com versão antiga, responde 409 `VERSION_CONFLICT` e não altera nada. ' +
      'Mudar `kind` aqui substitui o conteúdo pelo que foi enviado; para converter preservando o texto, use o `PATCH`.',
  })
  @ApiNoteId()
  @ApiOkResponse({ type: NoteResponse, description: 'Nota atualizada, com `version` incrementada' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'NOT_FOUND', 'VERSION_CONFLICT', 'INTERNAL_ERROR')
  update(
    @UserId() ownerId: string,
    @Param('id', NoteIdPipe) noteId: string,
    @Body() body: UpdateNoteRequest,
  ): Promise<NoteView> {
    return this.handler.execute({ ownerId, noteId, version: body.version, content: body.toContent() });
  }
}
