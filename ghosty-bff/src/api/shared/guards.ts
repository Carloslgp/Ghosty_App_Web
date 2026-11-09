import {
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ValidateSafetySessionHandler } from '../../application/features/safety-session/validate-safety-session/validate-safety-session.handler.js';
import { TOKEN_SERVICE, type TokenService } from '../../application/ports/token-service.js';
import type { RequestMeta } from '../../application/ports/upstream-error.js';
import { correlationIdOf } from '../platform/correlation-id.js';
import { ProblemException } from '../platform/problem-details.js';
import { isPublicRoute } from '../platform/public.decorator.js';

export const GATEWAY_SECRET = Symbol('GATEWAY_SECRET');

/** Requisição já autenticada: o `sub` do JWT. */
export interface AuthenticatedRequest extends Request {
  accountId?: string;
}

function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** Rotas que o próprio Azure (healthcheck, `validate-jwt` do APIM) chama direto, sem o gateway. */
const GATEWAY_EXEMPT = [/^\/health(?:\?|$)/, /^\/\.well-known\//];

/**
 * Com `GATEWAY_SECRET` configurado, toda chamada precisa ter vindo pelo API Management, que injeta o
 * `X-Gateway-Secret`. Sem ele: 403.
 */
@Injectable()
export class GatewaySecretGuard implements CanActivate {
  constructor(@Inject(GATEWAY_SECRET) private readonly secret: string) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.secret === '') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (GATEWAY_EXEMPT.some((pattern) => pattern.test(request.originalUrl ?? request.url))) return true;
    const given = request.header('x-gateway-secret');
    if (!given || !sameSecret(given, this.secret)) throw new ProblemException('FORBIDDEN');
    return true;
  }
}

/** `Authorization: Bearer <jwt>` em toda rota que não for `@Public()`. Sem JWT válido: 401. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization') ?? '';
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    // Mesmo nas rotas públicas, um JWT válido identifica a pessoa para o limite de taxa.
    const accountId = token ? await this.tokens.verifyAccessToken(token) : null;
    if (accountId) request.accountId = accountId;
    if (isPublicRoute(this.reflector, context)) return true;
    if (!accountId) throw new ProblemException('UNAUTHENTICATED');
    return true;
  }
}

const SAFETY_AREA = 'bff:safetyArea';

/** Marca as rotas da área de segurança: exigem também o `X-Safety-Token`. */
export const SafetyArea = () => SetMetadata(SAFETY_AREA, true);

/** `X-Safety-Token` ausente, vencido ou revogado: 403 (o cliente faz a saída rápida). */
@Injectable()
export class SafetySessionGuard implements CanActivate {
  constructor(
    @Inject(ValidateSafetySessionHandler) private readonly validate: ValidateSafetySessionHandler,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(SAFETY_AREA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.validate.execute({
      accountId: request.accountId ?? '',
      safetyToken: request.header('x-safety-token'),
    });
    return true;
  }
}

/** O id da conta logada (o `sub` do JWT). */
export const CurrentAccount = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const accountId = context.switchToHttp().getRequest<AuthenticatedRequest>().accountId;
  if (!accountId) throw new ProblemException('UNAUTHENTICATED');
  return accountId;
});

/** Metadados para as chamadas internas (o `X-Correlation-Id` desta requisição). */
export const Meta = createParamDecorator((_data: unknown, context: ExecutionContext): RequestMeta => ({
  correlationId: correlationIdOf(context.switchToHttp().getRequest()),
}));
