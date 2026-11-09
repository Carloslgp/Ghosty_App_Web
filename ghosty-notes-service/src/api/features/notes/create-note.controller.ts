import { Body, Inject, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { CreateNoteHandler } from '../../../application/features/notes/create-note/create-note.handler.js';
import type { NoteView } from '../../../application/shared/note.view.js';
import { ApiProblems } from '../../platform/openapi.js';
import { UserId } from '../../platform/user-id.decorator.js';
import { CreateNoteRequest, NoteResponse } from './note.dto.js';
import { NotesController } from './notes-api.decorator.js';

@NotesController()
export class CreateNoteController {
  constructor(@Inject(CreateNoteHandler) private readonly handler: CreateNoteHandler) {}

  @Post()
  @ApiOperation({ operationId: 'createNote', summary: 'Cria uma nota' })
  @ApiCreatedResponse({ type: NoteResponse, description: 'Nota criada' })
  @ApiProblems('VALIDATION_FAILED', 'UNAUTHENTICATED', 'INTERNAL_ERROR')
  async create(
    @UserId() ownerId: string,
    @Body() body: CreateNoteRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<NoteView> {
    const note = await this.handler.execute({ ownerId, content: body.toContent() });
    res.setHeader('Location', `/notes/${note.id}`);
    return note;
  }
}
