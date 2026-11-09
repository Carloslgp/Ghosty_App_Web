import type { DeliveryChannel, DeliveryOutcome } from '../../../../domain/help-requests/delivery-step.js';
import { DomainError } from '../../../../domain/shared/domain-error.js';
import type { Clock } from '../../../ports/clock.js';
import type { IdGenerator } from '../../../ports/id-generator.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';

/** O evento `AlertDispatched` (fila `alert-dispatches`), já validado. */
export interface AlertDispatchedEvent {
  id: string;
  correlationId: string;
  data: {
    helpRequestId: string;
    accountId: string;
    status: 'dispatched' | 'failed';
    dispatchedAt: string;
    steps: {
      stepOrder: number;
      contactId: string | null;
      channel: DeliveryChannel;
      outcome: DeliveryOutcome;
      message: string | null;
      errorCode: string | null;
      occurredAt: string;
    }[];
  };
}

export type RecordOutcome = 'recorded' | 'duplicate' | 'unknown_help_request';

/**
 * Grava a linha do tempo de um pedido de ajuda. Idempotente: a mesma mensagem (mesmo `id`) é
 * descartada, e passos que já existem (mesma ordem) não são gravados de novo.
 */
export class RecordAlertDispatchHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  execute(event: AlertDispatchedEvent): Promise<RecordOutcome> {
    const now = this.clock.now();
    return this.uow.run(async ({ helpRequests, processedMessages }) => {
      if (await processedMessages.has(event.id)) return 'duplicate';
      await processedMessages.add(event.id, now);

      const request = await helpRequests.findById(event.data.helpRequestId);
      if (!request || request.accountId !== event.data.accountId) return 'unknown_help_request';

      const known = new Set((await helpRequests.listSteps(request.id)).map((step) => step.stepOrder));
      await helpRequests.addSteps(
        event.data.steps
          .filter((step) => !known.has(step.stepOrder))
          .map((step) => ({
            ...step,
            id: this.ids.newId(),
            helpRequestId: request.id,
            occurredAt: new Date(step.occurredAt),
          })),
      );
      try {
        request.recordDispatch(event.data.status, new Date(event.data.dispatchedAt));
      } catch (error) {
        // Um resultado diferente para um pedido já encerrado só fica registrado nos passos.
        if (!(error instanceof DomainError)) throw error;
      }
      await helpRequests.update(request);
      return 'recorded';
    });
  }
}
