import { AlertSettings } from '../../domain/alert-settings/alert-settings.entity.js';
import {
  HelpRequest,
  type GeoLocation,
  type HelpRequestOrigin,
} from '../../domain/help-requests/help-request.entity.js';
import type { Mode } from '../../domain/shared/domain-error.js';
import type { Repositories } from '../ports/unit-of-work.js';
import { NotFoundError } from './errors.js';
import { helpRequestTriggeredMessage } from './events.js';

export interface OpenHelpRequestParams {
  helpRequestId: string;
  eventId: string;
  accountId: string;
  origin: HelpRequestOrigin;
  mode: Mode;
  /** A localização informada pelo navegador. Só é guardada se a pessoa ligou "incluir localização". */
  location: GeoLocation | null;
  checkInId: string | null;
  correlationId: string;
  timezone: string;
  now: Date;
}

/**
 * Grava o pedido de ajuda e o evento `HelpRequestTriggered` na mesma transação (transactional outbox).
 * Usado pelo botão (`TriggerHelpRequest`) e pelo check-in vencido (`ExpireCheckIn`).
 */
export async function openHelpRequest(
  repos: Pick<Repositories, 'accounts' | 'contacts' | 'alertSettings' | 'helpRequests' | 'outbox'>,
  params: OpenHelpRequestParams,
): Promise<HelpRequest> {
  const account = await repos.accounts.findById(params.accountId);
  if (!account) throw new NotFoundError('Conta não encontrada.');
  const settings = (
    (await repos.alertSettings.findByAccount(account.id)) ?? AlertSettings.createDefault(account.id)
  ).toSnapshot();

  const request = HelpRequest.trigger({
    id: params.helpRequestId,
    accountId: account.id,
    origin: params.origin,
    mode: params.mode,
    location: settings.includeLocation ? params.location : null,
    checkInId: params.checkInId,
    now: params.now,
  });
  await repos.helpRequests.insert(request);
  await repos.outbox.add(
    helpRequestTriggeredMessage({
      eventId: params.eventId,
      correlationId: params.correlationId,
      now: params.now,
      request,
      displayName: account.displayName,
      messageTemplate: settings.messageTemplate,
      contacts: await repos.contacts.listByAccount(account.id),
      timezone: params.timezone,
    }),
  );
  return request;
}
