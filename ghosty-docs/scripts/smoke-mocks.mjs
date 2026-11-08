#!/usr/bin/env node
// Teste de fumaça dos mocks: sobe os 4 mocks do Prism, faz chamadas reais e derruba tudo no fim.
// Uso: npm run test:mocks
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const prismBin = path.join(
  path.dirname(require.resolve('@stoplight/prism-cli/package.json')),
  'dist',
  'index.js',
);

const MOCKS = [
  { name: 'bff', port: 4010, contract: 'bff', ready: '/health' },
  { name: 'notes', port: 4011, contract: 'notes-service', ready: '/health' },
  { name: 'safety', port: 4012, contract: 'safety-service', ready: '/health' },
  { name: 'functions', port: 4013, contract: 'functions', ready: '/api/openapi.json' },
];

const USER = '01a15965-b480-79af-a113-29b2fc82e5ef';
const INVITE = 'jKotp-mc9i8mlKGKyexO0wc181jY4RIorNnJu-kXiag';
const BEARER = { Authorization: 'Bearer eyJhbGciOiJSUzI1NiJ9.e30.c2ln' };
const SAFETY = { ...BEARER, 'X-Safety-Token': 'eyJhbGciOiJSUzI1NiJ9.e30.c2ln' };
const INTERNAL = { 'X-Internal-Key': 'dev-internal-key', 'X-User-Id': USER };
const JSON_BODY = { 'Content-Type': 'application/json' };

/** [mock, método, caminho, cabeçalhos, corpo, status esperado, conferência opcional do corpo] */
const CHECKS = [
  ['bff', 'GET', '/health', {}, undefined, 200],
  [
    'bff',
    'POST',
    '/auth/login',
    JSON_BODY,
    { email: 'maria.exemplo@example.com', password: 'x' },
    200,
    (b) => b.tokenType === 'Bearer',
  ],
  ['bff', 'GET', '/notes', {}, undefined, 401],
  ['bff', 'GET', '/notes', BEARER, undefined, 200, (b) => Array.isArray(b.items) && b.items.length > 0],
  [
    'bff',
    'POST',
    '/safety/session',
    { ...BEARER, ...JSON_BODY },
    { code: '482915' },
    200,
    (b) => b.remoteUrl.endsWith('/remoteEntry.js'),
  ],
  ['bff', 'GET', '/aggregated-data?geo=granted', BEARER, undefined, 401],
  ['bff', 'GET', '/aggregated-data?geo=granted', SAFETY, undefined, 200, (b) => b.sources.notes === 'ok'],
  [
    'bff',
    'GET',
    '/aggregated-data',
    { ...SAFETY, Prefer: 'example=notesUnavailable' },
    undefined,
    200,
    (b) => b.facade === null && b.sources.notes === 'unavailable',
  ],
  [
    'bff',
    'POST',
    '/safety/help-requests',
    { ...SAFETY, ...JSON_BODY, 'Idempotency-Key': 'teste-de-fumaca-1' },
    { mode: 'test' },
    202,
    (b) => b.status === 'triggered',
  ],
  ['bff', 'GET', `/invitations/${INVITE}`, {}, undefined, 200, (b) => b.respondable === true],
  [
    'bff',
    'GET',
    '/notes',
    { ...BEARER, Prefer: 'code=503' },
    undefined,
    503,
    (b) => b.code === 'UPSTREAM_UNAVAILABLE',
  ],
  ['notes', 'GET', '/notes', {}, undefined, 401],
  ['notes', 'GET', '/notes', { ...INTERNAL, 'X-User-Id': 'nao-e-uuid' }, undefined, 400],
  ['notes', 'GET', '/notes?pageSize=500', INTERNAL, undefined, 400],
  [
    'notes',
    'GET',
    '/notes/summary',
    INTERNAL,
    undefined,
    200,
    (b) => typeof b.updatedLast14Days === 'number',
  ],
  ['safety', 'GET', '/summary', INTERNAL, undefined, 200, (b) => b.network.confirmed === 2],
  [
    'safety',
    'GET',
    `/internal/help-requests/01a1b2e9-6678-7ead-96cd-77eeda864fb3/delivery-targets`,
    INTERNAL,
    undefined,
    200,
    (b) => b.targets[0].telegramChatId === '5123456789',
  ],
  [
    'functions',
    'POST',
    '/api/readiness',
    { 'x-functions-key': 'dev', ...JSON_BODY },
    readinessBody(),
    200,
    (b) => b.level === 'ready',
  ],
  [
    'functions',
    'POST',
    '/api/message-preview',
    { ...JSON_BODY },
    { template: 'Oi', displayName: 'Maria', contactNickname: 'Ana' },
    401,
  ],
];

function readinessBody() {
  return {
    notes: { updatedLast14Days: 5 },
    safety: {
      displayName: 'Maria',
      totalContacts: 3,
      confirmedContacts: 2,
      firstConfirmedNickname: 'Ana',
      messageTemplate: 'Oi, {apelido}.',
      messageReviewed: true,
      includeLocation: true,
      secretCodeSet: true,
      lastTestAt: '2026-11-03T22:02:00Z',
    },
    geoPermission: 'granted',
  };
}

const children = [];

function start(mock) {
  const contract = path.join(root, 'contracts', `${mock.contract}.openapi.yaml`);
  const child = spawn(
    process.execPath,
    [prismBin, 'mock', contract, '--port', String(mock.port), '--errors'],
    {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  children.push({ mock, child, output: () => output });
}

async function waitReady(mock, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${mock.port}${mock.ready}`);
      if (response.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`O mock ${mock.name} não subiu na porta ${mock.port}`);
}

async function run() {
  MOCKS.forEach(start);
  await Promise.all(MOCKS.map((mock) => waitReady(mock)));
  console.log(`Mocks no ar: ${MOCKS.map((m) => `${m.name}:${m.port}`).join(', ')}`);

  let failures = 0;
  for (const [name, method, route, headers, body, expected, check] of CHECKS) {
    const { port } = MOCKS.find((mock) => mock.name === name);
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let ok = response.status === expected;
    if (ok && check) {
      try {
        ok = Boolean(check(JSON.parse(text)));
      } catch {
        ok = false;
      }
    }
    console.log(
      `${ok ? 'ok   ' : 'FALHA'} ${name.padEnd(9)} ${method.padEnd(5)} ${route} → ${response.status}`,
    );
    if (!ok) {
      failures += 1;
      console.log(`      esperado ${expected}; corpo: ${text.slice(0, 300)}`);
    }
  }

  // CORS: o front em :5173 consegue chamar o mock do BFF.
  const preflight = await fetch('http://127.0.0.1:4010/notes', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  const cors = preflight.headers.get('access-control-allow-origin');
  const corsOk = cors === '*' || cors === 'http://localhost:5173';
  console.log(`${corsOk ? 'ok   ' : 'FALHA'} bff       CORS  OPTIONS /notes → ${cors}`);
  if (!corsOk) failures += 1;

  return failures;
}

function stopAll() {
  for (const { child } of children) child.kill();
}

try {
  const failures = await run();
  stopAll();
  if (failures > 0) {
    console.error(`${failures} verificação(ões) falharam.`);
    process.exitCode = 1;
  } else {
    console.log('Todos os mocks responderam como o contrato descreve.');
  }
} catch (error) {
  stopAll();
  for (const { mock, output } of children) console.error(`--- ${mock.name}\n${output().slice(-2000)}`);
  console.error(error);
  process.exitCode = 1;
}
