import type { ContactChannel } from '../../../../domain/contacts/contact.entity.js';
import type { DeliveryOutcome } from '../../../../domain/help-requests/delivery-step.js';
import type { Mode } from '../../../../domain/shared/domain-error.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

export interface DeliveryTargetsView {
  helpRequestId: string;
  accountId: string;
  mode: Mode;
  /** Só os contatos confirmados, na ordem de aviso. */
  targets: {
    contactId: string;
    nickname: string;
    position: number;
    channel: ContactChannel;
    /** Decifrado. Só no canal `telegram`. */
    telegramChatId: string | null;
  }[];
  /** Passos já gravados (reprocessamento da fila): a Function não envia de novo. */
  recordedSteps: { contactId: string | null; outcome: DeliveryOutcome }[];
}

/**
 * Rota interna, chamada pela Function `dispatch-alert` na hora de enviar. É o único caso de uso que
 * devolve o chat do Telegram: o evento da fila não leva nenhum destino de entrega.
 */
export class GetDeliveryTargetsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { helpRequestId: string }): Promise<DeliveryTargetsView> {
    return this.uow.run(async ({ helpRequests, contacts }) => {
      const request = await helpRequests.findById(query.helpRequestId);
      if (!request) throw new NotFoundError('Pedido de ajuda não encontrado.');
      const network = await contacts.listByAccount(request.accountId);
      const steps = await helpRequests.listSteps(request.id);
      return {
        helpRequestId: request.id,
        accountId: request.accountId,
        mode: request.mode,
        targets: network.flatMap((contact) =>
          contact.status === 'confirmed' && contact.channel !== null
            ? [
                {
                  contactId: contact.id,
                  nickname: contact.nickname,
                  position: contact.position,
                  channel: contact.channel,
                  telegramChatId: contact.channel === 'telegram' ? contact.telegramChatId : null,
                },
              ]
            : [],
        ),
        recordedSteps: steps.map((step) => ({ contactId: step.contactId, outcome: step.outcome })),
      };
    });
  }
}
