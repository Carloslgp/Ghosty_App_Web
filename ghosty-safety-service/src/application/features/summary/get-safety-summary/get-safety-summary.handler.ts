import { AlertSettings } from '../../../../domain/alert-settings/alert-settings.entity.js';
import type { ContactChannel, ContactStatus } from '../../../../domain/contacts/contact.entity.js';
import type { HelpRequest } from '../../../../domain/help-requests/help-request.entity.js';
import type { UnitOfWork } from '../../../ports/unit-of-work.js';
import { NotFoundError } from '../../../shared/errors.js';

export interface SafetySummaryView {
  displayName: string;
  secretCodeSet: boolean;
  network: {
    total: number;
    confirmed: number;
    pending: number;
    declined: number;
    contacts: {
      id: string;
      nickname: string;
      position: number;
      status: ContactStatus;
      channel: ContactChannel | null;
    }[];
  };
  alertSettings: {
    messageTemplate: string;
    includeLocation: boolean;
    countdownSeconds: number;
    reviewed: boolean;
  };
  activeCheckIn: {
    id: string;
    destination: string;
    dueAt: string;
    deadlineAt: string;
    status: 'active';
  } | null;
  lastTest: { helpRequestId: string; at: string; outcome: 'ok' | 'failed' | 'pending' } | null;
}

function testOutcome(test: HelpRequest): 'ok' | 'failed' | 'pending' {
  const s = test.toSnapshot();
  if (s.status === 'dispatched') return 'ok';
  if (s.status === 'triggered') return 'pending';
  if (s.status === 'failed') return 'failed';
  // Cancelado ("foi engano"): vale o que aconteceu antes do cancelamento.
  return s.dispatchedAt !== null ? 'ok' : 'failed';
}

/** Tudo o que o BFF precisa para o painel e para pedir a prontidão à Function. */
export class GetSafetySummaryHandler {
  constructor(private readonly uow: UnitOfWork) {}

  execute(query: { accountId: string }): Promise<SafetySummaryView> {
    return this.uow.run(async ({ accounts, contacts, alertSettings, checkIns, helpRequests }) => {
      const account = await accounts.findById(query.accountId);
      if (!account) throw new NotFoundError('Conta não encontrada.');
      const network = await contacts.listByAccount(account.id);
      const settings = (
        (await alertSettings.findByAccount(account.id)) ?? AlertSettings.createDefault(account.id)
      ).toSnapshot();
      const active = await checkIns.findActive(account.id, 'real');
      const lastTest = await helpRequests.findLatestTest(account.id);
      const count = (status: ContactStatus) => network.filter((contact) => contact.status === status).length;

      return {
        displayName: account.displayName,
        secretCodeSet: account.secretCodeSet,
        network: {
          total: network.length,
          confirmed: count('confirmed'),
          pending: count('pending'),
          declined: count('declined'),
          contacts: network.map((c) => ({
            id: c.id,
            nickname: c.nickname,
            position: c.position,
            status: c.status,
            channel: c.channel,
          })),
        },
        alertSettings: {
          messageTemplate: settings.messageTemplate,
          includeLocation: settings.includeLocation,
          countdownSeconds: settings.countdownSeconds,
          reviewed: settings.reviewedAt !== null,
        },
        activeCheckIn: active
          ? {
              id: active.id,
              destination: active.toSnapshot().destination,
              dueAt: active.toSnapshot().dueAt.toISOString(),
              deadlineAt: active.deadlineAt.toISOString(),
              status: 'active',
            }
          : null,
        lastTest: lastTest
          ? {
              helpRequestId: lastTest.id,
              at: lastTest.toSnapshot().createdAt.toISOString(),
              outcome: testOutcome(lastTest),
            }
          : null,
      };
    });
  }
}
