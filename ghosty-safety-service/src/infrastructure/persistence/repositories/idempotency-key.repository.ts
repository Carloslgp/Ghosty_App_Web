import type { EntityManager } from 'typeorm';
import type { IdempotencyKeyRepository } from '../../../application/ports/idempotency-key.repository.js';
import type { Schemas } from '../schemas.js';

export class TypeOrmIdempotencyKeyRepository implements IdempotencyKeyRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.idempotencyKeys);
  }

  async find(accountId: string, keyHash: string, notBefore: Date): Promise<string | null> {
    const row = await this.rows.findOneBy({ accountId, key: keyHash });
    return row && row.createdAt.getTime() >= notBefore.getTime() ? row.resourceId : null;
  }

  async save(accountId: string, keyHash: string, resourceId: string, now: Date): Promise<void> {
    // Uma chave vencida pode ser usada de novo: a linha antiga sai antes da nova entrar.
    await this.rows.delete({ accountId, key: keyHash });
    await this.rows.insert({ accountId, key: keyHash, resourceId, createdAt: now });
  }
}
