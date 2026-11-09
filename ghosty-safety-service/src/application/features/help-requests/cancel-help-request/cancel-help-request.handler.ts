import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toHelpRequestView, type HelpRequestView } from '../../../shared/views.js';

/**
 * "Foi engano": `triggered | dispatched → cancelled`. Hoje só registra: o aviso que já saiu não é
 * desfeito e nenhuma mensagem de "foi engano" vai para a rede.
 */
export class CancelHelpRequestHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(command: { accountId: string; helpRequestId: string }): Promise<HelpRequestView> {
    return this.uow.run(async ({ helpRequests, contacts }) => {
      const request = await helpRequests.findById(command.helpRequestId, command.accountId);
      if (!request) throw new NotFoundError('Pedido de ajuda não encontrado.');
      request.cancel();
      await helpRequests.update(request);
      return toHelpRequestView(
        request,
        await helpRequests.listSteps(request.id),
        await contacts.listByAccount(command.accountId),
      );
    });
  }
}
