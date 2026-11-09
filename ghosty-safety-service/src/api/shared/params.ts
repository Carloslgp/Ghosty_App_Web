import {
  applyDecorators,
  createParamDecorator,
  Injectable,
  type ExecutionContext,
  type PipeTransform,
} from '@nestjs/common';
import { ApiHeader, ApiParam, ApiSecurity } from '@nestjs/swagger';
import type { Request } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { correlationIdOf } from '../platform/correlation-id.js';
import { ProblemException } from '../platform/problem-details.js';
import { ApiUserId } from '../platform/user-id.decorator.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Id fora do formato responde 404, como um recurso que não existe. */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new ProblemException('NOT_FOUND', 'Não encontrado.');
    return value.toLowerCase();
  }
}

/** Token de convite fora do formato responde 404, como um convite que não existe. */
@Injectable()
export class InvitationTokenPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!OPAQUE_TOKEN.test(value)) throw new ProblemException('NOT_FOUND', 'Convite não encontrado.');
    return value;
  }
}

export const ApiCorrelation = () =>
  ApiHeader({
    name: 'X-Correlation-Id',
    required: false,
    description: 'Identificador da operação de ponta a ponta. Se não vier, o serviço gera um.',
  });

/** Rotas internas: chave interna e `X-Correlation-Id`. */
export const ApiInternal = () => applyDecorators(ApiSecurity('internalKey'), ApiCorrelation());

/** Rotas da pessoa usuária: também o `X-User-Id`. */
export const ApiUserScoped = () => applyDecorators(ApiInternal(), ApiUserId());

export const ApiUuidParam = (name: string, description: string) =>
  ApiParam({ name, description, schema: { type: 'string', format: 'uuid' } });

export const ApiTokenParam = () =>
  ApiParam({
    name: 'token',
    description: 'Token do convite (43 caracteres base64url)',
    schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
  });

/** O `X-Correlation-Id` da requisição, que segue para os eventos gravados no outbox. */
export const CorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    correlationIdOf(context.switchToHttp().getRequest<Request>()) ?? uuidv7(),
);

const IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,128}$/;

export function readIdempotencyKey(request: Request): string {
  const value = request.header('idempotency-key');
  if (!value || !IDEMPOTENCY_KEY.test(value)) {
    throw new ProblemException('VALIDATION_FAILED', 'O cabeçalho Idempotency-Key está ausente ou inválido.', [
      { field: 'Idempotency-Key', message: 'entre 8 e 128 caracteres, sem espaços' },
    ]);
  }
  return value;
}

/** A `Idempotency-Key` da requisição: repetir a mesma chave devolve o mesmo recurso. */
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  readIdempotencyKey(context.switchToHttp().getRequest<Request>()),
);

export const ApiIdempotencyKey = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Chave gerada pelo front a cada tentativa nova (de preferência um UUID). Vale por 24 horas.',
    schema: { type: 'string', minLength: 8, maxLength: 128 },
  });
