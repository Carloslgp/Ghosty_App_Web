import { Delete, HttpCode, Inject } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';
import { DeleteAllNotesOfOwnerHandler } from '../../../application/features/notes/delete-all-notes-of-owner/delete-all-notes-of-owner.handler.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class DeleteAllNotesOfOwnerController {
  constructor(@Inject(DeleteAllNotesOfOwnerHandler) private readonly handler: DeleteAllNotesOfOwnerHandler) {}

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteAllNotesOfOwner',
    summary: 'Apaga todas as notas da conta',
    description: 'Usada na exclusão da conta (direito de exclusão). É idempotente.',
  })
  @ApiNoContentResponse({ description: 'Notas apagadas (ou já não havia nenhuma)' })
  @ApiProblems('UNAUTHENTICATED', 'INTERNAL_ERROR')
  async deleteAll(@UserId() ownerId: string): Promise<void> {
    await this.handler.execute({ ownerId });
  }
}
