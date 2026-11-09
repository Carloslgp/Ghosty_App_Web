import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { UpstreamResponse } from '../../application/ports/safety-service.client.js';
import { ProblemException } from '../platform/problem-details.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Id fora do formato responde 404, como um recurso que não existe (e nunca chega ao serviço). */
export function uuidParam(value: string): string {
  if (!UUID.test(value)) throw new ProblemException('NOT_FOUND', 'Não encontrado.');
  return value.toLowerCase();
}

/** Token de convite fora do formato: 404, como um convite que não existe. */
export function invitationToken(value: string): string {
  if (!OPAQUE_TOKEN.test(value)) throw new ProblemException('NOT_FOUND', 'Convite não encontrado.');
  return value;
}

/** Repassa só os parâmetros conhecidos da query string. */
export function forwardQuery(query: Record<string, unknown>, keys: readonly string[]): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = query[key];
    if (typeof value === 'string') params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** O status, o `Location` e o corpo do serviço, como vieram. */
export function reply(res: Response, upstream: UpstreamResponse): unknown {
  res.status(upstream.status);
  if (upstream.location) res.setHeader('Location', upstream.location);
  return upstream.body;
}

/** A `Idempotency-Key` da requisição, repassada ao serviço (que a valida e a exige). */
export function idempotencyHeaders(request: Request): Record<string, string> {
  const key = request.header('idempotency-key');
  return key ? { 'Idempotency-Key': key } : {};
}

export const ApiIdempotencyKey = () =>
  applyDecorators(
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Gerada pelo front a cada tentativa nova (`crypto.randomUUID()`). Vale por 24 horas.',
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    }),
  );
