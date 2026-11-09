import type { EntityManager } from 'typeorm';
import type { CheckInFilter, CheckInRepository } from '../../../application/ports/check-in.repository.js';
import type { FieldCipher } from '../../../application/ports/field-cipher.js';
import type { Page } from '../../../application/shared/pagination.js';
import { CheckIn, type CheckInStatus } from '../../../domain/check-ins/check-in.entity.js';
import type { Mode } from '../../../domain/shared/domain-error.js';
import type { CheckInRow, Schemas } from '../schemas.js';

/** O destino fica cifrado. */
export class TypeOrmCheckInRepository implements CheckInRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
    private readonly cipher: FieldCipher,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.checkIns);
  }

  private toDomain(row: CheckInRow): CheckIn {
    return CheckIn.restore({
      id: row.id,
      accountId: row.accountId,
      destination: this.cipher.decrypt(row.destinationEnc),
      dueAt: row.dueAt,
      toleranceMinutes: row.toleranceMinutes,
      status: row.status as CheckInStatus,
      mode: row.mode as Mode,
      version: row.version,
      confirmedAt: row.confirmedAt,
      expiredAt: row.expiredAt,
      createdAt: row.createdAt,
    });
  }

  private toRow(checkIn: CheckIn): CheckInRow {
    const { destination, ...rest } = checkIn.toSnapshot();
    return { ...rest, destinationEnc: this.cipher.encrypt(destination) };
  }

  async findById(accountId: string, id: string): Promise<CheckIn | null> {
    const row = await this.rows.findOneBy({ accountId, id });
    return row ? this.toDomain(row) : null;
  }

  async findByIdInAnyAccount(id: string): Promise<CheckIn | null> {
    const row = await this.rows.findOneBy({ id });
    return row ? this.toDomain(row) : null;
  }

  async list(accountId: string, filter: CheckInFilter): Promise<Page<CheckIn>> {
    const [rows, total] = await this.rows.findAndCount({
      where: {
        accountId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.mode ? { mode: filter.mode } : {}),
      },
      // O id (UUID v7) desempata check-ins criados no mesmo instante.
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
    return { items: rows.map((row) => this.toDomain(row)), total };
  }

  async findActive(accountId: string, mode?: Mode): Promise<CheckIn | null> {
    const row = await this.rows.findOne({
      where: { accountId, status: 'active', ...(mode ? { mode } : {}) },
      order: { createdAt: 'DESC' },
    });
    return row ? this.toDomain(row) : null;
  }

  async insert(checkIn: CheckIn): Promise<void> {
    await this.rows.insert(this.toRow(checkIn));
  }

  async update(checkIn: CheckIn): Promise<void> {
    const { id, ...rest } = this.toRow(checkIn);
    await this.rows.update({ id }, rest);
  }
}
