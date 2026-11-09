import type { GeoLocation } from '../../../../domain/help-requests/help-request.entity.js';
import type { Mode } from '../../../../domain/shared/domain-error.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { OpaqueTokens } from '../../../ports/opaque-tokens.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { openHelpRequest } from '../../../shared/help-requests.js';
import { idempotencyKeyHash, idempotencyNotBefore } from '../../../shared/idempotency.js';
import { toHelpRequestView, type HelpRequestView } from '../../../shared/views.js';

export interface TriggerHelpRequestCommand {
  accountId: string;
  mode: Mode;
  location: GeoLocation | null;
  idempotencyKey: string;
  correlationId: string;
}

/**
 * Dispara o pedido de ajuda: grava o pedido e o evento na mesma transação e devolve na hora. O envio
 * acontece depois, na Function. A mesma `Idempotency-Key` devolve o mesmo pedido, sem evento novo.
 */
export class TriggerHelpRequestHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly tokens: OpaqueTokens,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: SafetyConfig,
  ) {}

  execute(command: TriggerHelpRequestCommand): Promise<HelpRequestView> {
    const now = this.clock.now();
    const keyHash = idempotencyKeyHash(this.tokens, 'help-request', command.idempotencyKey);
    return this.uow.run(async (repos) => {
      const knownId = await repos.idempotencyKeys.find(command.accountId, keyHash, idempotencyNotBefore(now));
      const known = knownId ? await repos.helpRequests.findById(knownId, command.accountId) : null;
      if (known) {
        return toHelpRequestView(
          known,
          await repos.helpRequests.listSteps(known.id),
          await repos.contacts.listByAccount(command.accountId),
        );
      }

      const request = await openHelpRequest(repos, {
        helpRequestId: this.ids.newId(),
        eventId: this.ids.newId(),
        accountId: command.accountId,
        origin: 'button',
        mode: command.mode,
        location: command.location,
        checkInId: null,
        correlationId: command.correlationId,
        timezone: this.config.timezone,
        now,
      });
      await repos.idempotencyKeys.save(command.accountId, keyHash, request.id, now);
      return toHelpRequestView(request, [], []);
    });
  }
}
