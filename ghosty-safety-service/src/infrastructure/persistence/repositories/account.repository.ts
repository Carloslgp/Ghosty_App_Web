import type { EntityManager } from 'typeorm';
import type { AccountRepository } from '../../../application/ports/account.repository.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import type { AccountRow, Schemas } from '../schemas.js';

export class TypeOrmAccountRepository implements AccountRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.accounts);
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.rows.findOneBy({ id });
    return row ? Account.restore(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const row = await this.rows.findOneBy({ email });
    return row ? Account.restore(row) : null;
  }

  async insert(account: Account): Promise<void> {
    await this.rows.insert(account.toSnapshot() satisfies AccountRow);
  }

  async update(account: Account): Promise<void> {
    const { id, ...rest } = account.toSnapshot();
    await this.rows.update({ id }, rest);
  }

  /** Apaga a conta e tudo o que depende dela, na mesma transação. */
  async delete(id: string): Promise<void> {
    const s = this.schemas;
    const m = this.manager;
    const helpRequestIds = (
      await m.getRepository(s.helpRequests).find({ select: { id: true }, where: { accountId: id } })
    ).map((row) => row.id);
    for (const helpRequestId of helpRequestIds)
      await m.getRepository(s.deliverySteps).delete({ helpRequestId });
    await m.getRepository(s.helpRequests).delete({ accountId: id });
    await m.getRepository(s.checkIns).delete({ accountId: id });
    await m.getRepository(s.contacts).delete({ accountId: id });
    await m.getRepository(s.alertSettings).delete({ accountId: id });
    await m.getRepository(s.refreshTokens).delete({ accountId: id });
    await m.getRepository(s.idempotencyKeys).delete({ accountId: id });
    await this.rows.delete({ id });
  }
}
