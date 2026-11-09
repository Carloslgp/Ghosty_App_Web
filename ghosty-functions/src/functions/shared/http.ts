import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';

const SAFE_CORRELATION = /^[\w.:-]{1,100}$/;

export function correlationIdOf(request: HttpRequest): string {
  const incoming = request.headers.get('x-correlation-id');
  return incoming && SAFE_CORRELATION.test(incoming) ? incoming : uuidv7();
}

type ProblemCode = 'VALIDATION_FAILED' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR';

const TITLES: Record<ProblemCode, string> = {
  VALIDATION_FAILED: 'Dados inválidos',
  UNAUTHENTICATED: 'Não autenticado',
  INTERNAL_ERROR: 'Erro interno',
};

const STATUS: Record<ProblemCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INTERNAL_ERROR: 500,
};

export function problem(
  code: ProblemCode,
  instance: string,
  correlationId: string,
  detail?: string,
  errors?: { field: string; message: string }[],
): HttpResponseInit {
  return {
    status: STATUS[code],
    headers: { 'Content-Type': 'application/problem+json', 'X-Correlation-Id': correlationId },
    jsonBody: {
      type: `/errors/${code.toLowerCase().replaceAll('_', '-')}`,
      title: TITLES[code],
      status: STATUS[code],
      code,
      ...(detail ? { detail } : {}),
      instance,
      correlationId,
      ...(errors ? { errors } : {}),
    },
  };
}

export function ok(body: unknown, correlationId: string): HttpResponseInit {
  return { status: 200, headers: { 'X-Correlation-Id': correlationId }, jsonBody: body };
}

/**
 * Função HTTP com JSON validado por um schema `zod`. Erro de validação: 400 em Problem Details.
 * Erro inesperado: 500 sem detalhes (o log não leva o corpo da requisição).
 */
export function jsonHandler<S extends z.ZodType>(
  schema: S,
  handle: (input: z.infer<S>, correlationId: string) => unknown,
) {
  return async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const correlationId = correlationIdOf(request);
    const instance = new URL(request.url).pathname;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return problem('VALIDATION_FAILED', instance, correlationId, 'O corpo precisa ser um JSON válido.');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(corpo)',
        message: issue.message,
      }));
      const first = errors[0];
      return problem(
        'VALIDATION_FAILED',
        instance,
        correlationId,
        first ? `O campo ${first.field} é inválido: ${first.message}.` : undefined,
        errors,
      );
    }
    try {
      return ok(await handle(parsed.data, correlationId), correlationId);
    } catch (error) {
      context.error(`Falha em ${instance}: ${error instanceof Error ? error.message : String(error)}`);
      return problem('INTERNAL_ERROR', instance, correlationId);
    }
  };
}
