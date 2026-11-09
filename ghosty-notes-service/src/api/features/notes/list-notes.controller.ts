import { Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ListNotesHandler } from '../../../application/features/notes/list-notes/list-notes.handler.js';
import type { NotePageView } from '../../../application/shared/note.view.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { ListNotesQueryParams, NotePageResponse } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class ListNotesController {
  constructor(@Inject(ListNotesHandler) private readonly handler: ListNotesHandler) {}

  @Get()
  @ApiOperation({
    operationId: 'listNotes',
    summary: 'Lista as notas da conta',
    description: 'Ordem padrão, fixadas primeiro e depois `updatedAt` decrescente.',
  })
  @ApiOkResponse({ type: NotePageResponse, description: 'Uma página de notas' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  list(@UserId() ownerId: string, @Query() query: ListNotesQueryParams): Promise<NotePageView> {
    return this.handler.execute({
      ownerId,
      archived: query.archived ?? false,
      label: query.label,
      q: query.q,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    });
  }
}
