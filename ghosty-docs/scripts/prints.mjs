#!/usr/bin/env node
// Tira os prints da entrega com o app na nuvem e grava em arc42/prints/ (o PDF do arc42 os leva em anexo):
// Swaggers, AsyncAPI, Swagger do API Gateway, página de links, front (fachada, área segura, rede de apoio,
// mensagem, check-in e a linha do tempo do Teste seguro), chamadas pelo API Gateway, Docker Hub e GitHub
// Actions. Os links vêm da tabela "Links da entrega" do arc42.md. Usa o Chrome instalado (puppeteer-core).
//
//   AZURE_ENV_FILE=infra/azure.env npm run prints        # DEMO_PASSWORD e DEMO_LOCK_CODE lidos do arquivo
//   DEMO_PASSWORD=... DEMO_LOCK_CODE=... npm run prints
//   PRINTS_ONLY=front,swagger-bff npm run prints          # só alguns (id ou prefixo do id)
//   PRINTS_INVITE_URL=<link de convite do seed> npm run prints   # inclui a página do contato
//   PRINTS_FRONT_URL=http://localhost:5173 PRINTS_DIR=/tmp/prints DEMO_EMAIL=... npm run prints  # ensaio local
//
// Sem as credenciais da conta de demonstração, os prints do front são pulados. O Teste seguro não envia
// nada para ninguém; ele só fica registrado na conta de demonstração, como no vídeo.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.PRINTS_DIR ?? path.join(docs, 'arc42', 'prints'));
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
/** Perto da PUCPR, em Curitiba: o pedido de ajuda mostra o link do mapa sem pedir permissão de verdade. */
const GEOLOCATION = { latitude: -25.4513, longitude: -49.2513, accuracy: 25 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- links e configuração

/** Cada linha da tabela "Links da entrega": rótulo → URLs (as soltas e as dos links em Markdown). */
export function linksFromArc42(markdown) {
  const start = markdown.indexOf('## Links da entrega');
  if (start < 0) throw new Error('arc42.md sem a seção "Links da entrega".');
  const end = markdown.indexOf('\n## ', start + 1);
  const links = {};
  for (const line of markdown.slice(start, end < 0 ? undefined : end).split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 4 || /^-+$/.test(cells[1]) || cells[1] === 'Item') continue;
    const label = cells[1].replace(/[`*_]/g, '').trim();
    const urls = [
      ...cells
        .slice(1)
        .join(' ')
        .matchAll(/https?:\/\/[^\s)|>]+/g),
    ].map((match) => match[0]);
    if (urls.length > 0) links[label] = [...new Set(urls)];
  }
  return links;
}

/** `KEY=valor` por linha, sem exportar nada; aceita aspas e o CR do Windows. */
export function parseEnvFile(text) {
  const values = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function demoCredentials() {
  const file = process.env.AZURE_ENV_FILE;
  const fromFile = file && existsSync(file) ? parseEnvFile(readFileSync(file, 'utf8')) : {};
  const pick = (name) => process.env[name] || fromFile[name] || '';
  return {
    email: pick('DEMO_EMAIL') || 'maria.exemplo@example.com',
    password: pick('DEMO_PASSWORD'),
    lockCode: pick('DEMO_LOCK_CODE'),
  };
}

/** Rótulo da tabela → a primeira URL da linha que começa com esse texto. */
function link(links, label, index = 0) {
  const key = Object.keys(links).find((name) => name.startsWith(label));
  return key ? links[key][index] : undefined;
}

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(
    Boolean,
  );
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    ...roots.map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...roots.map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found)
    throw new Error('Chrome, Chromium ou Edge não encontrado. Defina CHROME=/caminho/do/navegador.');
  return found;
}

// ---------------------------------------------------------------- ajudantes do navegador

async function waitText(page, text, timeout = 60_000) {
  await page.waitForFunction((wanted) => document.body?.innerText.includes(wanted), { timeout }, text);
}

async function clickNav(page, label) {
  await page.locator(`nav[aria-label="Seções"] ::-p-text(${label})`).click();
}

async function shot(page, id, { fullPage = false } = {}) {
  await sleep(400); // animações e fontes
  await page.screenshot({ path: path.join(out, `${id}.png`), fullPage });
  process.stdout.write(`  ok    ${id}.png\n`);
}

/** Abre a página, espera a rede acalmar e, se houver, fecha o aviso de cookies. */
async function open(page, url, { waitFor } = {}) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120_000 });
  for (const label of ['Reject All', 'Reject all', 'Accept All', 'Accept all cookies']) {
    const button = await page.$(`::-p-text(${label})`);
    if (button) {
      await button.click().catch(() => undefined);
      await sleep(500);
      break;
    }
  }
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 60_000 });
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mask = (value) => (value ? `${value.slice(0, 6)}…` : '');

/**
 * Página com as chamadas reais pelo API Gateway, desenhada como um terminal: a primeira chamada (a do
 * /aggregated-data, a mais longa) numa coluna e as outras na segunda, para o print caber numa página.
 */
export function callsPage(calls) {
  const [first = '', ...rest] = calls.map(
    (call) => `
  <section>
    <h2>${escapeHtml(call.title)}</h2>
    <pre class="req">${escapeHtml(`${call.method} ${call.url}`)}${(call.requestHeaders ?? [])
      .map((header) => `\n${escapeHtml(header)}`)
      .join('')}</pre>
    <pre class="res"><span class="${call.status < 400 ? 'ok' : 'no'}">HTTP ${call.status}</span>${(
      call.responseHeaders ?? []
    )
      .map((header) => `\n${escapeHtml(header)}`)
      .join('')}${call.body ? `\n\n${escapeHtml(call.body)}` : ''}</pre>
  </section>`,
  );
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Chamadas pelo API Gateway</title>
<style>
  body { margin: 0; padding: 24px 32px; background: #0f1419; color: #d6dde6; font: 14px/1.45 Consolas, "JetBrains Mono", monospace; }
  h1 { font: 600 20px "Segoe UI", Roboto, Arial, sans-serif; color: #fff; margin: 0 0 4px; }
  p.sub { font: 13px "Segoe UI", Roboto, Arial, sans-serif; color: #9aa7b4; margin: 0 0 18px; }
  h2 { font: 600 15px "Segoe UI", Roboto, Arial, sans-serif; color: #e8edf2; margin: 18px 0 6px; }
  pre { margin: 0; padding: 10px 14px; white-space: pre-wrap; word-break: break-all; border-radius: 6px; }
  pre.req { background: #1b2430; color: #8ec5ff; border-radius: 6px 6px 0 0; }
  pre.res { background: #161d26; border-radius: 0 0 6px 6px; }
  .ok { color: #7ee787; font-weight: 700; } .no { color: #ffa198; font-weight: 700; }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
  main section:first-child h2 { margin-top: 0; }
</style></head><body>
  <h1>Chamadas pelo API Gateway (Azure API Management)</h1>
  <p class="sub">Requisições reais feitas em ${escapeHtml(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))} (horário de Brasília). Chaves e tokens aparecem cortados.</p>
  <main><div>${first}</div><div>${rest.join('\n')}</div></main>
</body></html>`;
}

/** Corta o JSON para caber num print: listas longas ficam com os 2 primeiros itens. */
export function compactJson(text, maxItems = 2) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return text.slice(0, 4000);
  }
  const trim = (value) => {
    if (Array.isArray(value)) {
      const kept = value.slice(0, maxItems).map(trim);
      return value.length > maxItems ? [...kept, `… mais ${value.length - maxItems}`] : kept;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item)]));
    }
    if (typeof value === 'string' && value.length > 160) return `${value.slice(0, 160)}…`;
    return value;
  };
  return JSON.stringify(trim(data), null, 2);
}

// ---------------------------------------------------------------- roteiro

/** Os prints que dependem do login na conta de demonstração. */
const FRONT_IDS = [
  'front-entrar',
  'front-fachada-notas',
  'front-seguranca-painel',
  'front-seguranca-rede-de-apoio',
  'front-seguranca-mensagem',
  'front-seguranca-check-in',
  'front-teste-seguro',
  'chamadas-api-gateway',
];

async function publicPages(page, links, wanted) {
  const repo = link(links, 'Repositório');
  const hub = link(links, 'Docker Hub');
  // https://hub.docker.com/u/<usuário> → as tags de uma das imagens, para mostrar a v1 publicada.
  const tags = hub && `${hub.replace('/u/', '/r/').replace(/\/+$/, '')}/ghosty-bff/tags`;
  const pages = [
    ['swagger-bff', link(links, 'Swagger do BFF'), '.swagger-ui .info'],
    ['swagger-notes-service', link(links, 'Swagger do notes-service'), '.swagger-ui .info'],
    ['swagger-safety-service', link(links, 'Swagger do safety-service'), '.swagger-ui .info'],
    ['swagger-function', link(links, 'Swagger da Azure Function'), '.swagger-ui .info'],
    ['swagger-eventos-asyncapi', link(links, 'Swagger dos eventos'), undefined],
    ['swagger-api-gateway-bff', link(links, 'Swagger do API Gateway', 0), '.swagger-ui .info'],
    ['documentacao-links', link(links, 'Página com todos os links'), undefined],
    ['docker-hub', hub, undefined],
    ['docker-hub-tags', tags, undefined],
    ['github-actions', repo && `${repo.replace(/\/+$/, '')}/actions`, undefined],
  ];
  for (const [id, url, selector] of pages) {
    if (!wanted(id)) continue;
    if (!url) {
      process.stdout.write(`  pulo  ${id}: sem link no arc42.md\n`);
      continue;
    }
    try {
      await open(page, url, { waitFor: selector });
      await shot(page, id);
    } catch (error) {
      process.stdout.write(`  FALHA ${id}: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

async function frontFlow(page, links, credentials, wanted) {
  const front = process.env.PRINTS_FRONT_URL || link(links, 'Frontend');
  if (!front) throw new Error('Sem o link do Frontend no arc42.md.');
  const origin = new URL(front).origin;
  await page.browserContext().overridePermissions(origin, ['geolocation']);
  await page.setGeolocation(GEOLOCATION);

  // A chamada do painel ao /aggregated-data, para o print das chamadas pelo API Gateway.
  let aggregated = null;
  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'GET' || !response.url().includes('/aggregated-data') || aggregated) return;
    try {
      aggregated = { response, request, body: await response.text() };
    } catch {
      // resposta sem corpo
    }
  });

  await open(page, front);
  await page.waitForSelector('input[type=email]', { timeout: 60_000 });
  if (wanted('front-entrar')) await shot(page, 'front-entrar');

  await page.type('input[type=email]', credentials.email);
  await page.type('input[type=password]', credentials.password);
  await page.locator('button[type=submit]').click();
  const search = await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 120_000 });
  await sleep(1500); // a lista carrega depois do campo
  if (wanted('front-fachada-notas')) await shot(page, 'front-fachada-notas');

  // O código digitado na busca abre a área segura; o remote `safety` só é baixado agora.
  await search.type(credentials.lockCode);
  await search.press('Enter');
  await waitText(page, 'Painel', 120_000);
  await waitText(page, 'Prontidão', 120_000);
  await sleep(1500);
  if (wanted('front-seguranca-painel')) await shot(page, 'front-seguranca-painel');

  await clickNav(page, 'Rede de apoio');
  await waitText(page, 'Apelido do contato');
  await sleep(1200);
  if (wanted('front-seguranca-rede-de-apoio')) await shot(page, 'front-seguranca-rede-de-apoio');

  await clickNav(page, 'Mensagem');
  await page.waitForSelector('textarea', { timeout: 60_000 });
  await sleep(2500); // a prévia vem da Function
  if (wanted('front-seguranca-mensagem')) await shot(page, 'front-seguranca-mensagem');

  await clickNav(page, 'Check-in');
  await waitText(page, 'Para onde você vai');
  if (wanted('front-seguranca-check-in')) await shot(page, 'front-seguranca-check-in');

  if (wanted('front-teste-seguro')) {
    await clickNav(page, 'Teste seguro');
    const hold = await page.waitForSelector('button ::-p-text(Ensaiar pedido de ajuda)', { timeout: 60_000 });
    const box = await hold.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(2300);
    await page.mouse.up();
    await waitText(page, 'Enviando em', 10_000);
    await sleep(1200);
    await shot(page, 'front-teste-seguro-contagem');
    // Contagem (de 5 a 60 s) + fila + Function: o ensaio termina com a linha do tempo completa.
    await page.waitForFunction(
      () => /Ensaio concluído|O ensaio não alcançou ninguém/.test(document.body.innerText),
      { timeout: 180_000, polling: 1000 },
    );
    await sleep(1500);
    await shot(page, 'front-teste-seguro', { fullPage: true });
  }

  if (wanted('chamadas-api-gateway')) await gatewayCalls(page, links, aggregated);

  // Saída rápida: volta para a fachada e tranca a área segura.
  await page
    .locator('button ::-p-text(Voltar às notas)')
    .click()
    .catch(() => undefined);
}

async function gatewayCalls(page, links, aggregated) {
  if (!aggregated) {
    process.stdout.write('  FALHA chamadas-api-gateway: o painel não chamou o /aggregated-data\n');
    process.exitCode = 1;
    return;
  }
  const url = aggregated.response.url();
  const base = url.slice(0, url.indexOf('/aggregated-data'));
  const sent = aggregated.request.headers();
  const received = aggregated.response.headers();
  const calls = [
    {
      title:
        '1. O front chama o BFF pelo gateway: GET /aggregated-data junta notes-service, safety-service e Function',
      method: 'GET',
      url,
      requestHeaders: [
        `Authorization: Bearer ${mask((sent.authorization ?? '').replace(/^Bearer /, ''))}`,
        `Ocp-Apim-Subscription-Key: ${mask(sent['ocp-apim-subscription-key'])}`,
      ],
      status: aggregated.response.status(),
      responseHeaders: ['content-type', 'x-correlation-id']
        .filter((name) => received[name])
        .map((name) => `${name}: ${received[name]}`),
      body: compactJson(aggregated.body, 1),
    },
  ];
  const plain = async (title, target) => {
    const response = await fetch(target);
    calls.push({
      title,
      method: 'GET',
      url: target,
      status: response.status,
      body: compactJson(await response.text()),
    });
  };
  await plain('2. Sem a chave de assinatura, o API Gateway recusa (401)', `${base}/health`);
  const bff = link(links, 'Swagger do BFF');
  if (bff) {
    await plain(
      '3. Chamada direta ao BFF, sem passar pelo gateway (sem o X-Gateway-Secret): 403',
      `${new URL(bff).origin}/notes`,
    );
  }
  const shotPage = await page.browser().newPage();
  await shotPage.setViewport({ ...VIEWPORT, height: 600, deviceScaleFactor: 2 }); // nítido com zoom no PDF
  await shotPage.setContent(callsPage(calls), { waitUntil: 'load' });
  await shot(shotPage, 'chamadas-api-gateway', { fullPage: true });
  await shotPage.close();
}

async function invitePage(page, url) {
  await open(page, url);
  await waitText(page, 'rede de apoio', 120_000);
  await sleep(1500);
  await shot(page, 'front-pagina-do-contato');
}

async function main() {
  const { default: puppeteer } = await import('puppeteer-core');
  const links = linksFromArc42(readFileSync(path.join(docs, 'arc42', 'arc42.md'), 'utf8'));
  const only = (process.env.PRINTS_ONLY ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const wanted = (id) => only.length === 0 || only.some((prefix) => id.startsWith(prefix));
  const credentials = demoCredentials();
  mkdirSync(out, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--lang=pt-BR', '--hide-scrollbars'],
  });
  const newPage = async () => {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.emulateTimezone('America/Sao_Paulo');
    return page;
  };
  try {
    process.stdout.write(`Prints em ${path.relative(process.cwd(), out) || '.'}\n`);
    await publicPages(await newPage(), links, wanted);

    if (FRONT_IDS.some(wanted)) {
      if (!credentials.password || !credentials.lockCode) {
        process.stdout.write('  pulo  front: defina DEMO_PASSWORD e DEMO_LOCK_CODE (ou AZURE_ENV_FILE)\n');
      } else {
        await frontFlow(await newPage(), links, credentials, wanted);
      }
    }
    const invite = process.env.PRINTS_INVITE_URL;
    if (invite && wanted('front-pagina-do-contato')) await invitePage(await newPage(), invite);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`erro: ${error.message}\n`);
    process.exit(1);
  });
}
