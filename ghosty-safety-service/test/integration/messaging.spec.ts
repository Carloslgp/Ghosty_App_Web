import { QueueServiceClient } from '@azure/storage-queue';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StartCheckInHandler } from '../../src/application/features/check-ins/start-check-in/start-check-in.handler.js';
import { TriggerHelpRequestHandler } from '../../src/application/features/help-requests/trigger-help-request/trigger-help-request.handler.js';
import { RecordAlertDispatchHandler } from '../../src/application/features/help-requests/record-alert-dispatch/record-alert-dispatch.handler.js';
import { Account } from '../../src/domain/accounts/account.entity.js';
import { HelpRequest } from '../../src/domain/help-requests/help-request.entity.js';
import { validateEvent } from '../../src/infrastructure/events/event-validator.js';
import { AlertDispatchesConsumer } from '../../src/infrastructure/messaging/alert-dispatches.consumer.js';
import { OutboxDispatcher } from '../../src/infrastructure/messaging/outbox.dispatcher.js';
import {
  decodeMessage,
  encodeMessage,
  StorageQueues,
} from '../../src/infrastructure/messaging/storage-queue.publisher.js';
import { startAzurite, type Azurite } from '../support/azurite.js';
import { createSafetyKit, type SafetyKit } from '../support/safety-kit.js';

const ACCOUNT = '01a15965-b480-79af-a113-29b2fc82e5ef';
const silent = { warn: () => undefined };

/** Exemplo oficial do AsyncAPI (o mesmo que a Function usa nos testes de contrato). */
const exampleDispatch = JSON.parse(
  readFileSync(
    new URL('../../../ghosty-docs/asyncapi/examples/alert-dispatched.test.json', import.meta.url),
    'utf8',
  ),
) as { id: string; data: { helpRequestId: string; accountId: string } };

describe('Mensageria com o Azurite: o evento sai e o resultado volta', () => {
  let azurite: Azurite;
  let kit: SafetyKit;
  let queues: StorageQueues;
  let raw: QueueServiceClient;
  let run = 0;

  beforeAll(async () => {
    azurite = await startAzurite();
    raw = QueueServiceClient.fromConnectionString(azurite.connectionString);
  }, 60_000);

  afterAll(async () => {
    await azurite?.stop();
  });

  beforeEach(async () => {
    kit = await createSafetyKit();
    queues = new StorageQueues(azurite.connectionString);
    run += 1;
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

  const outboxMessage = (id: string, visibleAfter: Date | null = null) => ({
    id,
    type: 'ghosty.safety.help-request.triggered.v1',
    payload: JSON.stringify({ id, hello: 'fila' }),
    correlationId: 'corr-1',
    visibleAfter,
    createdAt: kit.clock.now(),
    publishedAt: null,
    attempts: 0,
  });

  it('o despachante publica em Base64 logo depois do commit e marca como publicada', async () => {
    const queueName = `help-requests-${run}`;
    const dispatcher = new OutboxDispatcher(kit.uow, queues, () => queueName, kit.clock, silent);
    kit.uow.onOutboxWritten(() => void dispatcher.trigger());

    await kit.repos(({ outbox }) => outbox.add(outboxMessage('01a1b2e9-6678-7296-a3b9-000000000001')));
    await dispatcher.trigger();

    const { receivedMessageItems } = await raw.getQueueClient(queueName).receiveMessages();
    expect(receivedMessageItems).toHaveLength(1);
    expect(JSON.parse(decodeMessage(receivedMessageItems[0]!.messageText))).toEqual({
      id: '01a1b2e9-6678-7296-a3b9-000000000001',
      hello: 'fila',
    });
    expect(await kit.repos(({ outbox }) => outbox.listPending(10))).toHaveLength(0);
  });

  it('o prazo do check-in deixa a mensagem invisível até a hora', async () => {
    const queueName = `check-in-deadlines-${run}`;
    const dispatcher = new OutboxDispatcher(kit.uow, queues, () => queueName, kit.clock, silent);
    await kit.repos(({ outbox }) =>
      outbox.add(
        outboxMessage('01a1b2e0-36e8-7202-98f4-000000000001', new Date(kit.clock.now().getTime() + 60_000)),
      ),
    );
    expect(await dispatcher.dispatchPending()).toBe(1);
    const peek = await raw.getQueueClient(queueName).peekMessages();
    expect(peek.peekedMessageItems).toHaveLength(0);
  });

  it('se a publicação falhar, o evento continua pendente e sai na próxima rodada', async () => {
    const queueName = `help-requests-falha-${run}`;
    let broken = true;
    const flaky = {
      publish: (queue: string, body: string, delay?: number) =>
        broken ? Promise.reject(new Error('fila fora do ar')) : queues.publish(queue, body, delay),
    } as unknown as StorageQueues;
    const dispatcher = new OutboxDispatcher(kit.uow, flaky, () => queueName, kit.clock, silent);
    await kit.repos(({ outbox }) => outbox.add(outboxMessage('01a1b2e9-6678-7296-a3b9-000000000009')));

    expect(await dispatcher.dispatchPending()).toBe(0);
    const [pending] = await kit.repos(({ outbox }) => outbox.listPending(10));
    expect(pending).toMatchObject({ attempts: 1, publishedAt: null });

    broken = false;
    expect(await dispatcher.dispatchPending()).toBe(1);
    expect(await kit.repos(({ outbox }) => outbox.listPending(10))).toHaveLength(0);
  });

  it('o consumidor grava a linha do tempo do AlertDispatched e ignora a mesma mensagem repetida', async () => {
    const queueName = `alert-dispatches-${run}`;
    const request = HelpRequest.trigger({
      id: exampleDispatch.data.helpRequestId,
      accountId: exampleDispatch.data.accountId,
      origin: 'button',
      mode: 'test',
      location: null,
      checkInId: null,
      now: kit.clock.now(),
    });
    await kit.repos(({ helpRequests }) => helpRequests.insert(request));

    const record = new RecordAlertDispatchHandler(kit.uow, kit.clock, kit.ids);
    const consumer = new AlertDispatchesConsumer(queues, (event) => record.execute(event), silent, {
      queueName,
    });
    const body = encodeMessage(JSON.stringify(exampleDispatch));
    const queue = raw.getQueueClient(queueName);
    await queue.createIfNotExists();
    await queue.sendMessage(body);
    await queue.sendMessage(body); // reprocessamento: a mesma mensagem duas vezes

    expect(await consumer.poll()).toBe(2);
    const steps = await kit.repos(({ helpRequests }) => helpRequests.listSteps(request.id));
    expect(steps.map((step) => step.outcome)).toEqual(['would_send', 'would_send']);
    const stored = await kit.repos(({ helpRequests }) => helpRequests.findById(request.id));
    expect(stored?.status).toBe('dispatched');
    expect((await queue.peekMessages()).peekedMessageItems).toHaveLength(0);
  });

  it('de ponta a ponta: o pedido de ajuda e o prazo do check-in saem do outbox para as filas certas', async () => {
    const helpQueue = `help-requests-fluxo-${run}`;
    const deadlineQueue = `check-in-deadlines-fluxo-${run}`;
    const dispatcher = new OutboxDispatcher(
      kit.uow,
      queues,
      (type) => (type.includes('help-request') ? helpQueue : deadlineQueue),
      kit.clock,
      silent,
    );

    const request = await new TriggerHelpRequestHandler(
      kit.uow,
      kit.tokens,
      kit.clock,
      kit.ids,
      kit.config,
    ).execute({
      accountId: ACCOUNT,
      mode: 'test',
      location: null,
      idempotencyKey: 'chave-fluxo-1',
      correlationId: 'corr-fluxo',
    });
    await new StartCheckInHandler(kit.uow, kit.tokens, kit.clock, kit.ids).execute({
      accountId: ACCOUNT,
      destination: 'Casa',
      dueAt: new Date(kit.clock.now().getTime() + 30 * 60_000),
      mode: 'real',
      idempotencyKey: 'chave-fluxo-2',
      correlationId: 'corr-fluxo',
    });
    expect(await dispatcher.dispatchPending()).toBe(2);

    const { receivedMessageItems } = await raw.getQueueClient(helpQueue).receiveMessages();
    expect(receivedMessageItems).toHaveLength(1);
    const event = validateEvent<{ correlationId: string; data: { helpRequestId: string } }>(
      'helpRequestTriggered',
      JSON.parse(decodeMessage(receivedMessageItems[0]!.messageText)),
    );
    expect(event).toMatchObject({ correlationId: 'corr-fluxo', data: { helpRequestId: request.id } });

    // O prazo já está na fila, mas invisível até dueAt + tolerância.
    const deadlines = raw.getQueueClient(deadlineQueue);
    expect((await deadlines.peekMessages()).peekedMessageItems).toHaveLength(0);
    expect((await deadlines.getProperties()).approximateMessagesCount).toBe(1);
  });

  it('mensagem fora do formato vai para a fila poison', async () => {
    const queueName = `alert-dispatches-ruim-${run}`;
    const consumer = new AlertDispatchesConsumer(queues, () => Promise.resolve(), silent, { queueName });
    const queue = raw.getQueueClient(queueName);
    await queue.createIfNotExists();
    await queue.sendMessage(encodeMessage('{"type":"outro"}'));
    expect(await consumer.poll()).toBe(1);
    const poison = await raw.getQueueClient(`${queueName}-poison`).peekMessages();
    expect(poison.peekedMessageItems).toHaveLength(1);
  });
});
