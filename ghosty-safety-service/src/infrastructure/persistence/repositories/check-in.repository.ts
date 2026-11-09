import type { EntityManager } from 'typeorm';
import type { CheckInRepository } from '../../../application/ports/check-in.repository.js';
import type { FieldCipher } from '../../../application/ports/field-cipher.js';
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
