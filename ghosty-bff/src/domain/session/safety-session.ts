/**
 * Sessão segura (área de segurança desbloqueada). O token vale por `idleMs` desde o último uso e
 * nunca mais que `maxMs` desde o desbloqueio. A saída rápida a revoga na hora.
 */
export interface SafetySessionPolicy {
  idleMs: number;
  maxMs: number;
}

export interface SafetySessionSnapshot {
  jti: string;
  accountId: string;
  startedAt: Date;
  lastUsedAt: Date;
  revoked: boolean;
}

export class SafetySession {
  private constructor(private state: SafetySessionSnapshot) {}

  static start(jti: string, accountId: string, now: Date): SafetySession {
    return new SafetySession({ jti, accountId, startedAt: now, lastUsedAt: now, revoked: false });
  }

  get jti(): string {
    return this.state.jti;
  }

  get accountId(): string {
    return this.state.accountId;
  }

  /** Quando a sessão acaba se não for usada de novo. */
  expiresAt(policy: SafetySessionPolicy): Date {
    const idle = this.state.lastUsedAt.getTime() + policy.idleMs;
    const max = this.state.startedAt.getTime() + policy.maxMs;
    return new Date(Math.min(idle, max));
  }

  isActive(now: Date, policy: SafetySessionPolicy): boolean {
    return !this.state.revoked && now.getTime() < this.expiresAt(policy).getTime();
  }

  /** Cada uso renova a janela de inatividade, até o limite absoluto. */
  touch(now: Date): void {
    this.state = { ...this.state, lastUsedAt: now };
  }

  revoke(): void {
    this.state = { ...this.state, revoked: true };
  }
}

/** Só dígitos, de 6 a 8: é o que a busca da fachada trata como tentativa de desbloqueio. */
export function looksLikeUnlockCode(value: string): boolean {
  return /^[0-9]{6,8}$/.test(value);
}
