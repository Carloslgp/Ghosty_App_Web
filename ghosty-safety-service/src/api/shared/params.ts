import { applyDecorators, Injectable, type PipeTransform } from '@nestjs/common';
import { ApiHeader, ApiParam, ApiSecurity } from '@nestjs/swagger';
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
