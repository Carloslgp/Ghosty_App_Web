import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSafetyKit, type SafetyKit } from '../../../../test/support/safety-kit.js';
import { Account } from '../../../domain/accounts/account.entity.js';
import { NotFoundError } from '../../shared/errors.js';
import { AddContactHandler } from './add-contact/add-contact.handler.js';
import { CreateInvitationHandler } from './create-invitation/create-invitation.handler.js';
import { GetContactHandler } from './get-contact/get-contact.handler.js';
import { ListContactsHandler } from './list-contacts/list-contacts.handler.js';
import { RemoveContactHandler } from './remove-contact/remove-contact.handler.js';
import { ReorderContactsHandler } from './reorder-contacts/reorder-contacts.handler.js';
import { UpdateContactHandler } from './update-contact/update-contact.handler.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';
const OTHER = '01a15965-b480-79af-a113-000000000000';

describe('Contatos: casos de uso', () => {
  let kit: SafetyKit;
  const add = (nickname: string, accountId = ACCOUNT) =>
    new AddContactHandler(kit.uow, kit.clock, kit.ids).execute({ accountId, nickname });
  const list = async (accountId = ACCOUNT) =>
    (await new ListContactsHandler(kit.uow).execute({ accountId })).items.map((c) => [
      c.nickname,
      c.position,
    ]);

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

  it('adiciona no fim da ordem, pendente, e guarda o apelido cifrado', async () => {
    const ana = await add(' Ana ');
    await add('Beto');
    expect(ana).toMatchObject({
      nickname: 'Ana',
      position: 1,
      status: 'pending',
      channel: null,
      inviteExpiresAt: null,
    });
    expect(await list()).toEqual([
      ['Ana', 1],
      ['Beto', 2],
    ]);
    const rows = await kit.query<{ NicknameEnc: string }>('SELECT NicknameEnc FROM Contacts');
    expect(rows.every((row) => row.NicknameEnc.startsWith('v1:') && !row.NicknameEnc.includes('Ana'))).toBe(
      true,
    );
  });

  it('a rede tem no máximo 10 contatos (409)', async () => {
    for (let i = 1; i <= 10; i += 1) await add(`C${i}`);
    await expect(add('Onze')).rejects.toMatchObject({
      code: 'INVALID_STATE',
      message: 'A rede de apoio já tem 10 contatos.',
    });
  });

  it('renomeia, busca e não enxerga contato de outra conta', async () => {
    const ana = await add('Ana');
    expect(
      (
        await new UpdateContactHandler(kit.uow).execute({
          accountId: ACCOUNT,
          contactId: ana.id,
          nickname: 'Aninha',
        })
      ).nickname,
    ).toBe('Aninha');
    expect(
      (await new GetContactHandler(kit.uow).execute({ accountId: ACCOUNT, contactId: ana.id })).nickname,
    ).toBe('Aninha');
    for (const run of [
      () => new GetContactHandler(kit.uow).execute({ accountId: OTHER, contactId: ana.id }),
      () => new UpdateContactHandler(kit.uow).execute({ accountId: OTHER, contactId: ana.id, nickname: 'x' }),
      () => new RemoveContactHandler(kit.uow).execute({ accountId: OTHER, contactId: ana.id }),
      () =>
        new CreateInvitationHandler(kit.uow, kit.tokens, kit.clock, kit.config).execute({
          accountId: OTHER,
          contactId: ana.id,
        }),
    ]) {
      await expect(run()).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it('reordena com todos os ids e recusa lista incompleta', async () => {
    const ana = await add('Ana');
    const beto = await add('Beto');
    const carla = await add('Carla');
    const reorder = new ReorderContactsHandler(kit.uow);
    await reorder.execute({ accountId: ACCOUNT, contactIds: [carla.id, ana.id, beto.id] });
    expect(await list()).toEqual([
      ['Carla', 1],
      ['Ana', 2],
      ['Beto', 3],
    ]);
    await expect(
      reorder.execute({ accountId: ACCOUNT, contactIds: [ana.id, beto.id] }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('remover compacta as posições', async () => {
    await add('Ana');
    const beto = await add('Beto');
    await add('Carla');
    await new RemoveContactHandler(kit.uow).execute({ accountId: ACCOUNT, contactId: beto.id });
    expect(await list()).toEqual([
      ['Ana', 1],
      ['Carla', 2],
    ]);
  });

  it('o convite gera token de 43 caracteres, links e validade de 72 horas, e o banco guarda só o hash', async () => {
    const ana = await add('Ana');
    const invite = await new CreateInvitationHandler(kit.uow, kit.tokens, kit.clock, kit.config).execute({
      accountId: ACCOUNT,
      contactId: ana.id,
    });
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(invite.inviteUrl).toBe(`http://localhost:5173/c/${invite.token}`);
    expect(invite.telegramUrl).toBe(`https://t.me/ghosty_dev_bot?start=${invite.token}`);
    expect(invite.expiresAt).toBe('2026-11-09T22:00:00.000Z');
    const [row] = await kit.query<{ InviteTokenHash: string }>('SELECT InviteTokenHash FROM Contacts');
    expect(row?.InviteTokenHash).toBe(kit.tokens.hash(invite.token));
  });
});
