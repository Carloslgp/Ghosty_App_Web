#!/usr/bin/env node
// Gera o PDF da entrega: o arc42 com o C4 Model em anexo e os diagramas Mermaid já desenhados.
// Usa o Google Chrome (ou o Chromium) em modo headless para imprimir; nada além do npm ci.
//
//   npm run arc42:pdf                       # dist/arc42/arc42.pdf (e o arc42.html usado na impressão)
//   CHROME=/caminho/do/chrome npm run arc42:pdf
//   MERMAID_JS=/caminho/mermaid.min.js npm run arc42:pdf   # sem internet: o Mermaid de um arquivo local
//
// Preencha a tabela "Links da entrega" do arc42.md antes (deploy.sh status imprime os links).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.env.OUT_DIR ?? path.join(docs, 'dist', 'arc42'));
/** Versão fixa do Mermaid (a mesma usada para validar os diagramas). */
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.min.js';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Âncora no estilo do GitHub, para os links internos continuarem funcionando no PDF. */
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');

export function buildDocument({ arc42, c4 }) {
  const body = arc42
    // A nota de como gerar o PDF não faz sentido dentro do próprio PDF.
    .replace(/^> Para gerar o PDF\b.*\n\n?/m, '')
    // Os links para o C4 passam a apontar para o anexo, dentro do mesmo documento.
    .replace(/\(\.\.\/c4\/README\.md#([^)]+)\)/g, '(#c4-$1)')
    .replace(/\(\.\.\/c4\/README\.md\)/g, '(#anexo-c4-model)');
  // O C4 entra como anexo: os títulos descem um nível e ganham o prefixo "c4-" nas âncoras.
  const annex = c4
    .replace(/^# C4 Model\n/m, '')
    .replace(/^Diagramas em Mermaid C4.*\n/m, '')
    .replace(/^(#{2,3}) /gm, '#$1 ');

  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      code({ text, lang }) {
        if (lang === 'mermaid') return `<pre class="mermaid">${escape(text)}</pre>\n`;
        return `<pre><code>${escape(text)}</code></pre>\n`;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${slug(text)}">${text}</h${depth}>\n`;
      },
    },
  });
  const main = marked.parse(body);
  const anexo = marked
    .parse(annex)
    .replace(/<h(\d) id="([^"]+)">/g, (_, depth, id) => `<h${depth} id="c4-${id}">`);
  return `${main}\n<h2 id="anexo-c4-model" class="annex">Anexo: C4 Model</h2>\n${anexo}`;
}

export function htmlPage({ title, content, mermaidSrc }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1d1d1f; }
  h1 { font-size: 22pt; margin: 0 0 8pt; }
  h2 { font-size: 15pt; margin-top: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 3pt; break-after: avoid; }
  h2.annex { break-before: page; }
  h3, h4 { break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; }
  code { font-family: "JetBrains Mono", Consolas, monospace; font-size: 8.5pt; background: #f4f4f4; padding: 0 2pt; border-radius: 2pt; }
  pre { background: #f6f6f6; padding: 6pt 8pt; border-radius: 3pt; overflow: hidden; white-space: pre-wrap; font-size: 8.5pt; }
  pre code { background: none; padding: 0; }
  pre.mermaid { background: none; text-align: center; break-inside: avoid; white-space: pre; padding: 0; margin: 4pt 0; }
  pre.mermaid svg { display: block; margin: 0 auto; }
  blockquote { margin: 6pt 0; padding: 2pt 10pt; border-left: 3pt solid #ccc; color: #444; }
  a { color: #0b57d0; text-decoration: none; word-break: break-all; }
  hr { display: none; }
</style>
<script src="${escape(mermaidSrc)}"></script>
</head>
<body>
${content}
<script>
  // O Chrome imprime quando o tempo virtual acaba; data-ready="yes" só se todos os diagramas desenharam.
  // Área útil da página A4 com as margens acima, em px (96 dpi): 178 mm de largura e ~230 mm de altura
  // (deixa espaço para o título da seção na mesma página).
  const MAX_WIDTH = 672;
  const MAX_HEIGHT = 870;
  /** Cada diagrama cabe numa página: reduz mantendo a proporção do viewBox. */
  function fitToPage(svg) {
    const box = svg.viewBox && svg.viewBox.baseVal;
    if (!box || !box.width || !box.height) return;
    const scale = Math.min(1, MAX_WIDTH / box.width, MAX_HEIGHT / box.height);
    svg.removeAttribute('style');
    svg.setAttribute('width', String(Math.floor(box.width * scale)));
    svg.setAttribute('height', String(Math.floor(box.height * scale)));
  }
  // O layout C4 do Mermaid limita cada linha à largura da tela (screen.availWidth). No headless ela é
  // 800 px e só cabem 2 elementos por linha; num navegador comum (e no GitHub) vale o $c4ShapeInRow.
  Object.defineProperty(window.screen, 'availWidth', { configurable: true, get: () => 1920 });
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
  mermaid.run({ querySelector: 'pre.mermaid' })
    .then(() => {
      document.querySelectorAll('pre.mermaid svg').forEach(fitToPage);
      document.body.dataset.ready = 'yes';
    })
    .catch((error) => { document.body.dataset.ready = 'error'; console.error(error); });
</script>
</body>
</html>
`;
}

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // tenta o próximo
    }
  }
  throw new Error('Chrome ou Chromium não encontrado. Defina CHROME=/caminho/do/navegador.');
}

function main() {
  const arc42 = readFileSync(path.join(docs, 'arc42', 'arc42.md'), 'utf8');
  const c4 = readFileSync(path.join(docs, 'c4', 'README.md'), 'utf8');
  const local = process.env.MERMAID_JS;
  if (local && !existsSync(local)) throw new Error(`MERMAID_JS não existe: ${local}`);
  const mermaidSrc = local ? pathToFileURL(path.resolve(local)).href : MERMAID_CDN;

  mkdirSync(out, { recursive: true });
  const html = path.join(out, 'arc42.html');
  const pdf = path.join(out, 'arc42.pdf');
  writeFileSync(
    html,
    htmlPage({ title: 'Ghosty: arc42', content: buildDocument({ arc42, c4 }), mermaidSrc }),
  );

  const chrome = findChrome();
  // O DOM final serve para conferir que todos os diagramas desenharam antes de confiar no PDF.
  const dom = execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--allow-file-access-from-files',
      '--virtual-time-budget=30000',
      '--dump-dom',
      pathToFileURL(html).href,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const expected = (arc42.match(/```mermaid/g)?.length ?? 0) + (c4.match(/```mermaid/g)?.length ?? 0);
  const drawn = dom.match(/<pre class="mermaid"[^>]*data-processed="true"[^>]*>\s*<svg/g)?.length ?? 0;
  if (!dom.includes('data-ready="yes"') || drawn !== expected) {
    throw new Error(
      `Os diagramas não desenharam (${drawn} de ${expected}). Sem internet? Use MERMAID_JS=<mermaid.min.js local>.`,
    );
  }

  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--allow-file-access-from-files',
      '--virtual-time-budget=30000',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdf}`,
      pathToFileURL(html).href,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  if (!existsSync(pdf) || statSync(pdf).size < 10_000) throw new Error('O Chrome não gerou o PDF.');
  process.stdout.write(
    `PDF gerado: ${path.relative(process.cwd(), pdf)} (${drawn} diagramas, ${Math.round(statSync(pdf).size / 1024)} KB)\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
