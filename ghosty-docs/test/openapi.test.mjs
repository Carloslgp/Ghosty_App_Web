// Convenções que o lint do Redocly não cobre: erros em Problem Details com o `code` certo,
// Location nas criações, rotas públicas explícitas e IDs no formato combinado.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS = ['bff', 'notes-service', 'safety-service', 'functions'];
const METHODS = ['get', 'put', 'post', 'delete', 'patch'];

/** Catálogo de códigos de erro e o status HTTP de cada um (contracts/README.md). */
const PROBLEM_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVALID_STATE: 409,
  EMAIL_IN_USE: 409,
  INVITATION_EXPIRED: 410,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_UNAVAILABLE: 503,
};

/** Rotas sem autenticação de cada contrato (o resto herda a segurança global). */
const PUBLIC_OPERATIONS = {
  'notes-service': ['GET /health'],
  'safety-service': ['GET /health'],
  functions: ['GET /api/openapi.json', 'GET /api/docs'],
  bff: [
    'GET /health',
    'POST /auth/register',
    'POST /auth/login',
    'POST /auth/refresh',
    'POST /auth/logout',
    'GET /.well-known/openid-configuration',
    'GET /.well-known/jwks.json',
    'GET /invitations/{token}',
    'POST /invitations/{token}/accept',
    'POST /invitations/{token}/decline',
    'GET /invitations/{token}/alerts',
  ],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function load(name) {
  return parse(readFileSync(path.join(root, 'contracts', `${name}.openapi.yaml`), 'utf8'));
}

function resolve(doc, node) {
  let current = node;
  while (current && typeof current === 'object' && typeof current.$ref === 'string') {
    current = current.$ref
      .slice(2)
      .split('/')
      .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
      .reduce((value, key) => value?.[key], doc);
  }
  return current;
}

function operations(doc) {
  return Object.entries(doc.paths).flatMap(([route, item]) =>
    METHODS.filter((method) => item[method]).map((method) => ({
      id: `${method.toUpperCase()} ${route}`,
      route,
      operation: item[method],
      responses: Object.entries(item[method].responses).map(([status, response]) => [
        status,
        resolve(doc, response),
      ]),
    })),
  );
}

function exampleValues(doc, media) {
  const values = [];
  if (media.example !== undefined) values.push(media.example);
  for (const example of Object.values(media.examples ?? {})) values.push(resolve(doc, example).value);
  return values;
}

function collectStrings(value, found = []) {
  if (typeof value === 'string') found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, found));
  else if (value && typeof value === 'object')
    Object.values(value).forEach((item) => collectStrings(item, found));
  return found;
}

describe.each(CONTRACTS)('Contrato %s', (name) => {
  const file = path.join(root, 'contracts', `${name}.openapi.yaml`);

  it('existe e usa OpenAPI 3.0.3 (o formato gerado pelo @nestjs/swagger)', () => {
    expect(existsSync(file)).toBe(true);
    expect(load(name).openapi).toBe('3.0.3');
  });

  if (!existsSync(file)) return;
  const doc = load(name);
  const ops = operations(doc);

  it('erros usam só application/problem+json', () => {
    const wrong = ops.flatMap(({ id, responses }) =>
      responses
        .filter(([status, response]) => Number(status) >= 400 && response.content)
        .filter(([, response]) =>
          Object.keys(response.content).some((type) => type !== 'application/problem+json'),
        )
        .map(([status]) => `${id} → ${status}`),
    );
    expect(wrong).toEqual([]);
  });

  it('o status e o code dos exemplos de erro batem com a resposta', () => {
    const allowed = resolve(doc, doc.components.schemas.ProblemDetails).properties.code.enum;
    const wrong = [];
    for (const { id, responses } of ops) {
      for (const [status, response] of responses) {
        const media = response.content?.['application/problem+json'];
        if (!media) continue;
        for (const value of exampleValues(doc, media)) {
          if (value.status !== Number(status)) wrong.push(`${id} → ${status}: status ${value.status}`);
          if (PROBLEM_CODES[value.code] !== Number(status))
            wrong.push(`${id} → ${status}: code ${value.code}`);
          if (!allowed.includes(value.code)) wrong.push(`${id} → ${status}: ${value.code} fora do enum`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('o enum de code do ProblemDetails só usa códigos do catálogo', () => {
    const codes = resolve(doc, doc.components.schemas.ProblemDetails).properties.code.enum;
    expect(codes.filter((code) => !(code in PROBLEM_CODES))).toEqual([]);
  });

  it('criações (201) e pedidos assíncronos (202) devolvem Location', () => {
    const missing = ops.flatMap(({ id, responses }) =>
      responses
        .filter(([status, response]) => ['201', '202'].includes(status) && !response.headers?.Location)
        .map(([status]) => `${id} → ${status}`),
    );
    expect(missing).toEqual([]);
  });

  it('só as rotas públicas combinadas ficam sem autenticação', () => {
    const open = ops.filter(
      ({ operation }) => Array.isArray(operation.security) && operation.security.length === 0,
    );
    expect(open.map(({ id }) => id).sort()).toEqual([...PUBLIC_OPERATIONS[name]].sort());
  });

  it('os UUIDs dos exemplos são v7', () => {
    const strings = [];
    for (const { operation, responses } of ops) {
      const request = resolve(doc, operation.requestBody);
      for (const media of Object.values(request?.content ?? {}))
        strings.push(...collectStrings(exampleValues(doc, media)));
      for (const [, response] of responses) {
        for (const media of Object.values(response.content ?? {}))
          strings.push(...collectStrings(exampleValues(doc, media)));
      }
    }
    const notV7 = [...new Set(strings.filter((value) => UUID.test(value) && value[14] !== '7'))];
    expect(notV7).toEqual([]);
  });
});
