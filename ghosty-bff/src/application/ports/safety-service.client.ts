import type { RequestMeta } from './upstream-error.js';

export const SAFETY_SERVICE = Symbol('SafetyServiceClient');

export interface SafetyAccount {
  id: string;
  email: string;
  displayName: string;
  secretCodeSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IssuedRefreshToken {
  accountId: string;
  token: string;
  expiresAt: string;
}

/** Corpo JSON repassado como veio (o contrato do serviço define o formato). */
export type Json = Record<string, unknown>;

/**
 * Cliente do safety-service. Erros saem como `UpstreamError` com o `code` do serviço
 * (ex.: `UNAUTHENTICATED` para senha ou código errado, `EMAIL_IN_USE`, `NOT_FOUND`).
 */
export interface SafetyServiceClient {
  createAccount(
    input: { email: string; displayName: string; password: string },
    meta: RequestMeta,
  ): Promise<SafetyAccount>;
  authenticate(input: { email: string; password: string }, meta: RequestMeta): Promise<SafetyAccount>;
  getAccount(accountId: string, meta: RequestMeta): Promise<SafetyAccount>;
  updateAccount(accountId: string, input: { displayName: string }, meta: RequestMeta): Promise<SafetyAccount>;
  deleteAccount(accountId: string, meta: RequestMeta): Promise<void>;
  setSecretCode(
    accountId: string,
    input: { currentPassword: string; code: string },
    meta: RequestMeta,
  ): Promise<void>;
  verifySecretCode(accountId: string, code: string, meta: RequestMeta): Promise<void>;
  issueRefreshToken(accountId: string, meta: RequestMeta): Promise<IssuedRefreshToken>;
  rotateRefreshToken(token: string, meta: RequestMeta): Promise<IssuedRefreshToken>;
  revokeRefreshToken(token: string, meta: RequestMeta): Promise<void>;

  /** Rotas da pessoa usuária (`X-User-Id`), repassadas como estão. */
  forUser(
    accountId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<UpstreamResponse>;
}

export interface UpstreamResponse {
  status: number;
  body: unknown;
  location?: string;
}
