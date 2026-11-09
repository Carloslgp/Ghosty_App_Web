import type { Clock } from '../../application/ports/clock.js';
import type { SafetySessionStore } from '../../application/ports/safety-session.store.js';
import type { SafetySession, SafetySessionPolicy } from '../../domain/session/safety-session.js';

/**
 * Sessões seguras em memória (uma réplica do BFF). Se o BFF reiniciar, as sessões somem e a pessoa
 * digita o código de novo: falha fechada. As sessões encerradas são descartadas aos poucos.
 */
export class MemorySafetySessionStore implements SafetySessionStore {
  private readonly sessions = new Map<string, SafetySession>();

  constructor(
    private readonly policy: SafetySessionPolicy,
    private readonly clock: Clock,
  ) {}

  save(session: SafetySession): void {
    this.prune();
    this.sessions.set(session.jti, session);
  }

  find(jti: string): SafetySession | undefined {
    return this.sessions.get(jti);
  }

  revokeAllOf(accountId: string): void {
    for (const session of this.sessions.values()) if (session.accountId === accountId) session.revoke();
  }

  get size(): number {
    return this.sessions.size;
  }

  private prune(): void {
    const now = this.clock.now();
    for (const [jti, session] of this.sessions)
      if (!session.isActive(now, this.policy)) this.sessions.delete(jti);
  }
}
