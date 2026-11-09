import type { EntityManager } from 'typeorm';
import type { RefreshTokenRepository } from '../../../application/ports/refresh-token.repository.js';
import { RefreshToken } from '../../../domain/accounts/refresh-token.entity.js';
import type { Schemas } from '../schemas.js';

export class TypeOrmRefreshTokenRepository implements RefreshTokenRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.refreshTokens);
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.rows.findOneBy({ tokenHash });
    return row ? RefreshToken.restore(row) : null;
  }

  async insert(token: RefreshToken): Promise<void> {
    await this.rows.insert(token.toSnapshot());
  }

  async update(token: RefreshToken): Promise<void> {
    const { id, ...rest } = token.toSnapshot();
    await this.rows.update({ id }, rest);
  }
}
