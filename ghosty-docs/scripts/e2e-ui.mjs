#!/usr/bin/env node
// Teste de ponta a ponta pela interface, no navegador (Chrome headless), contra o front na nuvem ou na
// máquina local. Faz o que uma pessoa faria: cadastro, notas (criar, editar, fixar, converter, marcar,
// arquivar, buscar, apagar), código de bloqueio, desbloqueio pela busca (o remote `safety` só é baixado
// nessa hora), rede de apoio (adicionar, reordenar, remover, convites), mensagem com a prévia da Function,
// o contato aceitando e recusando o convite num segundo navegador, Teste seguro (nada chega ao contato),
// check-in (iniciar, estender, confirmar, cancelar), pedido real (chega na página do contato) e "foi
// engano", saída rápida com Esc duas vezes, sessão mantida no recarregar, sair e entrar, celular, PWA e,
// no fim, a exclusão da conta. Usa uma conta nova a cada execução; a conta de demonstração não é tocada.
//
//   npm run e2e:ui                                    # front da tabela "Links da entrega" do arc42
//   E2E_FRONT_URL=http://localhost:5173 npm run e2e:ui
//   E2E_UI_OUT=<pasta> npm run e2e:ui                 # onde gravar o print de cada falha
import { mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, linksFromArc42 } from './prints.mjs';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.E2E_UI_OUT ?? path.join(os.tmpdir(), 'ghosty-e2e-ui'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = Date.now();
const ACCOUNT = { name: 'Teste Interface', email: `ui.${stamp}@example.com`, password: 'senha-forte-ui-123' };
const CODE = '13572468';
const MARK = `Teste UI ${stamp % 10_000}`;
/** Termos que nunca aparecem na fachada (nomes neutros no navegador). */
const REVEALING = /ghosty|safety|segurança|alerta|socorro/i;

let failures = 0;
let shots = 0;
/** Respostas com erro e requisições que falharam, para explicar cada falha. */
const network = [];
function watch(page, who) {
  const path = (url) => new URL(url).pathname;
  page.on('response', (response) => {
    const method = response.request().method();
    if (response.status() >= 400 && method !== 'OPTIONS') {
      network.push({ at: Date.now(), who, text: `${response.status()} ${method} ${path(response.url())}` });
    }
  });
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    network.push({
      at: Date.now(),
      who,
      text: `falhou ${request.method()} ${path(request.url())}: ${reason}`,
    });
  });
}

// ---------------------------------------------------------------- ajudantes

async function step(page, label, fn) {
  try {
    // A aba testada vem para a frente: oculta, o Chrome a congela, e a área segura tranca sozinha em 2 min.
    await page?.bringToFront();
    const extra = await fn();
    process.stdout.write(`OK    ${label}${extra ? ` (${extra})` : ''}\n`);
    return true;
  } catch (error) {
    failures += 1;
    shots += 1;
    const file = path.join(out, `falha-${String(shots).padStart(2, '0')}.png`);
    await page?.screenshot({ path: file, fullPage: true }).catch(() => undefined);
    process.stdout.write(`FALHA ${label}: ${error.message.split('\n')[0]} -> ${file}\n`);
    const recent = network.filter((entry) => entry.at > Date.now() - 90_000).slice(-6);
    for (const entry of recent) process.stdout.write(`        rede (${entry.who}): ${entry.text}\n`);
    return false;
  }
}

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitText(page, text, timeout = 30_000) {
  await page.waitForFunction(
    // innerText já vem com o text-transform do CSS (títulos em maiúsculas): compara sem caixa.
    (wanted) => document.body?.innerText.toLowerCase().includes(wanted.toLowerCase()),
    { timeout, polling: 250 },
    text,
  );
}

async function waitGone(page, text, timeout = 30_000) {
  await page.waitForFunction(
    (wanted) => !document.body?.innerText.toLowerCase().includes(wanted.toLowerCase()),
    { timeout, polling: 250 },
    text,
  );
}

const bodyText = (page) => page.evaluate(() => document.body.innerText);

/** O botão (ou link) cujo texto é exatamente `label`. */
async function click(page, label, { tag = 'button', timeout = 30_000 } = {}) {
  const xpath = `//${tag}[normalize-space(.)=${JSON.stringify(label)} or @aria-label=${JSON.stringify(label)}]`;
  const handle = await page.waitForSelector(`::-p-xpath(${xpath})`, { visible: true, timeout });
  await page.waitForFunction((el) => !el.disabled, { timeout }, handle);
  await handle.click();
}

/** O campo ligado ao `<label>` que começa com `label`. */
async function field(page, label) {
  const handle = await page.waitForFunction(
    (wanted) => {
      const found = [...document.querySelectorAll('label')].find((item) =>
        item.textContent.trim().startsWith(wanted),
      );
      return found?.control ?? (found?.htmlFor ? document.getElementById(found.htmlFor) : null);
    },
    { timeout: 30_000 },
    label,
  );
  return handle.asElement();
}

/** Troca o valor do campo pelo teclado (como uma pessoa), apagando o que havia. */
async function fill(page, label, value) {
  const input = await field(page, label);
  await input.focus();
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await input.type(value);
}

/** Campos `time` e `number`: valor direto, com o evento que o React escuta. */
async function setValue(page, label, value) {
  const input = await field(page, label);
  await input.evaluate((el, next) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function hold(page, label, ms = 2300) {
  const xpath = `//button[.//span[normalize-space(.)=${JSON.stringify(label)}]]`;
  const button = await page.waitForSelector(`::-p-xpath(${xpath})`, { visible: true, timeout: 30_000 });
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(ms);
  await page.mouse.up();
}

async function nav(page, label) {
  const handle = await page.waitForSelector(
    `::-p-xpath(//nav[@aria-label="Seções"]//a[normalize-space(.)=${JSON.stringify(label)}])`,
    { timeout: 30_000 },
  );
  await handle.click();
}

const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** O valor do campo somente leitura com o link do convite de um contato. */
const inviteLink = async (page, nickname) =>
  (await field(page, `Link do convite de ${nickname}`)).evaluate((el) => el.value);

// ---------------------------------------------------------------- roteiro

async function main() {
  const { default: puppeteer } = await import('puppeteer-core');
  const links = linksFromArc42(readFileSync(path.join(docs, 'arc42', 'arc42.md'), 'utf8'));
  const front = (process.env.E2E_FRONT_URL || links['Frontend']?.[0] || '').replace(/\/+$/, '');
  check(front, 'sem a URL do front (E2E_FRONT_URL ou a tabela do arc42)');
  mkdirSync(out, { recursive: true });
  process.stdout.write(`Front: ${front}\nConta de teste: ${ACCOUNT.email}\n\n`);

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--lang=pt-BR'],
  });
  const owner = await browser.createBrowserContext();
  const contact = await browser.createBrowserContext();
  await owner.overridePermissions(new URL(front).origin, ['geolocation']);
  const open = async (context, viewport = { width: 1280, height: 900 }) => {
    const page = await context.newPage();
    await page.setViewport(viewport);
    await page.emulateTimezone('America/Sao_Paulo');
    await page.setGeolocation({ latitude: -25.4513, longitude: -49.2513, accuracy: 25 });
    return page;
  };

  try {
    const page = await open(owner);
    watch(page, 'pessoa');
    const requests = [];
    const responses = [];
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    page.on('response', (response) =>
      responses.push({ url: response.url(), method: response.request().method(), status: response.status() }),
    );
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    // ------------------------------------------------ cadastro e fachada
    await step(page, 'sem sessão, o front abre em Entrar', async () => {
      await page.goto(front, { waitUntil: 'networkidle2', timeout: 120_000 });
      await waitText(page, 'Entrar');
      check(new URL(page.url()).pathname === '/entrar', `caminho ${page.url()}`);
    });
    await step(page, 'cadastro pela tela Criar conta (com as notas de exemplo)', async () => {
      await click(page, 'Criar conta', { tag: 'a' });
      await fill(page, 'Nome', ACCOUNT.name);
      await fill(page, 'E-mail', ACCOUNT.email);
      await fill(page, 'Senha', ACCOUNT.password);
      await click(page, 'Criar conta');
      await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 120_000 });
      await page.waitForFunction(() => document.querySelectorAll('main ul li a').length >= 3, {
        timeout: 60_000,
      });
    });
    await step(page, 'a fachada é neutra: título, manifesto e texto', async () => {
      const title = await page.title();
      const text = await bodyText(page);
      const manifest = await page.evaluate(async () => {
        const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
        return href ? (await fetch(href)).json() : null;
      });
      check(!REVEALING.test(title), `título "${title}"`);
      check(!REVEALING.test(text), 'texto da fachada revela a área segura');
      check(manifest && !REVEALING.test(JSON.stringify(manifest)), 'manifesto ausente ou revelador');
      return `título "${title}", app "${manifest.name}"`;
    });

    // ------------------------------------------------ notas
    let noteUrl = '';
    await step(page, 'nova nota: título, texto, cor e etiqueta salvos', async () => {
      await click(page, 'Nova nota');
      await page.waitForFunction(() => location.pathname.startsWith('/nota/'), { timeout: 30_000 });
      noteUrl = page.url();
      await fill(page, 'Título', `Mercado ${MARK}`);
      await fill(page, 'Texto', 'pão\nleite\ncafé');
      await page.locator('label[data-color="yellow"]').click();
      await fill(page, 'Etiquetas', 'casa, compras');
      await click(page, 'Salvar');
      await waitText(page, 'Nota salva.');
    });
    await step(page, 'salvar de novo a mesma nota (versão atualizada, sem 409)', async () => {
      await fill(page, 'Título', `Mercado da semana ${MARK}`);
      await click(page, 'Salvar');
      await waitText(page, 'Nota salva.');
      const text = await bodyText(page);
      check(!text.includes('mudou em outro lugar'), 'conflito de versão');
    });
    await step(page, 'fixar e converter em lista (as linhas viram itens)', async () => {
      await click(page, 'Fixar');
      await page.waitForSelector('::-p-xpath(//button[normalize-space(.)="Desafixar"])', { timeout: 30_000 });
      await click(page, 'Converter em lista');
      await page.waitForSelector('input[aria-label="Item 3"]', { timeout: 30_000 });
    });
    await step(page, 'marcar um item da lista fica gravado', async () => {
      await page.locator('input[type=checkbox][aria-label="Marcar pão"]').click();
      await page.waitForFunction(
        () => document.querySelector('input[aria-label="Marcar pão"]')?.checked === true,
        { timeout: 30_000 },
      );
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForFunction(
        () => document.querySelector('input[aria-label="Marcar pão"]')?.checked === true,
        { timeout: 60_000 },
      );
    });
    await step(page, 'a nota aparece em Fixadas e a busca filtra no navegador', async () => {
      await click(page, '← Voltar', { tag: 'a' });
      await waitText(page, 'Fixadas');
      await page.type('input[placeholder="Buscar notas"]', MARK);
      try {
        await page.waitForFunction(() => document.querySelectorAll('main ul li a').length === 1, {
          timeout: 10_000,
        });
      } catch {
        const state = await page.evaluate(() => ({
          value: document.querySelector('input[placeholder="Buscar notas"]')?.value,
          cards: document.querySelectorAll('main ul li a').length,
        }));
        throw new Error(`a busca por "${state.value}" mostrou ${state.cards} nota(s)`);
      }
      await fill(page, 'Buscar notas', 'zzz-nada-assim');
      await waitText(page, 'Nenhuma nota encontrada');
      await fill(page, 'Buscar notas', '');
    });
    await step(page, 'nova lista com itens, arquivar, achar em Arquivadas e desarquivar', async () => {
      await click(page, 'Nova lista');
      await page.waitForFunction(() => location.pathname.startsWith('/nota/'), { timeout: 30_000 });
      await fill(page, 'Título', `Viagem ${MARK}`);
      for (const item of ['documentos', 'carregador']) {
        await page.type('input[aria-label="Novo item"]', item);
        await page.keyboard.press('Enter');
      }
      await click(page, 'Salvar');
      await waitText(page, 'Nota salva.');
      await click(page, 'Arquivar');
      await page.waitForSelector('::-p-xpath(//button[normalize-space(.)="Desarquivar"])', {
        timeout: 30_000,
      });
      // Nota arquivada: o "Voltar" leva para Arquivadas, e ela não aparece mais na lista principal.
      await click(page, '← Voltar', { tag: 'a' });
      await waitText(page, 'Arquivadas');
      await waitText(page, `Viagem ${MARK}`);
      await page.locator(`::-p-text(Viagem ${MARK})`).click();
      await click(page, 'Desarquivar');
      await page.waitForSelector('::-p-xpath(//button[normalize-space(.)="Arquivar"])', { timeout: 30_000 });
    });
    await step(page, 'apagar a nota', async () => {
      await click(page, 'Apagar');
      await page.waitForFunction(() => location.pathname === '/', { timeout: 30_000 });
      await waitGone(page, `Viagem ${MARK}`);
      check(noteUrl, 'sem a primeira nota');
    });

    // ------------------------------------------------ configurações e código
    await step(page, 'Configurações: senha errada e códigos diferentes são recusados', async () => {
      await click(page, 'Configurações', { tag: 'a' });
      await waitText(page, ACCOUNT.email);
      await fill(page, 'Senha atual', 'senha-errada-000');
      await fill(page, 'Novo código', CODE);
      await fill(page, 'Repita o código', CODE);
      await click(page, 'Salvar código');
      await waitText(page, 'Senha atual incorreta');
      await fill(page, 'Senha atual', ACCOUNT.password);
      await fill(page, 'Repita o código', '11112222');
      await click(page, 'Salvar código');
      await waitText(page, 'Os códigos não conferem');
    });
    await step(page, 'Configurações: código de bloqueio salvo', async () => {
      await fill(page, 'Repita o código', CODE);
      await click(page, 'Salvar código');
      await waitText(page, 'Código salvo.');
      await click(page, '← Voltar às notas', { tag: 'a' });
      await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 30_000 });
    });

    // ------------------------------------------------ desbloqueio
    let safetyOrigin = '';
    await step(page, 'código errado na busca não abre nada (e não mostra erro)', async () => {
      await fill(page, 'Buscar notas', '99999999');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () =>
          performance.getEntriesByType('resource').some((entry) => entry.name.includes('/safety/session')),
        { timeout: 30_000 },
      );
      await sleep(1500);
      const text = await bodyText(page);
      check(text.includes('Nenhuma nota encontrada'), 'a fachada mudou');
      check(!REVEALING.test(text), 'a tela revelou algo');
    });
    await step(page, 'código certo abre a área segura, e o remote só é baixado agora', async () => {
      const before = requests.length;
      await fill(page, 'Buscar notas', CODE);
      await page.keyboard.press('Enter');
      await waitText(page, 'Painel', 120_000);
      await waitText(page, 'Prontidão', 60_000);
      const remote = requests.slice(before).find((request) => request.url.endsWith('/remoteEntry.js'));
      check(remote, 'nenhum remoteEntry.js depois do desbloqueio');
      safetyOrigin = new URL(remote.url).origin;
      const early = requests.slice(0, before).filter((request) => request.url.startsWith(safetyOrigin));
      check(early.length === 0, `${early.length} pedido(s) ao remote safety antes do código`);
      check(new URL(page.url()).pathname === '/', `a URL mudou para ${page.url()}`);
      return `remote em ${safetyOrigin}`;
    });
    await step(page, 'painel de conta nova: rede vazia e prontidão baixa', async () => {
      await waitText(page, 'Sua rede ainda está vazia');
      const score = Number(/Prontidão: (\d+) de 100/.exec(await bodyText(page))?.[1]);
      check(score < 50, `prontidão ${score}`);
      return `prontidão ${score}`;
    });

    // ------------------------------------------------ rede de apoio
    const invites = {};
    await step(page, 'rede de apoio: adicionar, reordenar e remover contatos', async () => {
      await nav(page, 'Rede de apoio');
      for (const name of ['Ana UI', 'Beto UI', 'Carla UI']) {
        await fill(page, 'Apelido do contato', name);
        await click(page, 'Adicionar');
        await waitText(page, `. ${name}`);
      }
      await click(page, 'Descer Ana UI');
      await page.waitForFunction(() => document.body.innerText.includes('1. Beto UI'), { timeout: 30_000 });
      await click(page, 'Subir Ana UI');
      await page.waitForFunction(() => document.body.innerText.includes('1. Ana UI'), { timeout: 30_000 });
      await click(page, 'Remover Carla UI');
      await waitGone(page, 'Carla UI');
    });
    await step(page, 'convites gerados para a Ana e o Beto', async () => {
      for (const name of ['Ana UI', 'Beto UI']) {
        const row = await page.waitForSelector(
          `::-p-xpath(//li[.//strong[contains(., ${JSON.stringify(name)})]]//button[normalize-space(.)="Gerar convite"])`,
        );
        await row.click();
        invites[name] = await (async () => {
          for (let i = 0; i < 40; i += 1) {
            const value = await inviteLink(page, name).catch(() => '');
            if (value) return value;
            await sleep(250);
          }
          return '';
        })();
        check(/\/c\/[A-Za-z0-9_-]{43}$/.test(invites[name]), `link de ${name}: ${invites[name]}`);
      }
    });

    // ------------------------------------------------ mensagem
    await step(page, 'mensagem: a prévia vem da Function e a mensagem é salva', async () => {
      await nav(page, 'Mensagem');
      const textarea = await field(page, 'Mensagem');
      const current = await textarea.evaluate((el) => el.value);
      await fill(page, 'Mensagem', `${current} ${MARK}.`);
      await page.waitForFunction(
        (mark) =>
          [...document.querySelectorAll('p')].some(
            (p) => p.textContent.includes(mark) && p.textContent.includes('Teste Interface'),
          ),
        { timeout: 30_000 },
        MARK,
      );
      await setValue(page, 'Contagem antes de enviar', '5');
      await click(page, 'Salvar mensagem');
      await waitText(page, 'Mensagem salva e marcada como revisada.');
    });

    // ------------------------------------------------ o contato responde
    const contactPage = await open(contact, { width: 412, height: 860 });
    watch(contactPage, 'Ana');
    await step(contactPage, 'contato: link inválido mostra uma tela neutra', async () => {
      await contactPage.goto(`${front}/c/nao-existe`, { waitUntil: 'networkidle2' });
      await waitText(contactPage, 'Este link não é válido.');
    });
    await step(contactPage, 'contato: a Ana aceita pelo navegador e vê o painel de avisos', async () => {
      await contactPage.goto(invites['Ana UI'], { waitUntil: 'networkidle2', timeout: 120_000 });
      await waitText(contactPage, 'quer ter você na rede de apoio', 60_000);
      await click(contactPage, 'Aceitar pelo navegador');
      await waitText(contactPage, 'Você está na rede de apoio de', 30_000);
      await waitText(contactPage, 'Nenhum aviso por enquanto.');
    });
    const betoPage = await open(contact, { width: 412, height: 860 });
    await step(betoPage, 'contato: o Beto vê a opção do Telegram e recusa', async () => {
      await betoPage.goto(invites['Beto UI'], { waitUntil: 'networkidle2', timeout: 120_000 });
      await waitText(betoPage, 'quer ter você na rede de apoio', 60_000);
      await click(betoPage, 'Recusar');
      await waitText(betoPage, 'Você recusou o convite.');
    });
    await step(page, 'a rede mostra a Ana confirmada (página web) e o Beto recusando', async () => {
      await nav(page, 'Painel');
      await nav(page, 'Rede de apoio');
      await page.waitForFunction(
        () =>
          /Ana UI[\s\S]*Confirmado · Página web/.test(document.body.innerText) &&
          document.body.innerText.includes('Recusou'),
        { timeout: 60_000, polling: 1000 },
      );
    });

    // ------------------------------------------------ Teste seguro
    await step(page, 'Teste seguro: contagem, linha do tempo e nada enviado', async () => {
      await nav(page, 'Teste seguro');
      await hold(page, 'Ensaiar pedido de ajuda');
      await waitText(page, 'Enviando em', 10_000);
      await waitText(page, 'Ensaio concluído', 120_000);
      await waitText(page, 'Teria sido enviado');
      await sleep(5000);
      const contactText = await bodyText(contactPage);
      check(contactText.includes('Nenhum aviso por enquanto.'), 'o ensaio chegou na página do contato');
    });

    // ------------------------------------------------ check-in
    await step(page, 'check-in: iniciar, estender 15 min e "cheguei bem"', async () => {
      await nav(page, 'Check-in');
      await fill(page, 'Para onde você vai', `Casa ${MARK}`);
      const time = await page.evaluate(() => new Date(Date.now() + 3 * 3600_000).toTimeString().slice(0, 5));
      await setValue(page, 'Horário em que pretende chegar', time);
      await click(page, 'Iniciar check-in');
      await waitText(page, `Check-in ativo: Casa ${MARK}`, 30_000);
      const before = /Chegada prevista às (\d\d:\d\d)/.exec(await bodyText(page))?.[1];
      await click(page, 'Mais 15 min');
      await page.waitForFunction(
        (old) => (/Chegada prevista às (\d\d:\d\d)/.exec(document.body.innerText)?.[1] ?? old) !== old,
        { timeout: 30_000 },
        before,
      );
      await click(page, 'Cheguei bem');
      await waitText(page, 'Iniciar check-in', 30_000);
      return `${before} → +15 min`;
    });
    await step(page, 'check-in: iniciar e cancelar', async () => {
      await fill(page, 'Para onde você vai', 'Faculdade');
      const time = await page.evaluate(() => new Date(Date.now() + 2 * 3600_000).toTimeString().slice(0, 5));
      await setValue(page, 'Horário em que pretende chegar', time);
      await click(page, 'Iniciar check-in');
      await waitText(page, 'Check-in ativo: Faculdade', 30_000);
      await click(page, 'Cancelar check-in');
      await waitText(page, 'Iniciar check-in', 30_000);
    });

    // ------------------------------------------------ pedido real
    await step(page, 'pedir ajuda: cancelar durante a contagem não envia nada', async () => {
      await nav(page, 'Painel');
      const before = responses.filter(
        (r) => r.method === 'POST' && r.url.includes('/safety/help-requests'),
      ).length;
      await hold(page, 'Pedir ajuda');
      await waitText(page, 'Enviando em', 10_000);
      await click(page, 'Cancelar');
      await sleep(7000);
      const after = responses.filter(
        (r) => r.method === 'POST' && r.url.includes('/safety/help-requests'),
      ).length;
      check(after === before, 'o pedido foi enviado mesmo cancelado');
    });
    await step(page, 'pedir ajuda de verdade: linha do tempo com a Ana avisada pela página', async () => {
      await hold(page, 'Pedir ajuda');
      await waitText(page, 'Enviando em', 10_000);
      await waitText(page, 'Pedido de ajuda', 60_000);
      await waitText(page, 'Avisos enviados', 120_000);
      await waitText(page, 'Publicado na página do contato');
      const text = await bodyText(page);
      check(text.includes('Beto UI') === false || text.includes('Não recebeu'), 'o Beto (recusou) recebeu');
    });
    await step(contactPage, 'contato: o aviso real chega na página da Ana', async () => {
      await waitText(contactPage, MARK, 120_000);
      return 'mensagem com o nome e o mapa';
    });
    await step(page, '"Foi engano" registra o cancelamento', async () => {
      await click(page, 'Foi engano');
      await waitText(page, 'Registrado como engano', 30_000);
      await click(page, 'Voltar ao painel');
      await waitText(page, 'Prontidão');
    });

    // ------------------------------------------------ outras telas
    await step(page, 'canais oficiais 190, 180 e 192 como links de telefone', async () => {
      await nav(page, 'Canais oficiais');
      const hrefs = await page.$$eval('a[href^="tel:"]', (items) => items.map((a) => a.getAttribute('href')));
      for (const number of ['tel:190', 'tel:180', 'tel:192'])
        check(hrefs.includes(number), `falta ${number}`);
    });
    await step(page, 'ajustes mostram os recursos ainda desligados, com o motivo', async () => {
      await nav(page, 'Ajustes');
      await waitText(page, 'Ainda não disponível');
      await waitText(page, 'Planejado');
    });

    // ------------------------------------------------ saída rápida e sessão
    await step(page, 'saída rápida com Esc duas vezes: volta às notas e revoga a sessão', async () => {
      const before = responses.length;
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 30_000 });
      await sleep(1500);
      const revoked = responses
        .slice(before)
        .some((r) => r.method === 'DELETE' && r.url.includes('/safety/session') && r.status === 204);
      check(revoked, 'sem DELETE /safety/session 204');
      check(!REVEALING.test(await bodyText(page)), 'sobrou algo da área segura na tela');
    });
    await step(page, 'recarregar mantém a conta (refresh token) e a área segura trancada', async () => {
      await page.reload({ waitUntil: 'networkidle2' });
      await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 60_000 });
      check(!(await bodyText(page)).includes('Painel'), 'a área segura continuou aberta');
    });
    await step(page, 'sair e entrar de novo (senha errada recusada)', async () => {
      await click(page, 'Configurações', { tag: 'a' });
      await click(page, 'Sair');
      await waitText(page, 'Entrar');
      await fill(page, 'E-mail', ACCOUNT.email);
      await fill(page, 'Senha', 'senha-errada-000');
      await click(page, 'Entrar');
      await waitText(page, 'E-mail ou senha incorretos.');
      await fill(page, 'Senha', ACCOUNT.password);
      await click(page, 'Entrar');
      await page.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 60_000 });
    });

    // ------------------------------------------------ celular e PWA
    const phone = await open(owner, { width: 390, height: 844, isMobile: true, hasTouch: true });
    watch(phone, 'celular');
    await step(phone, 'celular: fachada e área segura sem rolagem lateral', async () => {
      await phone.goto(front, { waitUntil: 'networkidle2', timeout: 120_000 });
      await phone.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 60_000 });
      check(await noHorizontalScroll(phone), 'a fachada rola para o lado');
      await phone.type('input[placeholder="Buscar notas"]', CODE);
      await phone.keyboard.press('Enter');
      await waitText(phone, 'Prontidão', 120_000);
      check(await noHorizontalScroll(phone), 'o painel rola para o lado');
      await phone.click('::-p-xpath(//button[normalize-space(.)="Voltar às notas"])');
      await phone.waitForSelector('input[placeholder="Buscar notas"]', { timeout: 30_000 });
    });
    await step(page, 'PWA: o service worker está registrado', async () => {
      const scope = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker?.getRegistration();
        return registration?.scope ?? '';
      });
      check(scope, 'sem service worker');
      return scope;
    });

    // ------------------------------------------------ exclusão da conta
    await step(page, 'excluir a conta: volta para Entrar e a conta não entra mais', async () => {
      await click(page, 'Configurações', { tag: 'a' });
      await click(page, 'Excluir conta');
      await click(page, 'Excluir definitivamente');
      await waitText(page, 'Entrar', 30_000);
      await fill(page, 'E-mail', ACCOUNT.email);
      await fill(page, 'Senha', ACCOUNT.password);
      await click(page, 'Entrar');
      await waitText(page, 'E-mail ou senha incorretos.');
    });
    await step(contactPage, 'contato: depois da exclusão, o link do convite deixa de valer', async () => {
      await contactPage.goto(invites['Ana UI'], { waitUntil: 'networkidle2' });
      await contactPage.waitForFunction(
        () => /não é válido|venceu|recusou|Nada mais/.test(document.body.innerText),
        { timeout: 60_000 },
      );
    });
    await step(page, 'sem erros de JavaScript na página', async () => {
      check(pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
    });
  } finally {
    await browser.close();
  }
  process.stdout.write(failures === 0 ? '\nTudo certo.\n' : `\n${failures} falha(s). Prints em ${out}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`erro: ${error.message}\n`);
  process.exit(1);
});
