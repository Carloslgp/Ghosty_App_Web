import { existsSync, readFileSync } from 'node:fs';
import { v7 as uuidv7 } from 'uuid';
import { HandleTelegramUpdateHandler } from '../application/features/handle-telegram-update/handle-telegram-update.handler.js';
import { loadEnv } from '../infrastructure/config/env.js';
import { SafetyInternalHttpClient } from '../infrastructure/http/safety-internal.http-client.js';
import { TelegramBotAdmin, TelegramBotGateway } from '../infrastructure/telegram/telegram-bot.gateway.js';

const USAGE = `Uso:
  npm run telegram:poll                      lê as mensagens do bot por polling (máquina local)
  npm run telegram:webhook -- set <url>      registra o webhook (nuvem); a URL leva o ?code=<function key>
  npm run telegram:webhook -- info           mostra o webhook atual
  npm run telegram:webhook -- delete         remove o webhook (necessário antes de usar o polling)`;

function fail(message: string): never {
  process.stderr.write(`\n${message}\n\n`);
  process.exit(1);
}

/** Na máquina local, as configurações ficam em `local.settings.json` (o mesmo arquivo do `func start`). */
function loadLocalSettings(file = 'local.settings.json'): void {
  if (!existsSync(file)) return;
  const values = (JSON.parse(readFileSync(file, 'utf8')) as { Values?: Record<string, string> }).Values ?? {};
  for (const [name, value] of Object.entries(values)) process.env[name] ??= value;
}

/** A URL sem o valor do `?code=`, para o log não guardar a function key. */
function redact(url: string): string {
  return url.replace(/([?&]code=)[^&]+/, '$1***');
}

async function poll(admin: TelegramBotAdmin, handler: HandleTelegramUpdateHandler): Promise<void> {
  const info = await admin.getWebhookInfo();
  if (info.url)
    fail('Este bot tem um webhook registrado. Use outro bot na máquina local, ou remova o webhook.');
  const me = await admin.getMe();
  process.stdout.write(`Lendo as mensagens de @${me.username} (Ctrl+C para parar).\n`);

  let offset = 0;
  let stopping = false;
  process.once('SIGINT', () => {
    stopping = true;
    process.stdout.write('\nParando...\n');
  });
  while (!stopping) {
    let updates;
    try {
      updates = await admin.getUpdates(offset, 25);
    } catch (error) {
      process.stderr.write(
        `${error instanceof Error ? error.message : 'Falha no getUpdates'}; nova tentativa em 5 s\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      const message = update.message;
      try {
        // O mesmo código do webhook. Só o resultado vai para a tela: nunca o texto nem o chat.
        const result = await handler.execute(
          message
            ? { text: message.text, chatId: String(message.chat.id), chatType: message.chat.type }
            : undefined,
          uuidv7(),
        );
        process.stdout.write(`update ${update.update_id}: ${result}\n`);
      } catch (error) {
        process.stderr.write(
          `update ${update.update_id}: falha (${error instanceof Error ? error.message : 'erro'})\n`,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  loadLocalSettings();
  const [command, action, argument] = process.argv.slice(2);
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (env.TELEGRAM_BOT_TOKEN === '') fail('Falta o TELEGRAM_BOT_TOKEN (crie o bot com o @BotFather).');
  const admin = new TelegramBotAdmin(env.TELEGRAM_BOT_TOKEN);

  if (command === 'poll') {
    const handler = new HandleTelegramUpdateHandler(
      new SafetyInternalHttpClient({
        baseUrl: env.SAFETY_SERVICE_URL,
        internalKey: env.INTERNAL_API_KEY,
        timeoutMs: env.SAFETY_TIMEOUT_MS,
      }),
      new TelegramBotGateway(env.TELEGRAM_BOT_TOKEN),
    );
    await poll(admin, handler);
    return;
  }
  if (command === 'webhook' && action === 'set') {
    if (!argument || !/^https:\/\//.test(argument)) fail('Informe a URL https do webhook.');
    if (env.TELEGRAM_WEBHOOK_SECRET.length < 16) {
      fail('Falta o TELEGRAM_WEBHOOK_SECRET (openssl rand -hex 32), o mesmo valor da Function App.');
    }
    await admin.setWebhook(argument, env.TELEGRAM_WEBHOOK_SECRET);
    process.stdout.write(`Webhook registrado: ${redact(argument)}\n`);
    return;
  }
  if (command === 'webhook' && action === 'info') {
    const info = await admin.getWebhookInfo();
    process.stdout.write(
      `Webhook: ${info.url ? redact(info.url) : '(nenhum)'} · pendentes: ${info.pending_update_count}` +
        `${info.last_error_message ? ` · último erro: ${info.last_error_message}` : ''}\n`,
    );
    return;
  }
  if (command === 'webhook' && action === 'delete') {
    await admin.deleteWebhook();
    process.stdout.write('Webhook removido.\n');
    return;
  }
  fail(USAGE);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
