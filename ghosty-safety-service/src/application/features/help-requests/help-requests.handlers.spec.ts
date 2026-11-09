import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import { Contact } from '../../../domain/contacts/contact.entity.js';
import { UpdateAlertSettingsHandler } from '../alert-settings/update-alert-settings/update-alert-settings.handler.js';
import { NotFoundError } from '../../shared/errors.js';
import { CancelHelpRequestHandler } from './cancel-help-request/cancel-help-request.handler.js';
import { GetDeliveryTargetsHandler } from './get-delivery-targets/get-delivery-targets.handler.js';
import { GetHelpRequestHandler } from './get-help-request/get-help-request.handler.js';
import { ListHelpRequestsHandler } from './list-help-requests/list-help-requests.handler.js';
import {
  RecordAlertDispatchHandler,
  type AlertDispatchedEvent,
} from './record-alert-dispatch/record-alert-dispatch.handler.js';
import {
  TriggerHelpRequestHandler,
  type TriggerHelpRequestCommand,
} from './trigger-help-request/trigger-help-request.handler.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';
const ANA = '01a1596a-4860-7d3c-971c-a474b56c7ce7';
const BETO = '01a1596b-32c0-78b2-b54a-d7fa1a1e7fa2';
const CARLA = '01a1596c-1d20-7fdb-b978-4d0ae408d877';
const LOCATION = { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 };

describe('Pedidos de ajuda: casos de uso', () => {
  let kit: SafetyKit;
  const trigger = (overrides: Partial<TriggerHelpRequestCommand> = {}) =>
    new TriggerHelpRequestHandler(kit.uow, kit.tokens, kit.clock, kit.ids, kit.config).execute({
      accountId: ACCOUNT,
      mode: 'real',
      location: LOCATION,
      idempotencyKey: 'chave-de-teste-1',
      correlationId: 'corr-1',
      ...overrides,
    });
  const get = (helpRequestId: string, accountId = ACCOUNT) =>
    new GetHelpRequestHandler(kit.uow).execute({ accountId, helpRequestId });
  const dispatched = (
    helpRequestId: string,
    id = '01a1b2e9-7000-7000-8000-000000000001',
  ): AlertDispatchedEvent => ({
    id,
    correlationId: 'corr-1',
    data: {
      helpRequestId,
      accountId: ACCOUNT,
      status: 'dispatched',
      dispatchedAt: '2026-11-06T22:00:05Z',
      steps: [
        {
          stepOrder: 1,
          contactId: ANA,
          channel: 'telegram',
          outcome: 'sent',
          message: 'Oi, Ana.',
          errorCode: null,
          occurredAt: '2026-11-06T22:00:04Z',
        },
        {
          stepOrder: 2,
          contactId: CARLA,
          channel: 'none',
          outcome: 'skipped_unconfirmed',
          message: null,
          errorCode: null,
          occurredAt: '2026-11-06T22:00:05Z',
        },
      ],
    },
  });

  beforeEach(async () => {
    kit = await createSafetyKit();
    const now = kit.clock.now();
    await kit.repos(async ({ accounts, contacts }) => {
      await accounts.insert(
        Account.create({ id: ACCOUNT, email: 'm@example.com', displayName: 'Maria', passwordHash: 'h', now }),
      );
      const ana = Contact.create({ id: ANA, accountId: ACCOUNT, nickname: 'Ana', position: 1, now });
      ana.issueInvitation('hash-ana', now, 72);
      ana.linkTelegram('5123456789', now);
      const beto = Contact.create({ id: BETO, accountId: ACCOUNT, nickname: 'Beto', position: 2, now });
      beto.issueInvitation('hash-beto', now, 72);
      beto.acceptOnWeb(now);
      const carla = Contact.create({ id: CARLA, accountId: ACCOUNT, nickname: 'Carla', position: 3, now });
      for (const contact of [ana, beto, carla]) await contacts.insert(contact);
    });
  });

  afterEach(() => kit.close());

  it('dispara: grava o pedido e o evento na mesma transação, sem nenhum destino de entrega', async () => {
    const request = await trigger();
    expect(request).toMatchObject({
      origin: 'button',
      mode: 'real',
      status: 'triggered',
      location: LOCATION,
      checkInId: null,
      dispatchedAt: null,
      steps: [],
    });

    const [event] = await kit.outboxEvents();
    expect(event).toMatchObject({
      type: 'ghosty.safety.help-request.triggered.v1',
      correlationId: 'corr-1',
      visibleAfter: null,
    });
    expect(event?.data).toMatchObject({
      helpRequestId: request.id,
      accountId: ACCOUNT,
      displayName: 'Maria',
      location: LOCATION,
      timezone: 'America/Sao_Paulo',
      triggeredAt: request.createdAt,
    });
    expect(event?.data.contacts).toEqual([
      { contactId: ANA, nickname: 'Ana', position: 1, status: 'confirmed', channel: 'telegram' },
      { contactId: BETO, nickname: 'Beto', position: 2, status: 'confirmed', channel: 'web' },
      { contactId: CARLA, nickname: 'Carla', position: 3, status: 'pending', channel: null },
    ]);
    expect(JSON.stringify(event)).not.toContain('5123456789');

    const rows = await kit.query<{ LocationEnc: string }>('SELECT LocationEnc FROM HelpRequests');
    expect(rows[0]?.LocationEnc.startsWith('v1:')).toBe(true);
  });

  it('a localização só é guardada (e só vai no evento) se a pessoa ligou "incluir localização"', async () => {
    await new UpdateAlertSettingsHandler(kit.uow, kit.clock).execute({
      accountId: ACCOUNT,
      messageTemplate: 'Preciso de ajuda, {apelido}.',
      includeLocation: false,
      countdownSeconds: 10,
      checkInToleranceMinutes: 10,
    });
    expect((await trigger()).location).toBeNull();
    const [event] = await kit.outboxEvents();
    expect(event?.data).toMatchObject({ location: null, messageTemplate: 'Preciso de ajuda, {apelido}.' });
  });

  it('a mesma Idempotency-Key não dispara duas vezes; outra chave é outro pedido', async () => {
    const first = await trigger();
    expect((await trigger()).id).toBe(first.id);
    expect(await kit.outboxEvents()).toHaveLength(1);

    expect((await trigger({ idempotencyKey: 'chave-de-teste-2', mode: 'test', location: null })).id).not.toBe(
      first.id,
    );
    expect(await kit.outboxEvents()).toHaveLength(2);
    // A chave é por conta: a mesma chave em outra conta não enxerga o pedido.
    await expect(trigger({ accountId: OTHER })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('recusa localização fora dos limites sem gravar nada', async () => {
    await expect(trigger({ location: { lat: 91, lng: 0, accuracyMeters: null } })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await kit.outboxEvents()).toEqual([]);
    expect((await new ListHelpRequestsHandler(kit.uow).execute({ accountId: ACCOUNT })).total).toBe(0);
  });

  it('os destinos só saem pela rota interna: confirmados, na ordem, com o chat decifrado', async () => {
    const request = await trigger();
    const targets = await new GetDeliveryTargetsHandler(kit.uow).execute({ helpRequestId: request.id });
    expect(targets).toEqual({
      helpRequestId: request.id,
      accountId: ACCOUNT,
      mode: 'real',
      targets: [
        { contactId: ANA, nickname: 'Ana', position: 1, channel: 'telegram', telegramChatId: '5123456789' },
        { contactId: BETO, nickname: 'Beto', position: 2, channel: 'web', telegramChatId: null },
      ],
      recordedSteps: [],
    });
    await expect(
      new GetDeliveryTargetsHandler(kit.uow).execute({
        helpRequestId: '01a1b2e9-0000-7000-8000-0000000000ff',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('depois do AlertDispatched, mostra a linha do tempo com o apelido de cada contato', async () => {
    const request = await trigger();
    await new RecordAlertDispatchHandler(kit.uow, kit.clock, kit.ids).execute(dispatched(request.id));

    const view = await get(request.id);
    expect(view).toMatchObject({ status: 'dispatched', dispatchedAt: '2026-11-06T22:00:05.000Z' });
    expect(view.steps.map((s) => [s.stepOrder, s.contactNickname, s.channel, s.outcome, s.message])).toEqual([
      [1, 'Ana', 'telegram', 'sent', 'Oi, Ana.'],
      [2, 'Carla', 'none', 'skipped_unconfirmed', null],
    ]);

    // Reprocessamento: a Function recebe os passos já gravados e não envia de novo.
    const targets = await new GetDeliveryTargetsHandler(kit.uow).execute({ helpRequestId: request.id });
    expect(targets.recordedSteps).toEqual([
      { contactId: ANA, outcome: 'sent' },
      { contactId: CARLA, outcome: 'skipped_unconfirmed' },
    ]);

    // Contato removido depois: o passo continua, sem apelido.
    await kit.repos(({ contacts }) => contacts.delete(ACCOUNT, CARLA));
    expect((await get(request.id)).steps[1]?.contactNickname).toBeNull();
  });

  it('foi engano: cancela o pedido disparado ou enviado, e recusa cancelar duas vezes', async () => {
    const request = await trigger();
    await new RecordAlertDispatchHandler(kit.uow, kit.clock, kit.ids).execute(dispatched(request.id));
    const cancel = new CancelHelpRequestHandler(kit.uow);

    const cancelled = await cancel.execute({ accountId: ACCOUNT, helpRequestId: request.id });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.steps).toHaveLength(2);
    await expect(cancel.execute({ accountId: ACCOUNT, helpRequestId: request.id })).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
    await expect(cancel.execute({ accountId: OTHER, helpRequestId: request.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('lista do mais novo para o mais antigo, sem a linha do tempo, com filtro de modo', async () => {
    const real = await trigger();
    kit.clock.advance(1_000);
    const test = await trigger({ idempotencyKey: 'chave-de-teste-2', mode: 'test', location: null });

    const list = new ListHelpRequestsHandler(kit.uow);
    const all = await list.execute({ accountId: ACCOUNT });
    expect(all).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(all.items.map((item) => item.id)).toEqual([test.id, real.id]);
    expect(all.items[0]).not.toHaveProperty('steps');
    expect((await list.execute({ accountId: ACCOUNT, mode: 'test' })).items.map((i) => i.id)).toEqual([
      test.id,
    ]);
    expect((await list.execute({ accountId: ACCOUNT, page: 2, pageSize: 1 })).items.map((i) => i.id)).toEqual(
      [real.id],
    );
    await expect(get(real.id, OTHER)).rejects.toBeInstanceOf(NotFoundError);
  });
});
