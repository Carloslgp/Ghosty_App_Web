// `X-Correlation-Id`: o mesmo identificador atravessa gateway, BFF, serviços e mensagens de fila.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { v7 as uuidv7 } from 'uuid';

export const CORRELATION_HEADER = 'x-correlation-id';

/** Aceita só valores curtos e sem caracteres de controle, para não poluir logs nem cabeçalhos. */
const SAFE_VALUE = /^[\w.:-]{1,100}$/;

/** Usa o identificador recebido (se for válido) ou gera um UUID v7, e o devolve na resposta. */
export function resolveCorrelationId(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers[CORRELATION_HEADER];
  const id = typeof incoming === 'string' && SAFE_VALUE.test(incoming) ? incoming : uuidv7();
  response.setHeader('X-Correlation-Id', id);
  return id;
}

/** O identificador da requisição atual (o `pino-http` o guarda em `req.id`). */
export function correlationIdOf(request: unknown): string | undefined {
  const id = (request as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
}
