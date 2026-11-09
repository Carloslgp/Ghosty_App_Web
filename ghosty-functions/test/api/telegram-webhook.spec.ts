import { HttpRequest, InvocationContext } from '@azure/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandleTelegramUpdateHandler } from '../../src/application/features/handle-telegram-update/handle-telegram-update.handler.js';
import { resetRuntime } from '../../src/api/shared/runtime.js';
import { createTelegramWebhook, secretMatches, telegramWebhook } from '../../src/api/telegram-webhook.js';
import { TelegramBotAdmin } from '../../src/infrastructure/telegram/telegram-bot.gateway.js';
import { FakeTelegram, FakeTelegramLinks } from '../support/fakes.js';

const SECRET = 'segredo-do-webhook-com-32-caracteres';
const TOKEN = 'QZf1G-GRU6ddOI-CFHmAics50X53d1eLCEJyvzNUMdw';

const context = () => new InvocationContext({ invocationId: 'teste', functionName: 'telegram-webhook' });
const post = (body: unknown, secret?: string) =>
  new HttpRequest({
    method: 'POST',
    url: 'http://localhost:7071/api/telegram/webhook?code=function-key',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}),
    },
    body: { string: typeof body === 'string' ? body : JSON.stringify(body) },
  });
/** Os exemplos do contrato (`functions.openapi.yaml`). */
const update = (text: string, type = 'private') => ({
  update_id: 812345678,
  message: {
    message_id: 41,
    date: 1793916600,
    text,
    chat: { id: 5123456789, type },
    from: { id: 5123456789, is_bot: false, first_name: 'Ana' },
  },
});

describe('Função telegram-webhook', () => {
  let safety: FakeTelegramLinks;
  let telegram: FakeTelegram;
  let webhook: ReturnType<typeof createTelegramWebhook>;

  beforeEach(() => {
    safety = new FakeTelegramLinks();
    telegram = new FakeTelegram();
    const handler = new HandleTelegramUpdateHandler(safety, telegram);
    webhook = createTelegramWebhook({ webhookSecret: () => SECRET, handler: () => handler });
  });

  it('sem o segredo, ou com o segredo errado, responde 401 e não toca em nada', async () => {
    for (const secret of [undefined, 'errado', `${SECRET}x`]) {
      const res = await webhook(post(update(`/start ${TOKEN}`), secret), context());
      expect(res.status).toBe(401);
      expect((res.jsonBody as { code: string }).code).toBe('UNAUTHENTICATED');
    }
    expect(safety.links).toEqual([]);
  });

  it('sem TELEGRAM_WEBHOOK_SECRET configurado, nada confere (falha fechada)', () => {
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches(null, SECRET)).toBe(false);
    expect(secretMatches('qualquer', '')).toBe(false);
    expect(secretMatches(SECRET, SECRET)).toBe(true);
  });

  it('/start vincula (linked) e /parar sai (left), com o chat em texto', async () => {
    const linked = await webhook(post(update(`/start ${TOKEN}`), SECRET), context());
    expect(linked.status).toBe(200);
    expect(linked.jsonBody).toEqual({ result: 'linked' });
    expect(safety.links[0]).toMatchObject({ token: TOKEN, chatId: '5123456789' });
    expect(telegram.sent).toHaveLength(1);

    const left = await webhook(post(update('/parar'), SECRET), context());
    expect(left.jsonBody).toEqual({ result: 'left' });
    expect(safety.leaves).toEqual(['5123456789']);
  });

  it('responde 200 ignored para o que não interessa, para o Telegram não reenviar', async () => {
    for (const body of [
      update('bom dia'),
      update(`/start ${TOKEN}`, 'supergroup'),
      { update_id: 1 },
      {},
      '{"x',
    ])
      expect((await webhook(post(body, SECRET), context())).jsonBody).toEqual({ result: 'ignored' });
    expect(safety.links).toEqual([]);
  });

  it('o log leva só o resultado: nunca o texto, o chat nem o token', async () => {
    const ctx = context();
    const lines: string[] = [];
    ctx.log = (...args: unknown[]) => void lines.push(args.join(' '));
    await webhook(post(update(`/start ${TOKEN}`), SECRET), ctx);
    expect(lines).toEqual(['telegram-webhook: linked']);
  });

  it('safety-service fora do ar: 500, e o Telegram tenta de novo mais tarde', async () => {
    safety.down = true;
    const res = await webhook(post(update(`/start ${TOKEN}`), SECRET), context());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.jsonBody)).not.toContain('fora do ar');
  });
});

describe('Função telegram-webhook registrada (configuração real)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetRuntime();
  });

  it('lê o segredo de TELEGRAM_WEBHOOK_SECRET', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'dev-internal-key');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', SECRET);
    resetRuntime();
    expect((await telegramWebhook(post(update('oi'), 'errado'), context())).status).toBe(401);
    expect((await telegramWebhook(post(update('oi'), SECRET), context())).jsonBody).toEqual({
      result: 'ignored',
    });
  });
});

describe('TelegramBotAdmin (Bot API falsa, sem sair da máquina)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('setWebhook envia o secret_token e só pede mensagens; erro da API não mostra o token', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      const fail = url.endsWith('/getMe');
      return Promise.resolve(
        new Response(
          JSON.stringify(fail ? { ok: false, description: 'Unauthorized' } : { ok: true, result: true }),
          {
            status: fail ? 401 : 200,
          },
        ),
      );
    });
    const admin = new TelegramBotAdmin('123:token-secreto', 'https://telegram.invalid');
    await expect(admin.setWebhook('https://fn.example/api/telegram/webhook?code=abc', SECRET)).resolves.toBe(
      true,
    );
    expect(calls[0]).toEqual({
      url: 'https://telegram.invalid/bot123:token-secreto/setWebhook',
      body: {
        url: 'https://fn.example/api/telegram/webhook?code=abc',
        secret_token: SECRET,
        allowed_updates: ['message'],
        drop_pending_updates: true,
      },
    });
    const error = await admin.getMe().catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe('Telegram getMe: 401 (Unauthorized)');
    expect((error as Error).message).not.toContain('token-secreto');
  });
});
