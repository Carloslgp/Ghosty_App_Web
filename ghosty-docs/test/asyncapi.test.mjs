// Contrato dos eventos: o AsyncAPI é válido, e cada exemplo bate com o JSON Schema da mensagem.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser, fromFile } from '@asyncapi/parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asyncapiDir = path.join(root, 'asyncapi');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Cada exemplo começa com o nome do schema: `alert-dispatched.real.json` → `alert-dispatched.v1`. */
const SCHEMAS = {
  'help-request-triggered': 'help-request-triggered.v1.schema.json',
  'check-in-deadline-scheduled': 'check-in-deadline-scheduled.v1.schema.json',
  'alert-dispatched': 'alert-dispatched.v1.schema.json',
};

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validators = Object.fromEntries(
  Object.entries(SCHEMAS).map(([name, file]) => [
    name,
    ajv.compile(readJson(path.join(asyncapiDir, 'schemas', file))),
  ]),
);

const exampleFiles = readdirSync(path.join(asyncapiDir, 'examples')).filter((file) => file.endsWith('.json'));
const schemaNameOf = (file) => Object.keys(SCHEMAS).find((name) => file.startsWith(`${name}.`));
const example = (file) => readJson(path.join(asyncapiDir, 'examples', file));
const errorsOf = (validate) => ajv.errorsText(validate.errors, { separator: '\n' });

describe('AsyncAPI', () => {
  let document;
  let diagnostics;

  beforeAll(async () => {
    const parser = new Parser();
    ({ document, diagnostics } = await fromFile(parser, path.join(asyncapiDir, 'asyncapi.yaml')).parse());
  });

  it('é um documento válido, sem erros nem avisos', () => {
    // Severidade: 0 = erro, 1 = aviso, 2 = informação, 3 = dica.
    const problems = diagnostics.filter((d) => d.severity <= 1).map((d) => `${d.code}: ${d.message}`);
    expect(problems).toEqual([]);
    expect(document).toBeDefined();
  });

  it('descreve as 3 filas e as 3 mensagens', () => {
    const addresses = document
      .channels()
      .all()
      .map((channel) => channel.address());
    expect(addresses.sort()).toEqual(['alert-dispatches', 'check-in-deadlines', 'help-requests']);
    expect(
      document
        .allMessages()
        .all()
        .map((message) => message.name())
        .sort(),
    ).toEqual(['AlertDispatched', 'CheckInDeadlineScheduled', 'HelpRequestTriggered']);
  });

  it('cada canal tem quem publica e quem consome', () => {
    for (const channel of document.channels().all()) {
      const actions = channel
        .operations()
        .all()
        .map((operation) => operation.action())
        .sort();
      expect(actions, channel.address()).toEqual(['receive', 'send']);
    }
  });

  it('todo arquivo de exemplo aparece no documento', () => {
    const referenced = document
      .allMessages()
      .all()
      .flatMap((message) =>
        message
          .examples()
          .all()
          .map((ex) => ex.payload().id),
      );
    expect(referenced.sort()).toEqual(exampleFiles.map((file) => example(file).id).sort());
  });
});

describe('Exemplos de eventos', () => {
  it.each(exampleFiles)('%s segue o schema', (file) => {
    const name = schemaNameOf(file);
    expect(name, `sem schema para ${file}`).toBeDefined();
    const validate = validators[name];
    const valid = validate(example(file));
    expect(valid, errorsOf(validate)).toBe(true);
  });

  it('os ids dos eventos de exemplo são únicos', () => {
    const ids = exampleFiles.map((file) => example(file).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('os 3 schemas usam o mesmo envelope', () => {
    const envelopes = Object.values(SCHEMAS).map((file) => {
      const schema = readJson(path.join(asyncapiDir, 'schemas', file));
      const { specversion, id, time, correlationId } = schema.properties;
      return {
        required: schema.required,
        specversion,
        id,
        time,
        correlationId,
        uuid: schema.definitions.uuid,
      };
    });
    for (const envelope of envelopes.slice(1)) expect(envelope).toEqual(envelopes[0]);
  });
});

describe('Mensagens fora do contrato são recusadas', () => {
  const triggered = () => example('help-request-triggered.real.json');
  const dispatched = () => example('alert-dispatched.real.json');

  it('o pedido de ajuda não pode levar o chat do Telegram (minimização de dados)', () => {
    const message = triggered();
    message.data.contacts[0].telegramChatId = '5123456789';
    expect(validators['help-request-triggered'](message)).toBe(false);
  });

  it('o type precisa ser o da mensagem', () => {
    const message = triggered();
    message.type = 'ghosty.functions.alert.dispatched.v1';
    expect(validators['help-request-triggered'](message)).toBe(false);
  });

  it('o correlationId é obrigatório', () => {
    const message = triggered();
    delete message.correlationId;
    expect(validators['help-request-triggered'](message)).toBe(false);
  });

  it('o id do evento precisa ser um UUID', () => {
    const message = triggered();
    message.id = 'h1';
    expect(validators['help-request-triggered'](message)).toBe(false);
  });

  it('um resultado de envio desconhecido é recusado', () => {
    const message = dispatched();
    message.data.steps[0].outcome = 'delivered';
    expect(validators['alert-dispatched'](message)).toBe(false);
  });

  it('o prazo do check-in exige a version', () => {
    const message = example('check-in-deadline-scheduled.json');
    delete message.data.version;
    expect(validators['check-in-deadline-scheduled'](message)).toBe(false);
  });
});
