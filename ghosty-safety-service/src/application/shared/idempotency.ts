import type { OpaqueTokens } from '../ports/opaque-tokens.js';

export const IDEMPOTENCY_TTL_HOURS = 24;

export type IdempotencyScope = 'check-in' | 'help-request';

/** O banco guarda só o hash, separado por tipo de recurso (a mesma chave pode servir a dois recursos). */
export function idempotencyKeyHash(tokens: OpaqueTokens, scope: IdempotencyScope, key: string): string {
  return tokens.hash(`${scope}:${key}`);
}

/** Chaves gravadas antes deste instante já venceram. */
export function idempotencyNotBefore(now: Date): Date {
  return new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
}
