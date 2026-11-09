import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  InvalidEventError,
  validateEvent,
  type EventName,
} from '../../src/infrastructure/events/event-validator.js';
import { parseAlertDispatched } from '../../src/infrastructure/messaging/alert-dispatches.consumer.js';
import { encodeMessage } from '../../src/infrastructure/messaging/storage-queue.publisher.js';

const DOCS = new URL('../../../ghosty-docs/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, DOCS), 'utf8');
const BY_PREFIX: Record<string, EventName> = {
  'help-request-triggered': 'helpRequestTriggered',
  'check-in-deadline-scheduled': 'checkInDeadlineScheduled',
  'alert-dispatched': 'alertDispatched',
};

describe('Contrato dos eventos (AsyncAPI) no safety-service', () => {
  const examples = readdirSync(new URL('asyncapi/examples/', DOCS)).filter((file) => file.endsWith('.json'));

  it.each(examples)('o exemplo %s passa no JSON Schema', (file) => {
    const prefix = Object.keys(BY_PREFIX).find((key) => file.startsWith(key));
    expect(() =>
      validateEvent(BY_PREFIX[prefix!]!, JSON.parse(read(`asyncapi/examples/${file}`))),
    ).not.toThrow();
  });

  it('as cópias dos schemas são iguais às do ghosty-docs', () => {
    for (const file of readdirSync(new URL('asyncapi/schemas/', DOCS))) {
      const copy = readFileSync(
        new URL(`../../src/infrastructure/events/schemas/${file}`, import.meta.url),
        'utf8',
      );
      expect(JSON.parse(copy), file).toEqual(JSON.parse(read(`asyncapi/schemas/${file}`)));
    }
  });

  it('o consumidor recusa um AlertDispatched fora do schema', () => {
    const valid = JSON.parse(read('asyncapi/examples/alert-dispatched.real.json')) as Record<string, unknown>;
    expect(parseAlertDispatched(encodeMessage(JSON.stringify(valid))).id).toBe(valid.id);
    const data = valid.data as Record<string, unknown>;
    for (const broken of [
      { ...valid, source: 'outro' },
      { ...valid, data: { ...data, status: 'quase' } },
      { ...valid, data: { ...data, steps: [] } },
    ]) {
      expect(() => parseAlertDispatched(encodeMessage(JSON.stringify(broken)))).toThrow(InvalidEventError);
    }
  });
});
