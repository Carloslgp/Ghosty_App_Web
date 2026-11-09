// Logs estruturados em JSON (pino), com redação dos campos sensíveis.
// O original fica em config/nest/platform/, na raiz do repositório. Cada serviço NestJS recebe uma
// cópia idêntica em src/api/platform/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import type { DynamicModule } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { correlationIdOf, resolveCorrelationId } from './correlation-id.js';

/** Campos que nunca aparecem no log, em qualquer nível do objeto registrado (até 2 níveis). */
export const REDACTED_KEYS = [
  'authorization',
  'cookie',
  'x-safety-token',
  'x-internal-key',
  'x-gateway-secret',
  'x-functions-key',
  'password',
  'currentPassword',
  'newPassword',
  'code',
  'secretCode',
  'chatId',
  'botToken',
  'token',
  'refreshToken',
  'accessToken',
  'message',
  'messageTemplate',
  'location',
];

export function redactedPaths(keys: string[] = REDACTED_KEYS): string[] {
  return keys.flatMap((key) => {
    const identifier = /^[A-Za-z_$][\w$]*$/.test(key);
    const member = identifier ? `.${key}` : `["${key}"]`;
    return [...(identifier ? [key] : []), `*${member}`, `*.*${member}`];
  });
}

/** Tira a query string e esconde os tokens que aparecem no caminho (links de convite). */
export function sanitizeUrl(url: string | undefined): string {
  const path = (url ?? '').split('?')[0] ?? '';
  return path.replace(/\/(invitations|c)\/[^/]+/g, '/$1/***');
}

export interface LoggerOptions {
  service: string;
  level: string;
}

export function createLoggerModule({ service, level }: LoggerOptions): DynamicModule {
  return LoggerModule.forRoot({
    pinoHttp: {
      level,
      base: { service },
      redact: { paths: redactedPaths(), censor: '[redigido]' },
      genReqId: (req: IncomingMessage, res: ServerResponse) => resolveCorrelationId(req, res),
      // Todo log feito durante a requisição leva o correlationId.
      customProps: (req: IncomingMessage) => ({ correlationId: correlationIdOf(req) }),
      customAttributeKeys: { responseTime: 'durationMs' },
      autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
      serializers: {
        req: (req: { method?: string; url?: string }) => ({
          method: req.method,
          route: sanitizeUrl(req.url),
        }),
        res: (res: { statusCode?: number }) => ({ status: res.statusCode }),
        // `message` é redigido; a mensagem do erro sai em `text`.
        err: (err: Error) => ({ type: err.name, text: err.message, stack: err.stack }),
      },
    },
  });
}
