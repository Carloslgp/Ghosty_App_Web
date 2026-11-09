import { applyDecorators, Controller } from '@nestjs/common';
import { ApiHeader, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiUserId } from '../../platform/user-id.decorator.js';

/** Controller de `/notes`: chave interna, `X-User-Id` e `X-Correlation-Id` documentados. */
export const NotesController = () =>
  applyDecorators(
    Controller('notes'),
    ApiTags('notes'),
    ApiSecurity('internalKey'),
    ApiUserId(),
    ApiHeader({
      name: 'X-Correlation-Id',
      required: false,
      description: 'Identificador da operação de ponta a ponta. Se não vier, o serviço gera um.',
    }),
  );
