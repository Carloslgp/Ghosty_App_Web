export const REFRESH_TOKEN_TTL_DAYS = 7;

export interface RefreshTokenSnapshot {
  id: string;
  accountId: string;
  /** SHA-256 do valor. O valor em si aparece uma única vez, na emissão. */
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Refresh token opaco: rotacionado a cada uso e revogado no logout. */
export class RefreshToken {
  private constructor(private state: RefreshTokenSnapshot) {}

  static issue(params: { id: string; accountId: string; tokenHash: string; now: Date }): RefreshToken {
    return new RefreshToken({
      id: params.id,
      accountId: params.accountId,
      tokenHash: params.tokenHash,
      expiresAt: new Date(params.now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: params.now,
    });
  }

  static restore(snapshot: RefreshTokenSnapshot): RefreshToken {
    return new RefreshToken({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get accountId(): string {
    return this.state.accountId;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  /** Vale se não foi revogado (nem usado, porque usar revoga) e ainda não venceu. */
  isUsable(now: Date): boolean {
    return this.state.revokedAt === null && this.state.expiresAt.getTime() > now.getTime();
  }

  revoke(now: Date): void {
    if (this.state.revokedAt === null) this.state = { ...this.state, revokedAt: now };
  }

  toSnapshot(): RefreshTokenSnapshot {
    return { ...this.state };
  }
}
