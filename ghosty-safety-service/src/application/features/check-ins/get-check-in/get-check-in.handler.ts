import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toCheckInView, type CheckInView } from '../../../shared/views.js';

export class GetCheckInHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string; checkInId: string }): Promise<CheckInView> {
    return this.uow.run(async ({ checkIns, helpRequests }) => {
      const checkIn = await checkIns.findById(query.accountId, query.checkInId);
      if (!checkIn) throw new NotFoundError('Check-in não encontrado.');
      const helpRequestId = (await helpRequests.findIdsByCheckIns([checkIn.id])).get(checkIn.id) ?? null;
      return toCheckInView(checkIn, helpRequestId);
    });
  }
}
