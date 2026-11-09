// `X-User-Id`: o id da conta (o `sub` do JWT), repassado pelo BFF às rotas de usuário.
// O original fica em config/nest/internal/, na raiz do repositório. Cada microserviço recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { applyDecorators, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { ProblemException } from './problem-details.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readUserId(request: Request): string {
  const value = request.header('x-user-id');
  if (!value || !UUID.test(value)) {
    throw new ProblemException('VALIDATION_FAILED', 'O cabeçalho X-User-Id está ausente ou inválido.', [
      { field: 'X-User-Id', message: 'precisa ser um UUID' },
    ]);
  }
  return value.toLowerCase();
}

/** Injeta o id da conta no parâmetro do controller. */
export const UserId = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readUserId(context.switchToHttp().getRequest<Request>()),
);

/** Documenta o `X-User-Id` no Swagger. */
export const ApiUserId = () =>
  applyDecorators(
    ApiHeader({
      name: 'X-User-Id',
      required: true,
      description: 'Id da conta (o `sub` do JWT), repassado pelo BFF.',
      schema: { type: 'string', format: 'uuid' },
    }),
  );
