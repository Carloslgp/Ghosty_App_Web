import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';
import { toHelpRequestView, type HelpRequestView } from '../../../shared/views.js';

/** O pedido com a linha do tempo. O front consulta a cada 2 segundos até o status sair de `triggered`. */
export class GetHelpRequestHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string; helpRequestId: string }): Promise<HelpRequestView> {
    return this.uow.run(async ({ helpRequests, contacts }) => {
      const request = await helpRequests.findById(query.helpRequestId, query.accountId);
      if (!request) throw new NotFoundError('Pedido de ajuda não encontrado.');
      return toHelpRequestView(
        request,
        await helpRequests.listSteps(request.id),
        await contacts.listByAccount(query.accountId),
      );
    });
  }
}
