import type { DataSource, EntityManager } from 'typeorm';
import type { FieldCipher } from '../../application/ports/field-cipher.js';
import type { Repositories, UnitOfWork } from '../../application/ports/unit-of-work.js';
import { TypeOrmAccountRepository } from './repositories/account.repository.js';
import { TypeOrmAlertSettingsRepository } from './repositories/alert-settings.repository.js';
import { TypeOrmCheckInRepository } from './repositories/check-in.repository.js';
import { TypeOrmContactRepository } from './repositories/contact.repository.js';
import { TypeOrmHelpRequestRepository } from './repositories/help-request.repository.js';
import {
  TypeOrmOutboxRepository,
  TypeOrmProcessedMessageRepository,
} from './repositories/outbox.repository.js';
import { TypeOrmRefreshTokenRepository } from './repositories/refresh-token.repository.js';
import type { Schemas } from './schemas.js';

/**
 * Unidade de trabalho sobre uma transação do TypeORM. No SQLite há uma conexão só, então as
 * transações entram em fila; no SQL Server elas correm em paralelo, cada uma numa conexão do pool.
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  private queue: Promise<unknown> = Promise.resolve();
  private outboxListener: (() => void) | undefined;

  constructor(
    private readonly dataSource: DataSource,
    private readonly schemas: Schemas,
    private readonly cipher: FieldCipher,
    private readonly serialize: boolean,
  ) {}

  /** Chamado logo depois de um commit que gravou mensagens no outbox. */
  onOutboxWritten(listener: () => void): void {
    this.outboxListener = listener;
  }

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    let added = 0;
    const execute = () =>
      this.dataSource.transaction(async (manager) => {
        const repos = this.repositories(manager);
        const result = await work(repos);
        added = repos.outbox.added;
        return result;
      });

    let result: T;
    if (this.serialize) {
      const next = this.queue.then(execute, execute);
      this.queue = next.catch(() => undefined);
      result = await next;
    } else {
      result = await execute();
    }
    if (added > 0) this.outboxListener?.();
    return result;
  }

  private repositories(manager: EntityManager): Repositories & { outbox: TypeOrmOutboxRepository } {
    const { schemas, cipher } = this;
    return {
      accounts: new TypeOrmAccountRepository(manager, schemas),
      refreshTokens: new TypeOrmRefreshTokenRepository(manager, schemas),
      contacts: new TypeOrmContactRepository(manager, schemas, cipher),
      alertSettings: new TypeOrmAlertSettingsRepository(manager, schemas, cipher),
      checkIns: new TypeOrmCheckInRepository(manager, schemas, cipher),
      helpRequests: new TypeOrmHelpRequestRepository(manager, schemas, cipher),
      outbox: new TypeOrmOutboxRepository(manager, schemas),
      processedMessages: new TypeOrmProcessedMessageRepository(manager, schemas),
    };
  }
}
