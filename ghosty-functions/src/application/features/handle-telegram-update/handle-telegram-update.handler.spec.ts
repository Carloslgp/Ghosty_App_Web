import { beforeEach, describe, expect, it } from 'vitest';
import { FakeTelegram, FakeTelegramLinks } from '../../../../test/support/fakes.js';
import { HandleTelegramUpdateHandler, LEFT_REPLY, linkedReply } from './handle-telegram-update.handler.js';

const TOKEN = 'QZf1G-GRU6ddOI-CFHmAics50X53d1eLCEJyvzNUMdw';
const CHAT = '5123456789';

describe('HandleTelegramUpdate: /start e /parar do bot', () => {
  let safety: FakeTelegramLinks;
  let telegram: FakeTelegram;
  let handler: HandleTelegramUpdateHandler;
  const message = (text: string | undefined, chatType = 'private') => ({ text, chatId: CHAT, chatType });

  beforeEach(() => {
    safety = new FakeTelegramLinks();
    telegram = new FakeTelegram();
    handler = new HandleTelegramUpdateHandler(safety, telegram);
  });

  it('/start <token> vincula o chat ao convite e confirma no próprio chat', async () => {
    expect(await handler.execute(message(`/start ${TOKEN}`), 'corr-1')).toBe('linked');
    expect(safety.links).toEqual([{ token: TOKEN, chatId: CHAT, correlationId: 'corr-1' }]);
    expect(telegram.sent).toEqual([{ chatId: CHAT, text: linkedReply('Maria') }]);
    expect(telegram.sent[0]?.text).toContain('rede de apoio de Maria');
  });

  it('token vencido, já usado ou inexistente: ignorado em silêncio', async () => {
    safety.linkResult = { result: 'ignored', inviterDisplayName: null };
    expect(await handler.execute(message(`/start ${TOKEN}`), 'corr-1')).toBe('ignored');
    expect(telegram.sent).toEqual([]);
  });

  it('/parar tira o contato da rede; quem não estava em nenhuma rede não recebe resposta', async () => {
    expect(await handler.execute(message('/parar'), 'corr-1')).toBe('left');
    expect(safety.leaves).toEqual([CHAT]);
    expect(telegram.sent).toEqual([{ chatId: CHAT, text: LEFT_REPLY }]);

    safety.leaveResult = { result: 'ignored', contactsAffected: 0 };
    expect(await handler.execute(message('/parar'), 'corr-1')).toBe('ignored');
    expect(telegram.sent).toHaveLength(1);
  });

  it('qualquer outro texto, /start sem token, grupos e updates sem mensagem não chamam o safety-service', async () => {
    for (const text of ['oi', '/start', '/start curto', '/ajuda', undefined]) {
      expect(await handler.execute(message(text), 'corr-1')).toBe('ignored');
    }
    expect(await handler.execute(message(`/start ${TOKEN}`, 'group'), 'corr-1')).toBe('ignored');
    expect(await handler.execute(undefined, 'corr-1')).toBe('ignored');
    expect(safety.links).toEqual([]);
    expect(safety.leaves).toEqual([]);
  });

  it('se a resposta no chat falhar, o vínculo já feito continua valendo', async () => {
    telegram.next = 'retry';
    expect(await handler.execute(message(`/start ${TOKEN}`), 'corr-1')).toBe('linked');
    expect(safety.links).toHaveLength(1);
  });

  it('sem token do bot configurado, vincula sem responder', async () => {
    const silent = new HandleTelegramUpdateHandler(safety, null);
    expect(await silent.execute(message(`/start ${TOKEN}`), 'corr-1')).toBe('linked');
  });

  it('safety-service fora do ar: o erro sobe, para a entrega ser repetida', async () => {
    safety.down = true;
    await expect(handler.execute(message(`/start ${TOKEN}`), 'corr-1')).rejects.toThrow('fora do ar');
  });
});
