import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GetDeliveryTargetsHandler } from '../../src/application/features/help-requests/get-delivery-targets/get-delivery-targets.handler.js';
import { GetHelpRequestHandler } from '../../src/application/features/help-requests/get-help-request/get-help-request.handler.js';
import { GetInvitationAlertsHandler } from '../../src/application/features/invitations/get-invitation-alerts/get-invitation-alerts.handler.js';
import { GetSafetySummaryHandler } from '../../src/application/features/summary/get-safety-summary/get-safety-summary.handler.js';
import { DEMO_EMAIL, resetDemo, seedDemo } from '../../src/seed/demo-seed.js';
import { createSafetyKit, type SafetyKit } from '../support/safety-kit.js';

const DEMO_ID = '01a15965-b480-79af-a113-29b2fc82e5ef';

describe('Seed de demonstração', () => {
  let kit: SafetyKit;
  const seed = (telegramChatId?: string) =>
    seedDemo(kit, {
      accountId: DEMO_ID,
      password: 'senha-de-demonstracao',
      lockCode: '246810',
      telegramChatId,
    });

  beforeEach(async () => {
    kit = await createSafetyKit();
  });

  afterEach(() => kit.close());

  it('cria a conta, a rede de apoio, a mensagem revisada e o Teste seguro de 3 dias atrás', async () => {
    const result = await seed('5123456789');
    expect(result).toMatchObject({ accountId: DEMO_ID, email: DEMO_EMAIL });
    expect(result.contacts.map((c) => [c.nickname, c.status, c.channel])).toEqual([
      ['Ana', 'confirmed', 'telegram'],
      ['Beto', 'confirmed', 'web'],
      ['Carla', 'pending', null],
    ]);

    const summary = await new GetSafetySummaryHandler(kit.uow).execute({ accountId: DEMO_ID });
    expect(summary).toMatchObject({
      displayName: 'Maria Exemplo',
      secretCodeSet: true,
      network: { total: 3, confirmed: 2, pending: 1 },
      alertSettings: { includeLocation: true, countdownSeconds: 10, reviewed: true },
      activeCheckIn: null,
      lastTest: { helpRequestId: result.safeTestId, outcome: 'ok' },
    });
    expect(new Date(summary.lastTest!.at).getTime()).toBe(
      kit.clock.now().getTime() - 3 * 24 * 60 * 60 * 1000,
    );

    const test = await new GetHelpRequestHandler(kit.uow).execute({
      accountId: DEMO_ID,
      helpRequestId: result.safeTestId,
    });
    expect(test.steps.map((s) => [s.contactNickname, s.channel, s.outcome])).toEqual([
      ['Ana', 'telegram', 'would_send'],
      ['Beto', 'web', 'would_send'],
      ['Carla', 'none', 'skipped_unconfirmed'],
    ]);
    const targets = await new GetDeliveryTargetsHandler(kit.uow).execute({
      helpRequestId: result.safeTestId,
    });
    expect(targets.targets[0]).toMatchObject({ nickname: 'Ana', telegramChatId: '5123456789' });
  });

  it('sem chat do Telegram, a Ana fica no canal web, e o link do Beto abre a página de avisos', async () => {
    const result = await seed();
    expect(result.contacts[0]).toMatchObject({ nickname: 'Ana', channel: 'web' });
    const token = result.contacts[1]!.inviteUrl.split('/').pop()!;
    const alerts = await new GetInvitationAlertsHandler(kit.uow, kit.tokens, kit.clock).execute({ token });
    expect(alerts.items).toEqual([]);
  });

  it('pode rodar de novo (recomeça do zero), e o reset apaga só a conta demo', async () => {
    await seed();
    await seed();
    expect(await kit.query('SELECT Id FROM Accounts')).toHaveLength(1);
    expect(await kit.query('SELECT Id FROM Contacts')).toHaveLength(3);
    expect(await kit.query('SELECT Id FROM HelpRequests')).toHaveLength(1);

    expect(await resetDemo(kit.uow, DEMO_ID)).toBe(true);
    expect(await resetDemo(kit.uow, DEMO_ID)).toBe(false);
    for (const table of ['Accounts', 'Contacts', 'AlertSettings', 'HelpRequests', 'DeliverySteps']) {
      expect(await kit.query(`SELECT * FROM ${table}`), table).toHaveLength(0);
    }
  });

  it('recusa código de bloqueio fora do formato antes de gravar qualquer coisa', async () => {
    await expect(
      seedDemo(kit, { accountId: DEMO_ID, password: 'senha-de-demonstracao', lockCode: 'abc' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await kit.query('SELECT Id FROM Accounts')).toHaveLength(0);
  });
});
