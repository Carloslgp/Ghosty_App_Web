import { readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  DispatchAlertHandler,
  type HelpRequestTriggered,
} from '../../src/application/features/dispatch-alert/dispatch-alert.handler.js';
import document from '../../src/functions/openapi/functions.openapi.json' with { type: 'json' };
import {
  InvalidEventError,
  validateEvent,
  type EventName,
} from '../../src/infrastructure/events/event-validator.js';
import { FakePublisher, FakeSafety, FakeTelegram, FixedClock, SequentialIds } from '../support/fakes.js';

const DOCS = new URL('../../../ghosty-docs/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, DOCS), 'utf8');

const SCHEMA_BY_PREFIX: Record<string, EventName> = {
  'help-request-triggered': 'helpRequestTriggered',
  'check-in-deadline-scheduled': 'checkInDeadlineScheduled',
  'alert-dispatched': 'alertDispatched',
};

describe('Contrato dos eventos (AsyncAPI)', () => {
  const examples = readdirSync(new URL('asyncapi/examples/', DOCS)).filter((file) => file.endsWith('.json'));

  it.each(examples)('o exemplo %s passa no JSON Schema', (file) => {
    const prefix = Object.keys(SCHEMA_BY_PREFIX).find((key) => file.startsWith(key));
    expect(prefix, file).toBeDefined();
    const message = JSON.parse(read(`asyncapi/examples/${file}`)) as unknown;
    expect(() => validateEvent(SCHEMA_BY_PREFIX[prefix!]!, message)).not.toThrow();
  });

  it('as cópias dos schemas na Function são iguais às do ghosty-docs', () => {
    for (const file of readdirSync(new URL('asyncapi/schemas/', DOCS))) {
      const copy = readFileSync(
        new URL(`../../src/infrastructure/events/schemas/${file}`, import.meta.url),
        'utf8',
      );
      expect(JSON.parse(copy), file).toEqual(JSON.parse(read(`asyncapi/schemas/${file}`)));
    }
  });

  it('mensagens fora do schema são recusadas', () => {
    const valid = JSON.parse(read('asyncapi/examples/help-request-triggered.real.json')) as Record<
      string,
      unknown
    >;
    const data = valid.data as Record<string, unknown>;
    const broken = [
      { ...valid, type: 'outro.tipo' },
      { ...valid, extra: true },
      { ...valid, data: { ...data, mode: 'demo' } },
      { ...valid, data: { ...data, contacts: [{ contactId: 'x' }] } },
      // O evento nunca leva o destino de entrega (o chat do Telegram fica só no banco).
      { ...valid, data: { ...data, contacts: [{ ...(data.contacts as object[])[0], telegramChatId: '1' }] } },
    ];
    for (const message of broken) {
      expect(() => validateEvent('helpRequestTriggered', message)).toThrow(InvalidEventError);
    }
  });

  it('o AlertDispatched que a Function publica passa no schema (modo real, teste e sem contatos)', async () => {
    const event = JSON.parse(
      read('asyncapi/examples/help-request-triggered.real.json'),
    ) as HelpRequestTriggered;
    for (const [mode, targets] of [
      ['real', true],
      ['test', true],
      ['real', false],
    ] as const) {
      const safety = new FakeSafety();
      safety.targets = {
        helpRequestId: event.data.helpRequestId,
        accountId: event.data.accountId,
        mode,
        targets: targets
          ? [
              {
                contactId: event.data.contacts[0]!.contactId,
                nickname: 'Ana',
                position: 1,
                channel: 'telegram',
                telegramChatId: '42',
              },
            ]
          : [],
        recordedSteps: [],
      };
      const publisher = new FakePublisher();
      await new DispatchAlertHandler(
        safety,
        new FakeTelegram(),
        publisher,
        new FixedClock(),
        new SequentialIds(),
        {
          deliveryMode: 'telegram',
          timezone: 'America/Sao_Paulo',
          alertDispatchesQueue: 'alert-dispatches',
        },
      ).execute({ ...event, data: { ...event.data, mode } });
      expect(() => validateEvent('alertDispatched', publisher.published[0]?.envelope)).not.toThrow();
    }
  });
});

describe('Contrato HTTP', () => {
  it('o /api/openapi.json servido é o contrato do ghosty-docs', () => {
    expect(document).toEqual(parse(read('contracts/functions.openapi.yaml')));
  });
});
