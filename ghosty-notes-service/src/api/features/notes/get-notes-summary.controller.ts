import { Get, Inject, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import {
  DEFAULT_TIMEZONE,
  GetNotesSummaryHandler,
} from '../../../application/features/notes/get-notes-summary/get-notes-summary.handler.js';
import type { NotesSummary } from '../../../domain/notes/notes-summary.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { NotesSummaryResponse, SummaryQueryParams } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class GetNotesSummaryController {
  constructor(@Inject(GetNotesSummaryHandler) private readonly handler: GetNotesSummaryHandler) {}

  @Get('summary')
  @ApiOperation({
    operationId: 'getNotesSummary',
    summary: 'Resumo das notas para o painel',
    description:
      'Usado pelo `GET /aggregated-data` do BFF. "Lembretes de hoje" considera o dia no fuso informado.',
  })
  @ApiOkResponse({ type: NotesSummaryResponse, description: 'Totais da conta' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  summary(@UserId() ownerId: string, @Query() query: SummaryQueryParams): Promise<NotesSummary> {
    return this.handler.execute({ ownerId, timezone: query.timezone ?? DEFAULT_TIMEZONE });
  }
}
