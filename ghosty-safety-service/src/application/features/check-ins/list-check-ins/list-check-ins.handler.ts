import type { CheckInStatus } from '../../../../domain/check-ins/check-in.entity.js';
import type { Mode } from '../../../../domain/shared/domain-error.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { pageRequest, toPageView, type PageView } from '../../../shared/pagination.js';
import { toCheckInView, type CheckInView } from '../../../shared/views.js';

export interface ListCheckInsQuery {
  accountId: string;
  status?: CheckInStatus;
  mode?: Mode;
  page?: number;
  pageSize?: number;
}

/** Do mais novo para o mais antigo. */
export class ListCheckInsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: ListCheckInsQuery): Promise<PageView<CheckInView>> {
    const request = pageRequest(query.page, query.pageSize);
    return this.uow.run(async ({ checkIns, helpRequests }) => {
      const page = await checkIns.list(query.accountId, {
        ...request,
        status: query.status,
        mode: query.mode,
      });
      const helpRequestIds = await helpRequests.findIdsByCheckIns(
        page.items.filter((checkIn) => checkIn.status === 'expired').map((checkIn) => checkIn.id),
      );
      return toPageView(page, request, (checkIn) =>
        toCheckInView(checkIn, helpRequestIds.get(checkIn.id) ?? null),
      );
    });
  }
}
