import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { checkInDeadlineScheduledMessage } from '../../../shared/events.js';
import { toCheckInView, type CheckInView } from '../../../shared/views.js';

export interface ExtendCheckInCommand {
  accountId: string;
  checkInId: string;
  dueAt: Date;
  toleranceMinutes?: number;
  correlationId: string;
}

/** Sobe a versão e agenda um novo prazo. A mensagem do prazo anterior passa a ser ignorada. */
export class ExtendCheckInHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(command: ExtendCheckInCommand): Promise<CheckInView> {
    const now = this.clock.now();
    return this.uow.run(async ({ checkIns, outbox }) => {
      const checkIn = await checkIns.findById(command.accountId, command.checkInId);
      if (!checkIn) throw new NotFoundError('Check-in não encontrado.');
      checkIn.extend(command.dueAt, now, command.toleranceMinutes);
      await checkIns.update(checkIn);
      await outbox.add(
        checkInDeadlineScheduledMessage({
          eventId: this.ids.newId(),
          correlationId: command.correlationId,
          now,
          checkIn,
        }),
      );
      return toCheckInView(checkIn, null);
    });
  }
}
