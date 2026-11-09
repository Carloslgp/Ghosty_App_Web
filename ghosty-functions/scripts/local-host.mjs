// Host local mínimo das Functions, para os testes de ponta a ponta sem o Azure Functions Core Tools:
// as funções HTTP na porta 7071 e o polling das filas no Azurite, chamando o mesmo código compilado
// (`dist/`) que vai para a Azure. Para desenvolver, prefira o `npm start` (func start).
//
//   npm run build && node scripts/local-host.mjs
//
// Usa as mesmas configurações da Function App (SAFETY_SERVICE_URL, INTERNAL_API_KEY, QueueConnection,
// DELIVERY_MODE, TELEGRAM_*): as do ambiente e, se existir, as do local.settings.json (sem sobrescrever).
import azModule from '@azure/functions';
import { QueueServiceClient } from '@azure/storage-queue';
import { existsSync, readFileSync } from 'node:fs';
import http from 'node:http';

const settingsFile = new URL('../local.settings.json', import.meta.url);
if (existsSync(settingsFile)) {
  const values = JSON.parse(readFileSync(settingsFile, 'utf8')).Values ?? {};
  for (const [name, value] of Object.entries(values)) process.env[name] ??= value;
}

const az = azModule.HttpRequest ? azModule : azModule.default;
const PORT = Number(process.env.FUNCTIONS_PORT ?? 7071);
const mod = (p) => import(new URL(`../dist/api/${p}`, import.meta.url).href);
const { readiness } = await mod('readiness.js');
const { messagePreview } = await mod('message-preview.js');
const { telegramWebhook } = await mod('telegram-webhook.js');
const { dispatchAlert, checkInDeadline, guard } = await mod('queues.js');

const routes = {
  '/api/readiness': readiness,
  '/api/message-preview': messagePreview,
  '/api/telegram/webhook': telegramWebhook,
};
const ctx = (name, meta = {}) => {
  const c = new az.InvocationContext({
    invocationId: String(Date.now()),
    functionName: name,
    triggerMetadata: meta,
  });
  c.log = (...a) => process.stdout.write(`[${name}] ${a.join(' ')}\n`);
  c.error = (...a) => process.stderr.write(`[${name}] ${a.join(' ')}\n`);
  return c;
};

http
  .createServer((r, res) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', async () => {
      const path = r.url.split('?')[0];
      const handler = routes[path];
      if (!handler || r.method !== 'POST') return res.writeHead(404).end();
      const headers = Object.fromEntries(
        Object.entries(r.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]),
      );
      const request = new az.HttpRequest({
        method: r.method,
        url: `http://localhost:${PORT}${r.url}`,
        headers,
        body: { string: Buffer.concat(chunks).toString('utf8') },
      });
      const out = await handler(request, ctx(path));
      const body = out.jsonBody !== undefined ? JSON.stringify(out.jsonBody) : (out.body ?? '');
      res
        .writeHead(out.status ?? 200, { 'Content-Type': 'application/json', ...(out.headers ?? {}) })
        .end(body);
    });
  })
  .listen(PORT, () => process.stdout.write(`host local das Functions na porta ${PORT}\n`));

const service = QueueServiceClient.fromConnectionString(
  process.env.QueueConnection ?? 'UseDevelopmentStorage=true',
);
const queues = [
  ['help-requests', guard('dispatch-alert', 'help-requests', dispatchAlert)],
  ['check-in-deadlines', guard('check-in-deadline', 'check-in-deadlines', checkInDeadline)],
];
for (const [name] of queues) await service.getQueueClient(name).createIfNotExists();
setInterval(async () => {
  for (const [name, handler] of queues) {
    const q = service.getQueueClient(name);
    const { receivedMessageItems } = await q.receiveMessages({ numberOfMessages: 8, visibilityTimeout: 30 });
    for (const m of receivedMessageItems) {
      const text = Buffer.from(m.messageText, 'base64').toString('utf8');
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        message = text;
      }
      try {
        await handler(message, ctx(name, { dequeueCount: m.dequeueCount }));
        await q.deleteMessage(m.messageId, m.popReceipt);
      } catch (e) {
        // Como no host de verdade: a mensagem volta a ficar visível e é tentada de novo.
        process.stderr.write(`[${name}] falhou, volta para a fila: ${e.message}\n`);
      }
    }
  }
}, 1000);
