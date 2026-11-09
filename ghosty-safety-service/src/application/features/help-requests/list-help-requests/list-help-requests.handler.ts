import type { Mode } from '../../../../domain/shared/domain-error.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { pageRequest, toPageView, type PageView } from '../../../shared/pagination.js';
import { toHelpRequestSummaryView, type HelpRequestSummaryView } from '../../../shared/views.js';

export interface ListHelpRequestsQuery {
  accountId: string;
  mode?: Mode;
  page?: number;
  pageSize?: number;
}

/** Do mais novo para o mais antigo, sem a linha do tempo. */
export class ListHelpRequestsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: ListHelpRequestsQuery): Promise<PageView<HelpRequestSummaryView>> {
    const request = pageRequest(query.page, query.pageSize);
    return this.uow.run(async ({ helpRequests }) =>
      toPageView(
        await helpRequests.list(query.accountId, { ...request, mode: query.mode }),
        request,
        toHelpRequestSummaryView,
      ),
    );
  }
}
