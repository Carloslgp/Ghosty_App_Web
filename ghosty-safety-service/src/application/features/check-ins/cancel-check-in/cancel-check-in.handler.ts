import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

/** O registro continua, como `cancelled`. A mensagem de prazo já agendada passa a ser ignorada. */
export class CancelCheckInHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string; checkInId: string }): Promise<void> {
    return this.uow.run(async ({ checkIns }) => {
      const checkIn = await checkIns.findById(command.accountId, command.checkInId);
      if (!checkIn) throw new NotFoundError('Check-in não encontrado.');
      checkIn.cancel();
      await checkIns.update(checkIn);
    });
  }
}
