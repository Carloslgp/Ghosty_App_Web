// Testes de arquitetura do microfrontend (archunit), no mesmo espírito dos backends:
// cada app é independente, o shell só conhece os remotes em tempo de execução (Module Federation)
// e só o pacote api-client fala com a rede, sempre com o BFF.
import { projectFiles, type CheckOptions, type FileInfo } from 'archunit';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// O archunit registra o matcher `toPassAsync` no `expect` global (por isso `globals: true` no Vitest).
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toPassAsync(options?: CheckOptions): Promise<void>;
  }
}

const STRICT: CheckOptions = { allowEmptyTests: false };
/** O primeiro teste monta o grafo de imports do projeto inteiro: com a cobertura ligada, leva segundos. */
const SLOW = { timeout: 60_000 };

const app = (name: string) => new RegExp(`^apps/${name}/src(?:/.*)?$`);
const apps = (...names: string[]) => new RegExp(`^apps/(?:${names.join('|')})/src(?:/.*)?$`);

/** Chamadas de rede feitas direto, fora do api-client. */
const NETWORK =
  /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bnew\s+EventSource\b|navigator\.sendBeacon/;
const withoutNetworkCalls = (file: FileInfo) => !NETWORK.test(file.content);

/**
 * Imports por nome de pacote (`@ghosty/...`) passam por um link em node_modules, que o grafo do
 * archunit não segue. Por isso essas fronteiras são conferidas pelos próprios imports do arquivo.
 */
function importsOf(file: FileInfo): string[] {
  const kind = file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, false, kind);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}
const withoutImports =
  (...packages: string[]) =>
  (file: FileInfo) =>
    importsOf(file).every((spec) => !packages.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`)));
const APP_PACKAGES = ['@ghosty/shell', '@ghosty/notes', '@ghosty/safety'];

describe('Arquitetura: microfrontends', SLOW, () => {
  it('o shell não importa o código dos remotes (eles chegam pelo Module Federation)', async () => {
    const rule = projectFiles()
      .inFolder(app('shell'))
      .shouldNot()
      .dependOnFiles()
      .inFolder(apps('notes', 'safety'));
    await expect(rule).toPassAsync(STRICT);
  });

  it('o remote notes (a fachada) não conhece o shell nem a área de segurança', async () => {
    const rule = projectFiles()
      .inFolder(app('notes'))
      .shouldNot()
      .dependOnFiles()
      .inFolder(apps('shell', 'safety'));
    await expect(rule).toPassAsync(STRICT);
  });

  it('o remote safety não conhece o shell nem a fachada', async () => {
    const rule = projectFiles()
      .inFolder(app('safety'))
      .shouldNot()
      .dependOnFiles()
      .inFolder(apps('shell', 'notes'));
    await expect(rule).toPassAsync(STRICT);
  });

  it('os apps não importam uns aos outros pelo nome do pacote', async () => {
    const rule = projectFiles()
      .inFolder(/^apps\/[^/]+\/src(?:\/.*)?$/)
      .should()
      .adhereTo(withoutImports(...APP_PACKAGES), `apps não importam ${APP_PACKAGES.join(', ')}`);
    await expect(rule).toPassAsync(STRICT);
  });

  it('os pacotes compartilhados não dependem dos apps', async () => {
    const byPath = projectFiles()
      .inFolder(/^packages\/[^/]+\/src(?:\/.*)?$/)
      .shouldNot()
      .dependOnFiles()
      .inFolder(/^apps\/.*$/);
    await expect(byPath).toPassAsync(STRICT);
    const byName = projectFiles()
      .inFolder(/^packages\/[^/]+\/src(?:\/.*)?$/)
      .should()
      .adhereTo(withoutImports(...APP_PACKAGES), `packages não importam ${APP_PACKAGES.join(', ')}`);
    await expect(byName).toPassAsync(STRICT);
  });

  it('packages/ui é só apresentação: não usa o api-client', async () => {
    const rule = projectFiles()
      .inFolder(/^packages\/ui\/src(?:\/.*)?$/)
      .should()
      .adhereTo(withoutImports('@ghosty/api-client'), 'packages/ui não importa @ghosty/api-client');
    await expect(rule).toPassAsync(STRICT);
  });
});

describe('Arquitetura: acesso ao backend', SLOW, () => {
  it('nenhum app chama a rede direto: tudo passa pelo api-client, que só conhece o BFF', async () => {
    const rule = projectFiles()
      .inFolder(/^apps\/[^/]+\/src(?:\/.*)?$/, { except: { inPath: ['**/*.test.ts', '**/*.test.tsx'] } })
      .should()
      .adhereTo(withoutNetworkCalls, 'apps não chamam fetch, XMLHttpRequest, WebSocket nem EventSource');
    await expect(rule).toPassAsync(STRICT);
  });
});

/** As chaves do bloco `shared` (ou do `SHARED` do shell) no vite.config.ts de um app. */
function sharedOf(name: string): string[] {
  const text = readFileSync(`apps/${name}/vite.config.ts`, 'utf8');
  const start = text.search(/shared: \{|SHARED = \{/);
  if (start < 0) return [];
  let depth = 0;
  let end = text.indexOf('{', start);
  for (let i = end; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') depth -= 1;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const block = text.slice(text.indexOf('{', start) + 1, end);
  return [...block.matchAll(/(?:'([^']+)'|([A-Za-z][\w-]*))\s*:\s*\{/g)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

describe('Arquitetura: Module Federation', () => {
  it('react, react-dom e react-query são um só (singleton) no shell e nos dois remotes', () => {
    for (const name of ['shell', 'notes', 'safety']) {
      expect(sharedOf(name), name).toEqual(
        expect.arrayContaining(['react', 'react-dom', '@tanstack/react-query']),
      );
    }
  });

  it('a fachada usa o roteador do shell, e a área segura tem o próprio (MemoryRouter, sem compartilhar)', () => {
    expect(sharedOf('shell')).toContain('react-router');
    expect(sharedOf('notes')).toContain('react-router');
    // Compartilhado, o MemoryRouter do safety enxergaria o roteador do shell e a área ficaria em branco.
    expect(sharedOf('safety')).not.toContain('react-router');
  });
});

describe('Arquitetura: dependências', SLOW, () => {
  it('não há dependências circulares nos apps e nos pacotes', async () => {
    const rule = projectFiles()
      .inFolder(/^(?:apps|packages)\/[^/]+\/src(?:\/.*)?$/)
      .should()
      .haveNoCycles();
    await expect(rule).toPassAsync(STRICT);
  });
});
