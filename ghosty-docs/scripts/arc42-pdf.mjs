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

/**
 * Monta o HTML do PDF: o arc42, o C4 como anexo logo depois da seção 12 e, em seguida, os outros anexos
 * do arc42.md (Canvas e prints). Imagens com caminho relativo são resolvidas a partir de `baseDir` (a
 * pasta do arc42.md), porque o HTML impresso fica em outra pasta.
 */
export function buildDocument({ arc42, c4, baseDir = path.join(docs, 'arc42') }) {
  const cleaned = arc42
    // A nota de como gerar o PDF não faz sentido dentro do próprio PDF.
    .replace(/^> Para gerar o PDF\b.*\n\n?/m, '')
    // Os links para o C4 passam a apontar para o anexo, dentro do mesmo documento.
    .replace(/\(\.\.\/c4\/README\.md#([^)]+)\)/g, '(#c4-$1)')
    .replace(/\(\.\.\/c4\/README\.md\)/g, '(#anexo-c4-model)');
  const split = cleaned.search(/^## Anexo/m);
  const body = split < 0 ? cleaned : cleaned.slice(0, split);
  const extras = split < 0 ? '' : cleaned.slice(split);
  // O C4 entra como anexo: os títulos descem um nível e ganham o prefixo "c4-" nas âncoras.
  const annex = c4
    .replace(/^# C4 Model\n/m, '')
    .replace(/^Diagramas em Mermaid.*\n/m, '')
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
        const annexClass = depth === 2 && text.startsWith('Anexo') ? ' class="annex"' : '';
        return `<h${depth} id="${slug(text)}"${annexClass}>${text}</h${depth}>\n`;
      },
      image({ href, text }) {
        const src = /^[a-z][a-z0-9+.-]*:/i.test(href)
          ? href
          : pathToFileURL(path.resolve(baseDir, href)).href;
        return `<figure><img src="${escape(src)}" alt="${escape(text)}"><figcaption>${escape(text)}</figcaption></figure>`;
      },
    },
  });
  const main = marked.parse(body);
  const anexo = marked
    .parse(annex)
    .replace(/<h(\d) id="([^"]+)">/g, (_, depth, id) => `<h${depth} id="c4-${id}">`);
  return `${main}\n<h2 id="anexo-c4-model" class="annex">Anexo: C4 Model</h2>\n${anexo}\n${marked.parse(extras)}`;
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
  pre.mermaid { background: none; text-align: center; break-inside: avoid; white-space: pre; padding: 0; margin: 4pt 0; overflow: visible; }
  /* O Chrome imprime o texto um pouco mais largo do que mediu: o que passar da borda continua visível. */
  pre.mermaid svg { display: block; margin: 0 auto; overflow: visible; }
  pre.mermaid g.cluster-label div { background: #fff; }
  blockquote { margin: 6pt 0; padding: 2pt 10pt; border-left: 3pt solid #ccc; color: #444; }
  a { color: #0b57d0; text-decoration: none; word-break: break-all; }
  hr { display: none; }
  figure { margin: 6pt 0 12pt; break-inside: avoid; text-align: center; }
  figure img { max-width: 100%; max-height: 225mm; border: 1px solid #ccc; }
  figcaption { font-size: 8.5pt; color: #555; margin-top: 3pt; }
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
  /**
   * O Mermaid desenha os títulos dos limites (subgraphs) antes das setas, e uma seta que cruza o título
   * passa por cima do texto. Aqui o título vai para depois das setas, com fundo branco (ver o CSS).
   */
  function liftClusterLabels(svg) {
    svg.querySelectorAll('g.cluster-label').forEach((label) => {
      const root = label.closest('g.root');
      if (root) root.appendChild(label);
    });
  }
  /**
   * Nos diagramas de sequência, as linhas de vida passam atrás do texto das mensagens e dos blocos
   * (loop, par, alt). Um retângulo branco logo atrás de cada texto esconde a linha só onde há texto.
   */
  function maskSequenceText(svg) {
    svg.querySelectorAll('text.messageText, text.loopText').forEach((text) => {
      const box = text.getBBox();
      if (!box.width) return;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(box.x - 3));
      rect.setAttribute('y', String(box.y - 1));
      rect.setAttribute('width', String(box.width + 6));
      rect.setAttribute('height', String(box.height + 2));
      rect.setAttribute('fill', '#fff');
      if (text.getAttribute('transform')) rect.setAttribute('transform', text.getAttribute('transform'));
      text.parentNode.insertBefore(rect, text);
    });
  }
  // deterministicIds: sem ele, o id de cada diagrama vem do relógio. No Chrome headless com tempo virtual,
  // dois diagramas seguidos recebem o mesmo id, e o segundo é desenhado dentro do primeiro.
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict', deterministicIds: true });
  mermaid.run({ querySelector: 'pre.mermaid' })
    .then(() => {
      document.querySelectorAll('pre.mermaid svg').forEach(liftClusterLabels);
      document.querySelectorAll('pre.mermaid svg').forEach(maskSequenceText);
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
  if (process.env.CHROME) return process.env.CHROME;
  // Caminhos fixos: basta o arquivo existir. No Windows, `chrome.exe --version` não imprime nada e abre
  // o navegador, o que travaria o script. O Edge também é Chromium e imprime o PDF do mesmo jeito.
  const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA];
  const paths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...programFiles
      .filter(Boolean)
      .map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...programFiles
      .filter(Boolean)
      .map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
  ];
  const found = paths.find((candidate) => existsSync(candidate));
  if (found) return found;
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore', timeout: 10_000 });
      return candidate;
    } catch {
      // tenta o próximo
    }
  }
  throw new Error('Chrome, Chromium ou Edge não encontrado. Defina CHROME=/caminho/do/navegador.');
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
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 180_000 },
  );
  const expected = (arc42.match(/```mermaid/g)?.length ?? 0) + (c4.match(/```mermaid/g)?.length ?? 0);
  const drawn = dom.match(/<pre class="mermaid"[^>]*data-processed="true"[^>]*>\s*<svg/g)?.length ?? 0;
  if (!dom.includes('data-ready="yes"') || drawn !== expected) {
    throw new Error(
      `Os diagramas não desenharam (${drawn} de ${expected}). Sem internet? Use MERMAID_JS=<mermaid.min.js local>.`,
    );
  }
  const svgIds = [...dom.matchAll(/<pre class="mermaid"[^>]*>\s*<svg[^>]*\bid="([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (new Set(svgIds).size !== expected) {
    throw new Error(
      `Dois diagramas saíram com o mesmo id (${svgIds.join(', ')}): um seria desenhado dentro do outro.`,
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
    { stdio: ['ignore', 'ignore', 'ignore'], timeout: 180_000 },
  );
  if (!existsSync(pdf) || statSync(pdf).size < 10_000) throw new Error('O Chrome não gerou o PDF.');
  process.stdout.write(
    `PDF gerado: ${path.relative(process.cwd(), pdf)} (${drawn} diagramas, ${Math.round(statSync(pdf).size / 1024)} KB)\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
