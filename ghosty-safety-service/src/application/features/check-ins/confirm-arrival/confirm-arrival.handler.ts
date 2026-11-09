import type { Clock } from '../../../ports/clock.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toCheckInView, type CheckInView } from '../../../shared/views.js';

/** "Cheguei bem": encerra o check-in ativo. Vencido, cancelado ou já confirmado responde 409. */
export class ConfirmArrivalHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  execute(command: { accountId: string; checkInId: string }): Promise<CheckInView> {
    return this.uow.run(async ({ checkIns }) => {
      const checkIn = await checkIns.findById(command.accountId, command.checkInId);
      if (!checkIn) throw new NotFoundError('Check-in não encontrado.');
      checkIn.confirm(this.clock.now());
      await checkIns.update(checkIn);
      return toCheckInView(checkIn, null);
    });
  }
}
