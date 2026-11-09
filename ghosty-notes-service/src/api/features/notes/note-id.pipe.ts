import { Injectable, type PipeTransform } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { ProblemException } from '../../platform/problem-details.js';

/** Id fora do formato do ObjectId responde 404, como uma nota que não existe. */
@Injectable()
export class NoteIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[0-9a-f]{24}$/.test(value)) throw new ProblemException('NOT_FOUND', 'Nota não encontrada.');
    return value;
  }
}

export const ApiNoteId = () =>
  ApiParam({
    name: 'id',
    description: 'ObjectId da nota',
    schema: { type: 'string', pattern: '^[0-9a-f]{24}$', example: '6aec6fc05bd053a2e3d78b78' },
  });
