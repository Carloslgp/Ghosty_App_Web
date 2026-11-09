import {
  AlertSettings,
  type AlertSettingsInput,
} from '../../../../domain/alert-settings/alert-settings.entity.js';
import type { Clock } from '../../../ports/clock.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toAlertSettingsView, type AlertSettingsView } from '../../../shared/views.js';

/** Salvar marca a mensagem como revisada. */
export class UpdateAlertSettingsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  execute(command: { accountId: string } & AlertSettingsInput): Promise<AlertSettingsView> {
    const { accountId, ...input } = command;
    return this.uow.run(async ({ accounts, alertSettings }) => {
      if (!(await accounts.findById(accountId))) throw new NotFoundError('Conta não encontrada.');
      const settings =
        (await alertSettings.findByAccount(accountId)) ?? AlertSettings.createDefault(accountId);
      settings.update(input, this.clock.now());
      await alertSettings.save(settings);
      return toAlertSettingsView(settings);
    });
  }
}
