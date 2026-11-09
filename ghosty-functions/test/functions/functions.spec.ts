import { HttpRequest, InvocationContext } from '@azure/functions';
import { QueueServiceClient } from '@azure/storage-queue';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { messagePreview } from '../../src/functions/message-preview.js';
import { openApiJson, swaggerUi } from '../../src/functions/openapi.js';
import { guard } from '../../src/functions/queues.js';
import { readiness } from '../../src/functions/readiness.js';
import { validateEvent } from '../../src/infrastructure/events/event-validator.js';
import { StorageQueuePublisher } from '../../src/infrastructure/messaging/storage-queue.publisher.js';
import { startAzurite, type Azurite } from '../support/azurite.js';

const context = () => new InvocationContext({ invocationId: 'teste', functionName: 'teste' });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new HttpRequest({
    method: 'POST',
    url: `http://localhost:7071/api/${path}`,
    headers: { 'content-type': 'application/json', ...headers },
    body: { string: typeof body === 'string' ? body : JSON.stringify(body) },
  });

describe('Funções HTTP', () => {
  it('readiness: 200 com a pontuação e o X-Correlation-Id', async () => {
    const res = await readiness(
      post(
        'readiness',
        {
          notes: { updatedLast14Days: 5 },
          safety: {
            displayName: 'Maria',
            totalContacts: 1,
            confirmedContacts: 1,
            firstConfirmedNickname: 'Ana',
            messageTemplate: 'Oi, {apelido}.',
            messageReviewed: true,
            includeLocation: true,
            secretCodeSet: true,
            lastTestAt: null,
          },
          geoPermission: 'granted',
        },
        { 'x-correlation-id': 'corr-1' },
      ),
      context(),
    );
    expect(res.status).toBe(200);
    expect((res.headers as Record<string, string>)['X-Correlation-Id']).toBe('corr-1');
    expect(res.jsonBody).toMatchObject({ score: 70, level: 'almost', messagePreview: { text: 'Oi, Ana.' } });
  });

  it('readiness: corpo inválido dá 400 em Problem Details, com os campos', async () => {
    const res = await readiness(post('readiness', { notes: null, geoPermission: 'talvez' }), context());
    expect(res.status).toBe(400);
    expect((res.headers as Record<string, string>)['Content-Type']).toBe('application/problem+json');
    const body = res.jsonBody as { code: string; errors: { field: string }[]; instance: string };
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.instance).toBe('/api/readiness');
    expect(body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['safety', 'geoPermission']));
    const notJson = await readiness(post('readiness', '{"oi'), context());
    expect(notJson.status).toBe(400);
  });

  it('message-preview: 200 mesmo acima do limite (withinLimit false); fuso desconhecido dá 400', async () => {
    const ok = await messagePreview(
      post('message-preview', { template: 'x'.repeat(4096), displayName: 'Maria', contactNickname: 'Ana' }),
      context(),
    );
    expect(ok.status).toBe(200);
    expect(ok.jsonBody).toMatchObject({ characters: 4096, withinLimit: true });
    const over = await messagePreview(
      post('message-preview', {
        template: `${'x'.repeat(4090)}{nome}`,
        displayName: 'Maria Exemplo',
        contactNickname: 'Ana',
      }),
      context(),
    );
    expect(over.jsonBody).toMatchObject({ withinLimit: false });
    const bad = await messagePreview(
      post('message-preview', {
        template: 'oi',
        displayName: 'Maria',
        contactNickname: 'Ana',
        timezone: 'Marte/Base',
      }),
      context(),
    );
    expect(bad.status).toBe(400);
  });

  it('openapi.json e a página do Swagger UI', () => {
    expect((openApiJson().jsonBody as { info: { title: string } }).info.title).toBeDefined();
    const page = swaggerUi();
    expect(page.body).toContain('swagger-ui-dist@5.34.1');
    expect(page.body).toContain("url: 'openapi.json'");
  });
});

describe('Gatilhos de fila com o Azurite', () => {
  let azurite: Azurite;

  beforeAll(async () => {
    azurite = await startAzurite();
    vi.stubEnv('QueueConnection', azurite.connectionString);
    vi.stubEnv('INTERNAL_API_KEY', 'dev-internal-key');
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await azurite?.stop();
  });

  it('o publicador grava em Base64 um AlertDispatched que passa no schema', async () => {
    const example = JSON.parse(
      readFileSync(
        new URL('../../../ghosty-docs/asyncapi/examples/alert-dispatched.real.json', import.meta.url),
        'utf8',
      ),
    ) as object;
    await new StorageQueuePublisher(azurite.connectionString).publish('alert-dispatches', example);
    const queue = QueueServiceClient.fromConnectionString(azurite.connectionString).getQueueClient(
      'alert-dispatches',
    );
    const [message] = (await queue.receiveMessages()).receivedMessageItems;
    const decoded = JSON.parse(Buffer.from(message!.messageText, 'base64').toString('utf8')) as unknown;
    expect(() => validateEvent('alertDispatched', decoded)).not.toThrow();
  });

  it('mensagem fora do schema vai para a fila -poison; erro passageiro relança para o host tentar de novo', async () => {
    const handler = guard('dispatch-alert', 'help-requests', async () => {
      validateEvent('helpRequestTriggered', { type: 'errado' });
    });
    await handler({ type: 'errado' }, context());
    const poison = QueueServiceClient.fromConnectionString(azurite.connectionString).getQueueClient(
      'help-requests-poison',
    );
    const { peekedMessageItems } = await poison.peekMessages();
    expect(peekedMessageItems).toHaveLength(1);

    const failing = guard('dispatch-alert', 'help-requests', () =>
      Promise.reject(new Error('safety-service fora do ar')),
    );
    await expect(failing({}, context())).rejects.toThrow('fora do ar');
  });
});
