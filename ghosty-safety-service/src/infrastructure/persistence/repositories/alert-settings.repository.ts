import type { EntityManager } from 'typeorm';
import type { AlertSettingsRepository } from '../../../application/ports/alert-settings.repository.js';
import type { FieldCipher } from '../../../application/ports/field-cipher.js';
import { AlertSettings } from '../../../domain/alert-settings/alert-settings.entity.js';
import type { Schemas } from '../schemas.js';

/** O modelo da mensagem fica cifrado. */
export class TypeOrmAlertSettingsRepository implements AlertSettingsRepository {
  constructor(
    private readonly manager: EntityManager,
    private readonly schemas: Schemas,
    private readonly cipher: FieldCipher,
  ) {}

  private get rows() {
    return this.manager.getRepository(this.schemas.alertSettings);
  }

  async findByAccount(accountId: string): Promise<AlertSettings | null> {
    const row = await this.rows.findOneBy({ accountId });
    if (!row) return null;
    return AlertSettings.restore({
      accountId: row.accountId,
      messageTemplate: this.cipher.decrypt(row.messageTemplateEnc),
      includeLocation: row.includeLocation,
      countdownSeconds: row.countdownSeconds,
      checkInToleranceMinutes: row.checkInToleranceMinutes,
      reviewedAt: row.reviewedAt,
    });
  }

  async save(settings: AlertSettings): Promise<void> {
    const s = settings.toSnapshot();
    const row = {
      accountId: s.accountId,
      messageTemplateEnc: this.cipher.encrypt(s.messageTemplate),
      includeLocation: s.includeLocation,
      countdownSeconds: s.countdownSeconds,
      checkInToleranceMinutes: s.checkInToleranceMinutes,
      reviewedAt: s.reviewedAt,
    };
    const exists = await this.rows.existsBy({ accountId: s.accountId });
    if (exists) await this.rows.update({ accountId: s.accountId }, row);
    else await this.rows.insert(row);
  }
}
