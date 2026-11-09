import { Injectable, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerOptions } from '@nestjs/throttler';
import { ProblemException } from '../platform/problem-details.js';
import type { AuthenticatedRequest } from './guards.js';

const LOGIN_LIMITED = 'bff:loginLimited';

/** Rotas de entrada (login e cadastro): limite próprio por IP. */
export const LoginRateLimited = () => SetMetadata(LOGIN_LIMITED, true);

/**
 * Dois limites (o tier Consumption do APIM não tem limite por IP nem por usuário):
 * - `login`: N tentativas por minuto por IP, só nas rotas marcadas com `@LoginRateLimited()`;
 * - `default`: M requisições por minuto por usuário (ou por IP, sem JWT).
 */
export function throttlers(loginPerMinute: number, userPerMinute: number): ThrottlerOptions[] {
  return [
    { name: 'default', ttl: 60_000, limit: userPerMinute },
    {
      name: 'login',
      ttl: 60_000,
      limit: loginPerMinute,
      skipIf: (context: ExecutionContext) =>
        Reflect.getMetadata(LOGIN_LIMITED, context.getHandler()) !== true,
      getTracker: (req: Record<string, unknown>) => `ip:${String(req.ip)}`,
    },
  ];
}

/** Limite de taxa com resposta em Problem Details e o cabeçalho `Retry-After` padrão. */
@Injectable()
export class BffThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const { accountId, ip } = req as unknown as AuthenticatedRequest;
    return Promise.resolve(accountId ? `user:${accountId}` : `ip:${ip}`);
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    throw new ProblemException(
      'RATE_LIMITED',
      `Muitas requisições. Tente de novo em ${seconds} s.`,
      undefined,
      {
        'Retry-After': String(seconds),
      },
    );
  }
}
