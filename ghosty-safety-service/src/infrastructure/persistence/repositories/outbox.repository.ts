import { IsNull, type EntityManager } from 'typeorm';
import type { OutboxMessage, OutboxRepository } from '../../../application/ports/outbox.repository.js';
import type { ProcessedMessageRepository } from '../../../application/ports/processed-message.repository.js';
import type { Schemas } from '../schemas.js';

export class TypeOrmOutboxRepository implements OutboxRepository {
  /** Quantas mensagens esta transação acrescentou (o despachante só roda se houver alguma). */
  added = 0;

  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
    private readonly check?: (message: OutboxMessage) => void,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.outbox);
  }

  async add(message: OutboxMessage): Promise<void> {
    this.check?.(message);
    await this.rows.insert(message);
    this.added += 1;
  }

  async listPending(limit: number): Promise<OutboxMessage[]> {
    return this.rows.find({ where: { publishedAt: IsNull() }, order: { createdAt: 'ASC' }, take: limit });
  }

  async markPublished(id: string, at: Date): Promise<void> {
    await this.rows.update({ id }, { publishedAt: at });
  }

  async registerFailure(id: string): Promise<void> {
    await this.rows.increment({ id }, 'attempts', 1);
  }
}

export class TypeOrmProcessedMessageRepository implements ProcessedMessageRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.processedMessages);
  }

  async has(messageId: string): Promise<boolean> {
    return this.rows.existsBy({ messageId });
  }

  async add(messageId: string, at: Date): Promise<void> {
    await this.rows.insert({ messageId, processedAt: at });
  }
}
