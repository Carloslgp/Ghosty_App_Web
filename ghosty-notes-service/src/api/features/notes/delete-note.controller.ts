import { Delete, HttpCode, Inject, Param } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { DeleteNoteHandler } from '../../../application/features/notes/delete-note/delete-note.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ApiNoteId, NoteIdPipe } from './note-id.pipe.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class DeleteNoteController {
  constructor(@Inject(DeleteNoteHandler) private readonly handler: DeleteNoteHandler) {}

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteNote', summary: 'Apaga uma nota' })
  @ApiNoteId()
  @ApiNoContentResponse({ description: 'Nota apagada' })
  @ApiProblems('UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR')
  async delete(@UserId() ownerId: string, @Param('id', NoteIdPipe) noteId: string): Promise<void> {
    await this.handler.execute({ ownerId, noteId });
  }
}
