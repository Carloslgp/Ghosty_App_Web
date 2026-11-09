import type { SafetySession } from '../../domain/session/safety-session.js';

export const SAFETY_SESSIONS = Symbol('SafetySessionStore');

/**
 * Sessões seguras ativas. Em memória: basta para uma réplica do BFF. Com mais réplicas, a
 * revogação precisa ir para um lugar compartilhado.
 */
export interface SafetySessionStore {
  save(session: SafetySession): void;
  find(jti: string): SafetySession | undefined;
  /** Revoga todas as sessões de uma conta (exclusão da conta). */
  revokeAllOf(accountId: string): void;
}
