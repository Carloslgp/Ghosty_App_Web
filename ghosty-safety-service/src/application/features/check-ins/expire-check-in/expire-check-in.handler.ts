import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { SafetyConfig } from '../../../ports/safety-config.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { openHelpRequest } from '../../../shared/help-requests.js';

export interface ExpireCheckInResult {
  result: 'expired' | 'ignored';
  helpRequestId: string | null;
}

/**
 * Chamado pela Function `check-in-deadline` quando a mensagem de prazo fica visível. Se o check-in está
 * ativo e na mesma versão, vence e vira um pedido de ajuda com origem `check_in` (com outbox), no mesmo
 * modo do check-in. Já confirmado, cancelado ou estendido: `ignored`. Repetir a chamada depois de
 * vencido devolve o mesmo pedido, sem criar outro.
 */
export class ExpireCheckInHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: SafetyConfig,
  ) {}

  execute(command: {
    checkInId: string;
    version: number;
    correlationId: string;
  }): Promise<ExpireCheckInResult> {
    const now = this.clock.now();
    return this.uow.run(async (repos) => {
      const checkIn = await repos.checkIns.findByIdInAnyAccount(command.checkInId);
      if (!checkIn) throw new NotFoundError('Check-in não encontrado.');

      if (checkIn.expire(command.version, now) === 'ignored') {
        if (checkIn.status !== 'expired' || checkIn.version !== command.version) {
          return { result: 'ignored', helpRequestId: null };
        }
        const existing = (await repos.helpRequests.findIdsByCheckIns([checkIn.id])).get(checkIn.id);
        return { result: 'expired', helpRequestId: existing ?? null };
      }

      await repos.checkIns.update(checkIn);
      const request = await openHelpRequest(repos, {
        helpRequestId: this.ids.newId(),
        eventId: this.ids.newId(),
        accountId: checkIn.accountId,
        origin: 'check_in',
        mode: checkIn.mode,
        location: null,
        checkInId: checkIn.id,
        correlationId: command.correlationId,
        timezone: this.config.timezone,
        now,
      });
      return { result: 'expired', helpRequestId: request.id };
    });
  }
}
