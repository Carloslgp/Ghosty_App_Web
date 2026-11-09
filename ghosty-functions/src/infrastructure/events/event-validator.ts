// Validação dos eventos contra os JSON Schemas do AsyncAPI (ajv), igual em quem publica e em quem consome.
// O original fica em config/events/, na raiz do repositório. A Function e o safety-service recebem uma
// cópia idêntica em src/infrastructure/events/. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { Ajv, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';
import alertDispatched from './schemas/alert-dispatched.v1.schema.json' with { type: 'json' };
import checkInDeadlineScheduled from './schemas/check-in-deadline-scheduled.v1.schema.json' with { type: 'json' };
import helpRequestTriggered from './schemas/help-request-triggered.v1.schema.json' with { type: 'json' };

// O pacote ajv-formats exporta a função como `default` num módulo CommonJS.
const addFormats = addFormatsModule as unknown as (ajv: Ajv) => Ajv;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators = {
  helpRequestTriggered: ajv.compile(helpRequestTriggered),
  checkInDeadlineScheduled: ajv.compile(checkInDeadlineScheduled),
  alertDispatched: ajv.compile(alertDispatched),
} satisfies Record<string, ValidateFunction>;

export type EventName = keyof typeof validators;

/** Mensagem fora do JSON Schema do AsyncAPI: não adianta tentar de novo. */
export class InvalidEventError extends Error {
  constructor(
    readonly event: EventName,
    readonly problems: string[],
  ) {
    super(`Mensagem ${event} fora do schema: ${problems.join('; ')}`);
    this.name = 'InvalidEventError';
  }
}

/** Confere a mensagem contra o JSON Schema do AsyncAPI e devolve o objeto tipado. */
export function validateEvent<T>(event: EventName, message: unknown): T {
  const validate = validators[event];
  if (validate(message)) return message as T;
  const problems = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`.trim());
  throw new InvalidEventError(event, problems);
}

/** A fila entrega o corpo já decodificado do Base64; pode vir como texto ou como objeto. */
export function parseQueueMessage(message: unknown): unknown {
  if (typeof message === 'string') return JSON.parse(message) as unknown;
  return message;
}
