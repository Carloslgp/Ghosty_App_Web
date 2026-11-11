// O documento da entrega: o arc42 tem o que a disciplina pede, e o PDF montado a partir dele
// (scripts/arc42-pdf.mjs) leva o C4 em anexo, com todos os diagramas e os links internos funcionando.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callsPage, compactJson, linksFromArc42, parseEnvFile } from '../scripts/prints.mjs';
import { describe, expect, it } from 'vitest';
import { buildDocument, htmlPage } from '../scripts/arc42-pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arc42 = readFileSync(path.join(root, 'arc42', 'arc42.md'), 'utf8');
const c4 = readFileSync(path.join(root, 'c4', 'README.md'), 'utf8');
const html = buildDocument({ arc42, c4 });
const mermaidBlocks = (text) => text.match(/^```mermaid$/gm)?.length ?? 0;

describe('arc42', () => {
  it('tem as 12 seções do modelo', () => {
    const sections = [...arc42.matchAll(/^## (\d+)\. /gm)].map((match) => Number(match[1]));
    expect(sections).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('a tabela de links cobre tudo o que a entrega pede', () => {
    const links = arc42.slice(arc42.indexOf('## Links da entrega'), arc42.indexOf('## 1. '));
    for (const item of [
      'GitHub',
      'Docker Hub',
      'Swagger do BFF',
      'Swagger do notes-service',
      'Swagger do safety-service',
      'Swagger da Azure Function',
      'Swagger dos eventos',
      'Frontend',
      'API Gateway',
      'Swagger do API Gateway',
      'YouTube',
    ]) {
      expect(links, item).toContain(item);
    }
    for (const folder of [
      'ghosty-web',
      'ghosty-bff',
      'ghosty-notes-service',
      'ghosty-safety-service',
      'ghosty-functions',
    ]) {
      expect(links, folder).toContain(`/tree/main/${folder}`);
    }
  });

  it('o C4 tem contexto, containers e componentes', () => {
    expect(c4).toMatch(/^C4Context$/m);
    expect(c4).toMatch(/^C4Container$/m);
    expect(c4.match(/^C4Component$/gm)).toHaveLength(4);
  });
});

describe('PDF da entrega', () => {
  it('leva todos os diagramas do arc42 e do C4', () => {
    expect(html.match(/<pre class="mermaid">/g)).toHaveLength(mermaidBlocks(arc42) + mermaidBlocks(c4));
  });

  it('os links para o C4 apontam para o anexo, e todo link interno tem destino', () => {
    expect(html).not.toContain('../c4/README.md');
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]));
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) expect(ids, target).toContain(target);
  });

  it('os títulos têm âncoras únicas', () => {
    const ids = [...html.matchAll(/<h\d id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('não leva a nota de como gerar o PDF', () => {
    expect(html).not.toContain('Para gerar o PDF');
  });

  it('a página escapa o título e carrega o Mermaid da origem indicada', () => {
    const page = htmlPage({ title: 'a <b>', content: '<p>x</p>', mermaidSrc: 'file:///tmp/mermaid.min.js' });
    expect(page).toContain('<title>a &lt;b&gt;</title>');
    expect(page).toContain('<script src="file:///tmp/mermaid.min.js"></script>');
  });
});

describe('anexos de Canvas e prints', () => {
  const images = [...arc42.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);

  it('toda imagem do arc42 existe no repositório', () => {
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(existsSync(path.join(root, 'arc42', image)), image).toBe(true);
  });

  it('tem os prints que a entrega pede: Swaggers, frontend e API Gateway', () => {
    for (const print of [
      'swagger-bff',
      'swagger-notes-service',
      'swagger-safety-service',
      'swagger-function',
      'swagger-eventos-asyncapi',
      'swagger-api-gateway-bff',
      'chamadas-api-gateway',
      'front-fachada-notas',
      'front-seguranca-painel',
      'front-teste-seguro',
    ]) {
      expect(images, print).toContain(`prints/${print}.png`);
    }
    expect(images).toContain('../canvas/canvas.png');
  });

  it('no PDF, as imagens apontam para os arquivos e o C4 vem antes do Canvas e dos prints', () => {
    const sources = [...html.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]);
    expect(sources).toHaveLength(images.length);
    for (const source of sources) expect(existsSync(fileURLToPath(source)), source).toBe(true);
    const order = ['anexo-c4-model', 'anexo-canvas', 'anexo-prints-do-app-na-azure'].map((id) =>
      html.indexOf(`id="${id}"`),
    );
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('script dos prints', () => {
  it('lê os links da tabela do arc42', () => {
    const links = linksFromArc42(arc42);
    expect(links['Frontend']?.[0]).toMatch(/^https:\/\/.+azurestaticapps\.net$/);
    expect(links['Swagger do BFF']?.[0]).toMatch(/\/docs$/);
    expect(links['Swagger do API Gateway']?.length).toBe(4);
  });

  it('lê o azure.env sem exportar nada, com aspas e o CR do Windows', () => {
    expect(parseEnvFile('# comentário\r\nDEMO_PASSWORD="a b"\r\nDEMO_LOCK_CODE=12345678\r\n')).toEqual({
      DEMO_PASSWORD: 'a b',
      DEMO_LOCK_CODE: '12345678',
    });
  });

  it('a página das chamadas escapa o conteúdo e o JSON longo é cortado', () => {
    const page = callsPage([{ title: '<x>', method: 'GET', url: 'https://a/b', status: 401, body: '' }]);
    expect(page).toContain('&lt;x&gt;');
    expect(page).toContain('HTTP 401');
    const json = JSON.parse(compactJson(JSON.stringify({ items: [1, 2, 3, 4], text: 'a'.repeat(200) })));
    expect(json.items).toEqual([1, 2, '… mais 2']);
    expect(json.text).toHaveLength(161);
  });
});
