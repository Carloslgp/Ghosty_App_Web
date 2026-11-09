import { AlertSettings } from '../../../../domain/alert-settings/alert-settings.entity.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { toAlertSettingsView, type AlertSettingsView } from '../../../shared/views.js';

/** As configurações nascem com a conta; se faltarem (conta antiga), valem os padrões. */
export class GetAlertSettingsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string }): Promise<AlertSettingsView> {
    return this.uow.run(async ({ alertSettings }) =>
      toAlertSettingsView(
        (await alertSettings.findByAccount(query.accountId)) ?? AlertSettings.createDefault(query.accountId),
      ),
    );
  }
}
