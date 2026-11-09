import type { IssuedRefreshToken, SafetyAccount } from '../ports/safety-service.client.js';
import type { TokenService } from '../ports/token-service.js';

/** O que o front recebe ao entrar, cadastrar ou renovar a sessão. */
export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: string;
  user: { id: string; displayName: string; email: string };
}

export async function buildAuthSession(
  tokens: TokenService,
  account: SafetyAccount,
  refresh: IssuedRefreshToken,
): Promise<AuthSession> {
  const access = await tokens.signAccessToken(account.id);
  return {
    accessToken: access.token,
    tokenType: 'Bearer',
    expiresIn: access.expiresIn,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    user: { id: account.id, displayName: account.displayName, email: account.email },
  };
}

/** Sessão inválida: o cliente renova o JWT e repete (ou volta para a tela de entrar). */
export class UnauthenticatedError extends Error {
  readonly code = 'UNAUTHENTICATED';

  constructor() {
    super('Sessão inválida.');
    this.name = 'UnauthenticatedError';
  }
}

/** Sessão segura ausente, vencida ou revogada; também código errado no desbloqueio (sempre igual). */
export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';

  constructor() {
    super('Acesso negado.');
    this.name = 'ForbiddenError';
  }
}

/** A conta da nota de exemplo é a do `X-User-Id`; o BFF não expõe o `ownerId` ao front. */
export function withoutOwner(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(withoutOwner);
  if (body === null || typeof body !== 'object') return body;
  const { ownerId: _ownerId, ...rest } = body as Record<string, unknown>;
  if (Array.isArray(rest.items) && 'page' in rest) return { ...rest, items: rest.items.map(withoutOwner) };
  return rest;
}
