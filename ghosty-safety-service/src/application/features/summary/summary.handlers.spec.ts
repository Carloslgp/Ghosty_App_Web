import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import { DEFAULT_MESSAGE_TEMPLATE } from '../../../domain/alert-settings/alert-settings.entity.js';
import { CheckIn } from '../../../domain/check-ins/check-in.entity.js';
import { Contact } from '../../../domain/contacts/contact.entity.js';
import { HelpRequest } from '../../../domain/help-requests/help-request.entity.js';
import { NotFoundError } from '../../shared/errors.js';
import { GetAlertSettingsHandler } from '../alert-settings/get-alert-settings/get-alert-settings.handler.js';
import { UpdateAlertSettingsHandler } from '../alert-settings/update-alert-settings/update-alert-settings.handler.js';
import {
  RecordAlertDispatchHandler,
  type AlertDispatchedEvent,
} from '../help-requests/record-alert-dispatch/record-alert-dispatch.handler.js';
import { GetSafetySummaryHandler } from './get-safety-summary/get-safety-summary.handler.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('Mensagem, resumo e registro do envio', () => {
  let kit: SafetyKit;
  const summary = () => new GetSafetySummaryHandler(kit.uow).execute({ accountId: ACCOUNT });

  beforeEach(async () => {
    kit = await createSafetyKit();
    await kit.repos(({ accounts }) =>
      accounts.insert(
        Account.create({
          id: ACCOUNT,
          email: 'm@example.com',
          displayName: 'Maria',
          passwordHash: 'h',
          now: kit.clock.now(),
        }),
      ),
    );
  });

  afterEach(() => kit.close());

  it('a mensagem tem valores padrão; salvar marca como revisada e cifra o modelo', async () => {
    expect(await new GetAlertSettingsHandler(kit.uow).execute({ accountId: ACCOUNT })).toEqual({
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
      includeLocation: true,
      countdownSeconds: 10,
      checkInToleranceMinutes: 10,
      reviewed: false,
      reviewedAt: null,
    });
    const saved = await new UpdateAlertSettingsHandler(kit.uow, kit.clock).execute({
      accountId: ACCOUNT,
      messageTemplate: 'Oi {apelido}, aqui é {nome}.',
      includeLocation: false,
      countdownSeconds: 15,
      checkInToleranceMinutes: 5,
    });
    expect(saved).toMatchObject({
      reviewed: true,
      reviewedAt: '2026-11-06T22:00:00.000Z',
      countdownSeconds: 15,
    });
    const [row] = await kit.query<{ MessageTemplateEnc: string }>(
      'SELECT MessageTemplateEnc FROM AlertSettings',
    );
    expect(row?.MessageTemplateEnc).not.toContain('apelido');
    await expect(
      new UpdateAlertSettingsHandler(kit.uow, kit.clock).execute({ ...saved, accountId: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('o resumo de uma conta nova traz a rede vazia, a mensagem padrão e nada ativo', async () => {
    expect(await summary()).toEqual({
      displayName: 'Maria',
      secretCodeSet: false,
      network: { total: 0, confirmed: 0, pending: 0, declined: 0, contacts: [] },
      alertSettings: {
        messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
        includeLocation: true,
        countdownSeconds: 10,
        reviewed: false,
      },
      activeCheckIn: null,
      lastTest: null,
    });
    await expect(new GetSafetySummaryHandler(kit.uow).execute({ accountId: 'x' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('o resumo conta a rede por status e traz o check-in ativo e o último Teste seguro', async () => {
    const now = kit.clock.now();
    const contact = (nickname: string, position: number) =>
      Contact.create({ id: kit.ids.newId(), accountId: ACCOUNT, nickname, position, now });
    const ana = contact('Ana', 1);
    ana.issueInvitation('h1', now, 72);
    ana.linkTelegram('42', now);
    const beto = contact('Beto', 2);
    const checkIn = CheckIn.start({
      id: kit.ids.newId(),
      accountId: ACCOUNT,
      destination: 'Casa',
      dueAt: new Date(now.getTime() + 30 * 60_000),
      toleranceMinutes: 10,
      mode: 'real',
      now,
    });
    const test = HelpRequest.trigger({
      id: kit.ids.newId(),
      accountId: ACCOUNT,
      origin: 'button',
      mode: 'test',
      location: null,
      checkInId: null,
      now,
    });
    test.recordDispatch('dispatched', now);
    await kit.repos(async ({ contacts, checkIns, helpRequests }) => {
      await contacts.insert(ana);
      await contacts.insert(beto);
      await checkIns.insert(checkIn);
      await helpRequests.insert(test);
    });

    const result = await summary();
    expect(result.network).toMatchObject({ total: 2, confirmed: 1, pending: 1, declined: 0 });
    expect(result.network.contacts[0]).toEqual({
      id: ana.id,
      nickname: 'Ana',
      position: 1,
      status: 'confirmed',
      channel: 'telegram',
    });
    expect(result.activeCheckIn).toEqual({
      id: checkIn.id,
      destination: 'Casa',
      dueAt: '2026-11-06T22:30:00.000Z',
      deadlineAt: '2026-11-06T22:40:00.000Z',
      status: 'active',
    });
    expect(result.lastTest).toEqual({
      helpRequestId: test.id,
      at: '2026-11-06T22:00:00.000Z',
      outcome: 'ok',
    });
  });

  it('o registro do envio grava a linha do tempo uma vez só, mesmo com a mensagem repetida', async () => {
    const request = HelpRequest.trigger({
      id: kit.ids.newId(),
      accountId: ACCOUNT,
      origin: 'button',
      mode: 'test',
      location: { lat: -23.55, lng: -46.63, accuracyMeters: 20 },
      checkInId: null,
      now: kit.clock.now(),
    });
    await kit.repos(({ helpRequests }) => helpRequests.insert(request));
    const event: AlertDispatchedEvent = {
      id: '01a1b2e9-7230-7198-bab2-afe8f4a60698',
      correlationId: 'c1',
      data: {
        helpRequestId: request.id,
        accountId: ACCOUNT,
        status: 'dispatched',
        dispatchedAt: '2026-11-06T22:00:06Z',
        steps: [
          {
            stepOrder: 1,
            contactId: null,
            channel: 'none',
            outcome: 'no_contacts',
            message: null,
            errorCode: null,
            occurredAt: '2026-11-06T22:00:05Z',
          },
        ],
      },
    };
    const handler = new RecordAlertDispatchHandler(kit.uow, kit.clock, kit.ids);
    expect(await handler.execute(event)).toBe('recorded');
    expect(await handler.execute(event)).toBe('duplicate');
    expect(await handler.execute({ ...event, id: '01a1b2e9-7230-7198-bab2-000000000001' })).toBe('recorded');
    expect(await kit.repos(({ helpRequests }) => helpRequests.listSteps(request.id))).toHaveLength(1);
    const stored = await kit.repos(({ helpRequests }) => helpRequests.findById(request.id));
    expect(stored?.toSnapshot()).toMatchObject({
      status: 'dispatched',
      location: { lat: -23.55, lng: -46.63, accuracyMeters: 20 },
    });
    expect(
      await handler.execute({
        ...event,
        id: '01a1b2e9-7230-7198-bab2-000000000002',
        data: { ...event.data, helpRequestId: 'x' },
      }),
    ).toBe('unknown_help_request');
  });
});
