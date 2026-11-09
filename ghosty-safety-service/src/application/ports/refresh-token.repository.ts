import type { RefreshToken } from '../../domain/accounts/refresh-token.entity.js';

export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  insert(token: RefreshToken): Promise<void>;
  update(token: RefreshToken): Promise<void>;
}
