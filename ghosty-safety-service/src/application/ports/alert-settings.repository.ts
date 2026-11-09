import type { AlertSettings } from '../../domain/alert-settings/alert-settings.entity.js';

export interface AlertSettingsRepository {
  findByAccount(accountId: string): Promise<AlertSettings | null>;
  /** Insere ou atualiza. */
  save(settings: AlertSettings): Promise<void>;
}
