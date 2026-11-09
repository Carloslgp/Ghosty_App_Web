import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import { Contact } from '../../../domain/contacts/contact.entity.js';
import { HelpRequest } from '../../../domain/help-requests/help-request.entity.js';
import { NotFoundError } from '../../shared/errors.js';
import { LeaveTelegramContactHandler } from '../telegram/leave-telegram-contact/leave-telegram-contact.handler.js';
import { LinkTelegramContactHandler } from '../telegram/link-telegram-contact/link-telegram-contact.handler.js';
import { AcceptInvitationHandler } from './accept-invitation/accept-invitation.handler.js';
import { DeclineInvitationHandler } from './decline-invitation/decline-invitation.handler.js';
import { GetInvitationAlertsHandler } from './get-invitation-alerts/get-invitation-alerts.handler.js';
import { GetInvitationHandler } from './get-invitation/get-invitation.handler.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';
const HOUR = 60 * 60 * 1000;

describe('Convites e vínculo com o Telegram', () => {
  let kit: SafetyKit;

  /** Cria um contato com convite aberto e devolve o token. */
  async function invite(nickname = 'Ana', position = 1): Promise<{ token: string; contactId: string }> {
    const { token, hash } = kit.tokens.generate();
    const contact = Contact.create({
      id: kit.ids.newId(),
      accountId: ACCOUNT,
      nickname,
      position,
      now: kit.clock.now(),
    });
    contact.issueInvitation(hash, kit.clock.now(), 72);
    await kit.repos(({ contacts }) => contacts.insert(contact));
    return { token, contactId: contact.id };
  }

  const get = (token: string) =>
    new GetInvitationHandler(kit.uow, kit.tokens, kit.clock, kit.config).execute({ token });
  const accept = (token: string, channel: 'web' | 'telegram') =>
    new AcceptInvitationHandler(kit.uow, kit.tokens, kit.clock, kit.config).execute({ token, channel });
  const decline = (token: string) =>
    new DeclineInvitationHandler(kit.uow, kit.tokens, kit.clock, kit.config).execute({ token });
  const link = (token: string, chatId: string) =>
    new LinkTelegramContactHandler(kit.uow, kit.tokens, kit.clock).execute({ token, chatId });
  const alerts = (token: string, since?: Date) =>
    new GetInvitationAlertsHandler(kit.uow, kit.tokens, kit.clock).execute({ token, since });

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

  it('mostra só o nome de quem convidou e as opções; token desconhecido dá 404', async () => {
    const { token } = await invite();
    expect(await get(token)).toEqual({
      inviterDisplayName: 'Maria',
      status: 'pending',
      channel: null,
      expiresAt: '2026-11-09T22:00:00.000Z',
      respondable: true,
      telegramUrl: `https://t.me/ghosty_dev_bot?start=${token}`,
    });
    await expect(get(kit.tokens.generate().token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('vale 72 horas: depois disso, sem resposta, dá 410', async () => {
    const { token } = await invite();
    kit.clock.advance(72 * HOUR);
    await expect(get(token)).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
    await expect(accept(token, 'web')).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
    expect((await link(token, '42')).result).toBe('ignored');
  });

  it('aceite pelo navegador confirma na hora; responder de novo dá 409', async () => {
    const { token } = await invite();
    expect(await accept(token, 'web')).toMatchObject({
      status: 'confirmed',
      channel: 'web',
      respondable: false,
    });
    await expect(decline(token)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    // Já respondido: a página ainda abre (painel de avisos), mesmo depois das 72 horas.
    kit.clock.advance(100 * HOUR);
    expect((await get(token)).status).toBe('confirmed');
  });

  it('aceite pelo Telegram só devolve o link e não conta como resposta', async () => {
    const { token } = await invite();
    const view = await accept(token, 'telegram');
    expect(view).toMatchObject({
      status: 'pending',
      respondable: true,
      telegramUrl: `https://t.me/ghosty_dev_bot?start=${token}`,
    });
    expect((await decline(token)).status).toBe('declined');
  });

  it('o /start com token válido confirma no Telegram e guarda o chat cifrado; repetir é ignorado', async () => {
    const { token } = await invite();
    expect(await link(token, '987654321')).toEqual({ result: 'linked', inviterDisplayName: 'Maria' });
    expect((await get(token)).channel).toBe('telegram');
    const [row] = await kit.query<{ TelegramChatIdEnc: string }>('SELECT TelegramChatIdEnc FROM Contacts');
    expect(row?.TelegramChatIdEnc).not.toContain('987654321');
    expect(kit.cipher.decrypt(row?.TelegramChatIdEnc ?? '')).toBe('987654321');
    expect(await link(token, '987654321')).toEqual({ result: 'ignored', inviterDisplayName: null });
    expect((await link(kit.tokens.generate().token, '1')).result).toBe('ignored');
  });

  it('/parar leva para declined todos os confirmados com aquele chat', async () => {
    const a = await invite('Ana', 1);
    const b = await invite('Beto', 2);
    const c = await invite('Carla', 3);
    await link(a.token, '42');
    await link(b.token, '42');
    await link(c.token, '7');
    const leave = new LeaveTelegramContactHandler(kit.uow);
    expect(await leave.execute({ chatId: '42' })).toEqual({ result: 'left', contactsAffected: 2 });
    expect(await leave.execute({ chatId: '42' })).toEqual({ result: 'ignored', contactsAffected: 0 });
    expect((await get(c.token)).status).toBe('confirmed');
  });

  it('o painel de avisos só existe para o canal web e traz os passos published_web, do mais novo ao mais antigo', async () => {
    const web = await invite('Beto', 1);
    const telegram = await invite('Ana', 2);
    await accept(web.token, 'web');
    await link(telegram.token, '42');
    await expect(alerts(telegram.token)).rejects.toBeInstanceOf(NotFoundError);
    expect(await alerts(web.token)).toEqual({ items: [] });

    const request = HelpRequest.trigger({
      id: kit.ids.newId(),
      accountId: ACCOUNT,
      origin: 'button',
      mode: 'real',
      location: null,
      checkInId: null,
      now: kit.clock.now(),
    });
    const at = (minutes: number) => new Date(kit.clock.now().getTime() + minutes * 60_000);
    await kit.repos(async ({ helpRequests }) => {
      await helpRequests.insert(request);
      await helpRequests.addSteps([
        {
          id: kit.ids.newId(),
          helpRequestId: request.id,
          stepOrder: 1,
          contactId: telegram.contactId,
          channel: 'telegram',
          message: 'oi Ana',
          outcome: 'sent',
          errorCode: null,
          occurredAt: at(1),
        },
        {
          id: kit.ids.newId(),
          helpRequestId: request.id,
          stepOrder: 2,
          contactId: web.contactId,
          channel: 'web',
          message: 'oi Beto 1',
          outcome: 'published_web',
          errorCode: null,
          occurredAt: at(2),
        },
        {
          id: kit.ids.newId(),
          helpRequestId: request.id,
          stepOrder: 3,
          contactId: web.contactId,
          channel: 'web',
          message: 'oi Beto 2',
          outcome: 'published_web',
          errorCode: null,
          occurredAt: at(3),
        },
      ]);
    });
    expect((await alerts(web.token)).items.map((item) => item.message)).toEqual(['oi Beto 2', 'oi Beto 1']);
    expect((await alerts(web.token, at(2))).items.map((item) => item.message)).toEqual(['oi Beto 2']);
  });
});
