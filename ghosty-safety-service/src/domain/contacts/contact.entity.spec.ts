import { describe, expect, it } from 'vitest';
import { DomainError } from '../shared/domain-error.js';
import { Contact } from './contact.entity.js';
import { MAX_CONTACTS, SupportNetwork } from './support-network.js';

const NOW = new Date('2026-11-06T22:00:00Z');
const LATER = new Date('2026-11-07T10:00:00Z');
const AFTER_72H = new Date('2026-11-09T22:00:00Z');

function invited(id = 'c1', position = 1) {
  const contact = Contact.create({ id, accountId: 'a1', nickname: ' Ana ', position, now: NOW });
  contact.issueInvitation('hash-1', NOW, 72);
  return contact;
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error('esperava um DomainError');
}

describe('Contact', () => {
  it('nasce pendente, sem canal, só com o apelido', () => {
    const contact = Contact.create({ id: 'c1', accountId: 'a1', nickname: ' Ana ', position: 1, now: NOW });
    expect(contact.toSnapshot()).toMatchObject({
      nickname: 'Ana',
      status: 'pending',
      channel: null,
      telegramChatId: null,
      inviteTokenHash: null,
    });
    expect(contact.invitationState(NOW)).toBe('expired');
    expectCode(() => contact.rename('x'.repeat(41)), 'VALIDATION_FAILED');
  });

  it('aceitar pelo navegador confirma na hora, no canal web', () => {
    const contact = invited();
    contact.acceptOnWeb(LATER);
    expect(contact.toSnapshot()).toMatchObject({ status: 'confirmed', channel: 'web', respondedAt: LATER });
    expect(contact.canSeeWebAlerts()).toBe(true);
  });

  it('o vínculo do Telegram confirma e guarda o chat', () => {
    const contact = invited();
    contact.linkTelegram('-100123', LATER);
    expect(contact.toSnapshot()).toMatchObject({
      status: 'confirmed',
      channel: 'telegram',
      telegramChatId: '-100123',
    });
    expect(contact.canSeeWebAlerts()).toBe(false);
    expectCode(() => invited().linkTelegram('abc', LATER), 'VALIDATION_FAILED');
  });

  it('a resposta só pode ser dada uma vez (409), e vencido sem resposta dá 410', () => {
    const answered = invited();
    answered.decline(LATER);
    expect(answered.status).toBe('declined');
    expectCode(() => answered.acceptOnWeb(LATER), 'INVALID_STATE');
    expectCode(() => answered.linkTelegram('1', LATER), 'INVALID_STATE');
    expectCode(() => answered.decline(LATER), 'INVALID_STATE');

    const expired = invited();
    expect(expired.invitationState(AFTER_72H)).toBe('expired');
    expectCode(() => expired.acceptOnWeb(AFTER_72H), 'INVITATION_EXPIRED');
  });

  it('um convite novo volta para pendente e apaga o canal anterior', () => {
    const contact = invited();
    contact.linkTelegram('42', LATER);
    contact.issueInvitation('hash-2', LATER, 72);
    expect(contact.toSnapshot()).toMatchObject({
      status: 'pending',
      channel: null,
      telegramChatId: null,
      inviteTokenHash: 'hash-2',
      respondedAt: null,
    });
    expect(contact.invitationState(LATER)).toBe('open');
  });

  it('/parar leva só o confirmado no Telegram para declined', () => {
    const telegram = invited();
    telegram.linkTelegram('42', LATER);
    expect(telegram.leaveTelegram()).toBe(true);
    expect(telegram.status).toBe('declined');
    expect(telegram.leaveTelegram()).toBe(false);

    const web = invited();
    web.acceptOnWeb(LATER);
    expect(web.leaveTelegram()).toBe(false);
    expect(web.status).toBe('confirmed');
  });
});

describe('SupportNetwork', () => {
  const network = (n: number) =>
    new SupportNetwork(Array.from({ length: n }, (_, i) => invited(`c${i + 1}`, i + 1)));

  it('o próximo contato entra no fim, e a rede tem no máximo 10', () => {
    expect(network(3).nextPosition()).toBe(4);
    expectCode(() => network(MAX_CONTACTS).nextPosition(), 'INVALID_STATE');
  });

  it('reordena com todos os ids, uma vez cada', () => {
    const net = network(3);
    expect(net.reorder(['c3', 'c1', 'c2']).map((c) => [c.id, c.position])).toEqual([
      ['c3', 1],
      ['c1', 2],
      ['c2', 3],
    ]);
    for (const bad of [
      ['c1', 'c2'],
      ['c1', 'c2', 'c3', 'c4'],
      ['c1', 'c1', 'c2'],
      ['c1', 'c2', 'x'],
    ]) {
      expectCode(() => network(3).reorder(bad), 'VALIDATION_FAILED');
    }
  });

  it('remover compacta as posições dos demais', () => {
    const net = network(4);
    const changed = net.remove('c2');
    expect(changed.map((c) => [c.id, c.position])).toEqual([
      ['c3', 2],
      ['c4', 3],
    ]);
    expect(net.ordered.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  });
});
