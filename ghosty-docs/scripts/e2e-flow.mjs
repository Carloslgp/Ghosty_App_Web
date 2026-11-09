// Teste de ponta a ponta pelo BFF: cadastro, notas, desbloqueio, rede de apoio, convite, mensagem,
// painel, Teste seguro, pedido de ajuda, check-in (inclusive o prazo vencendo pela fila com atraso),
// saída rápida e exclusão da conta. Roda contra a máquina local (scripts/e2e-local.sh) ou contra a nuvem:
//
//   E2E_BASE_URL=https://<apim>.azure-api.net E2E_SUBSCRIPTION_KEY=<chave web-app> node scripts/e2e-flow.mjs
//
// Na nuvem, os dois contatos aceitam pelo navegador (nenhuma mensagem real sai pelo Telegram). Na
// máquina local, a Ana entra pelo /start do bot, entregue ao webhook da Function (E2E_FUNCTIONS_URL e
// TELEGRAM_WEBHOOK_SECRET). E2E_SKIP_SLOW=true pula a espera do prazo do check-in (~1 minuto).
const BFF = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const FN = process.env.E2E_FUNCTIONS_URL ?? '';
const KEY = process.env.E2E_SUBSCRIPTION_KEY ?? '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
const viaTelegram = FN !== '' && WEBHOOK_SECRET !== '';
const skipSlow = process.env.E2E_SKIP_SLOW === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, label, extra) => {
  console.log(
    `${cond ? 'OK   ' : 'FALHA'} ${label}${!cond && extra !== undefined ? ` -> ${JSON.stringify(extra)}` : ''}`,
  );
  if (!cond) failures += 1;
};
async function call(method, path, { token, safety, body, headers = {}, base = BFF } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(safety ? { 'X-Safety-Token': safety } : {}),
      ...(KEY && base === BFF ? { 'Ocp-Apim-Subscription-Key': KEY } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}
async function until(fn, label, timeoutMs = 60_000, every = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = await fn();
    if (v) return v;
    await sleep(every);
  }
  ok(false, `${label} (tempo esgotado)`);
  return null;
}

const email = `maria.${Date.now()}@example.com`;
const password = 'senha-forte-123';
const reg = await call('POST', '/auth/register', { body: { displayName: 'Maria Teste', email, password } });
ok([200, 201].includes(reg.status), 'cadastro', reg.body);
const token = reg.body.accessToken;
const notes = await call('GET', '/notes', { token });
ok(notes.status === 200 && notes.body.total === 3, 'cadastro cria 3 notas de exemplo', notes.body?.total);
ok(
  (await call('PUT', '/account/lock-code', { token, body: { currentPassword: password, code: '246810' } }))
    .status === 204,
  'define o código de bloqueio',
);
ok(
  (await call('POST', '/safety/session', { token, body: { code: '000000' } })).status === 403,
  'código errado: 403',
);
const session = await call('POST', '/safety/session', { token, body: { code: '246810' } });
ok(session.status === 200 && session.body.remoteUrl, 'desbloqueio devolve token e remoteUrl');
const safety = session.body.safetyToken;
const s = { token, safety };

const contacts = {};
for (const nickname of ['Ana', 'Beto', 'Carla']) {
  const c = await call('POST', '/safety/contacts', { ...s, body: { nickname } });
  ok(c.status === 201 && c.headers.get('location')?.startsWith('/safety/contacts/'), `adiciona ${nickname}`);
  contacts[nickname] = c.body.id;
}
const invA = await call('POST', `/safety/contacts/${contacts.Ana}/invitation`, s);
const invB = await call('POST', `/safety/contacts/${contacts.Beto}/invitation`, s);
ok(invA.status === 201 && invB.status === 201, 'gera os convites');
const tokenB = invB.body.token;
const page = await call('GET', `/invitations/${tokenB}`);
ok(
  page.status === 200 && page.body.inviterDisplayName === 'Maria Teste' && page.body.remoteUrl,
  'página pública do convite (com remoteUrl)',
  page.body,
);
const acc = await call('POST', `/invitations/${tokenB}/accept`, { body: { channel: 'web' } });
ok(
  acc.status === 200 && acc.body.status === 'confirmed' && acc.body.channel === 'web',
  'Beto aceita pelo navegador',
  acc.body,
);

const anaChannel = viaTelegram ? 'telegram' : 'web';
if (viaTelegram) {
  const wh = await call('POST', '/api/telegram/webhook?code=local', {
    base: FN,
    headers: { 'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET },
    body: {
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        text: `/start ${invA.body.token}`,
        chat: { id: 5123456789, type: 'private' },
      },
    },
  });
  ok(
    wh.status === 200 && wh.body.result === 'linked',
    'Ana dá /start no bot (webhook da Function → safety-service)',
    wh.body,
  );
} else {
  const accA = await call('POST', `/invitations/${invA.body.token}/accept`, { body: { channel: 'web' } });
  ok(accA.status === 200 && accA.body.status === 'confirmed', 'Ana aceita pelo navegador', accA.body);
}
const list = await call('GET', '/safety/contacts', s);
const byName = Object.fromEntries(list.body.items.map((c) => [c.nickname, c]));
ok(byName.Ana.status === 'confirmed' && byName.Ana.channel === anaChannel, `Ana confirmada (${anaChannel})`);
ok(byName.Carla.status === 'pending', 'Carla segue pendente');

const settings = await call('PUT', '/safety/alert-settings', {
  ...s,
  body: {
    messageTemplate:
      'Oi, {apelido}. Aqui é {nome}. Posso estar em uma situação de risco e preciso de ajuda. {local} Enviado às {hora}.',
    includeLocation: true,
    countdownSeconds: 5,
    checkInToleranceMinutes: 0,
  },
});
ok(settings.status === 200 && settings.body.reviewed, 'mensagem revisada');
const preview = await call('POST', '/safety/message-preview', {
  ...s,
  body: { location: { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 } },
});
ok(
  preview.status === 200 &&
    preview.body.text.startsWith('Oi, Ana. Aqui é Maria Teste.') &&
    preview.body.mapUrl,
  'prévia pela Function',
  preview.body,
);

const agg = await call('GET', '/aggregated-data?geo=granted', s);
ok(
  agg.status === 200 &&
    agg.body.sources.notes === 'ok' &&
    agg.body.sources.safety === 'ok' &&
    agg.body.sources.readiness === 'ok',
  'aggregated-data com as 3 fontes',
  agg.body?.sources,
);
ok(
  agg.body.facade.totalNotes === 3 && agg.body.safety.network.confirmed === 2,
  'aggregated-data: notas e rede',
  {
    facade: agg.body.facade,
    net: agg.body.safety?.network,
  },
);
console.log(`      prontidão antes do teste: ${agg.body.readiness.score} (${agg.body.readiness.level})`);

// ---- Teste seguro
const t1 = await call('POST', '/safety/help-requests', {
  ...s,
  headers: { 'Idempotency-Key': 'e2e-test-0001' },
  body: { mode: 'test' },
});
const t1b = await call('POST', '/safety/help-requests', {
  ...s,
  headers: { 'Idempotency-Key': 'e2e-test-0001' },
  body: { mode: 'test' },
});
ok(
  t1.status === 202 && t1b.body.id === t1.body.id,
  'Teste seguro: 202 e a mesma chave não dispara duas vezes',
);
const t1done = await until(async () => {
  const r = await call('GET', `/safety/help-requests/${t1.body.id}`, s);
  return r.body.status !== 'triggered' ? r.body : null;
}, 'Teste seguro despachado (fila → Function → fila → safety-service)');
if (t1done) {
  const outcomes = t1done.steps.map((x) => `${x.contactNickname}:${x.outcome}`);
  ok(
    t1done.status === 'dispatched' &&
      JSON.stringify(outcomes) ===
        JSON.stringify(['Ana:would_send', 'Beto:would_send', 'Carla:skipped_unconfirmed']),
    'Teste seguro: nada sai (would_send)',
    outcomes,
  );
}
ok(
  (await call('GET', `/invitations/${tokenB}/alerts`)).body.items.length === 0,
  'Teste seguro não publica nada na página do Beto',
);

// ---- Pedido real
const r1 = await call('POST', '/safety/help-requests', {
  ...s,
  headers: { 'Idempotency-Key': 'e2e-real-0001' },
  body: { mode: 'real', location: { lat: -23.5505, lng: -46.6333, accuracyMeters: 20 } },
});
ok(r1.status === 202, 'pedido real: 202');
const r1done = await until(async () => {
  const r = await call('GET', `/safety/help-requests/${r1.body.id}`, s);
  return r.body.status !== 'triggered' ? r.body : null;
}, 'pedido real despachado');
if (r1done) {
  const outcomes = r1done.steps.map((x) => `${x.contactNickname}:${x.channel}:${x.outcome}`);
  const anaOutcome = viaTelegram ? 'Ana:telegram:would_send' : 'Ana:web:published_web';
  ok(
    JSON.stringify(outcomes) ===
      JSON.stringify([anaOutcome, 'Beto:web:published_web', 'Carla:none:skipped_unconfirmed']),
    'pedido real: avisos na ordem, Carla (pendente) fica de fora',
    outcomes,
  );
  ok(r1done.steps[1].message.includes('google.com/maps?q=-23.5505,-46.6333'), 'mensagem com o link do mapa');
}
const alerts = await call('GET', `/invitations/${tokenB}/alerts`);
ok(
  alerts.body.items.length === 1 && alerts.body.items[0].message.startsWith('Oi, Beto.'),
  'página do Beto mostra o aviso',
  alerts.body,
);
const agg2 = await call('GET', '/aggregated-data?geo=granted', s);
ok(
  agg2.body.safety.lastTest?.outcome === 'ok',
  'painel registra o último Teste seguro',
  agg2.body.safety?.lastTest,
);
console.log(`      prontidão depois do teste: ${agg2.body.readiness.score} (${agg2.body.readiness.level})`);
ok(
  (await call('POST', `/safety/help-requests/${r1.body.id}/cancel`, s)).body.status === 'cancelled',
  '"foi engano" registra o cancelamento',
);

// ---- Check-in real: estender e confirmar
const ci = await call('POST', '/safety/check-ins', {
  ...s,
  headers: { 'Idempotency-Key': 'e2e-ci-0001' },
  body: { destination: 'Casa', dueAt: new Date(Date.now() + 30 * 60_000).toISOString(), mode: 'real' },
});
ok(
  ci.status === 201 && ci.headers.get('location') === `/safety/check-ins/${ci.body.id}`,
  'check-in real: 201',
);
const ext = await call('PUT', `/safety/check-ins/${ci.body.id}`, {
  ...s,
  body: { dueAt: new Date(Date.now() + 45 * 60_000).toISOString() },
});
ok(ext.body.version === 2, 'estende (versão 2)');
ok(
  (await call('POST', `/safety/check-ins/${ci.body.id}/confirm`, s)).body.status === 'confirmed',
  'cheguei bem',
);

// ---- Check-in de ensaio que vence
if (skipSlow) console.log('      (E2E_SKIP_SLOW=true: sem a espera do prazo do check-in)');
else {
  const due = new Date(Date.now() + 62_000).toISOString();
  const ct = await call('POST', '/safety/check-ins', {
    ...s,
    headers: { 'Idempotency-Key': 'e2e-ci-0002' },
    body: { destination: 'Teste seguro', dueAt: due, toleranceMinutes: 0, mode: 'test' },
  });
  ok(ct.status === 201, 'check-in de ensaio (prazo de ~1 min)');
  console.log('      aguardando o prazo do check-in vencer (fila com atraso)...');
  const expired = await until(
    async () => {
      const r = await call('GET', `/safety/check-ins/${ct.body.id}`, s);
      return r.body.status === 'expired' && r.body.helpRequestId ? r.body : null;
    },
    'check-in vencido gera pedido de ajuda',
    150_000,
    2000,
  );
  if (expired) {
    ok(new Date(expired.expiredAt) >= new Date(due), 'venceu só depois do prazo', {
      due,
      expiredAt: expired.expiredAt,
    });
    const hr = await until(async () => {
      const r = await call('GET', `/safety/help-requests/${expired.helpRequestId}`, s);
      return r.body.status !== 'triggered' ? r.body : null;
    }, 'aviso do check-in despachado');
    if (hr)
      ok(
        hr.origin === 'check_in' &&
          hr.mode === 'test' &&
          hr.steps.every((x) => x.outcome !== 'published_web' && x.outcome !== 'sent'),
        'aviso do check-in de ensaio: origem check_in, nada enviado',
        hr.steps.map((x) => x.outcome),
      );
  }
}

// ---- Saída rápida e exclusão
ok((await call('DELETE', '/safety/session', s)).status === 204, 'saída rápida revoga a sessão');
ok((await call('GET', '/aggregated-data', s)).status === 403, 'token revogado: 403');
ok((await call('DELETE', '/account', { token })).status === 204, 'exclui a conta');
ok(
  (await call('POST', '/auth/login', { body: { email, password } })).status === 401,
  'conta apagada não entra mais',
);

console.log(failures === 0 ? '\nTudo certo.' : `\n${failures} verificação(ões) falharam.`);
process.exit(failures === 0 ? 0 : 1);
