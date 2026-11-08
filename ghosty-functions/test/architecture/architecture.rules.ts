// Regras de arquitetura compartilhadas (Clean Architecture + Vertical Slice), verificadas com o archunit.
// O original fica em config/architecture/architecture.rules.ts, na raiz do repositório. Cada projeto
// Node recebe uma cópia idêntica em test/architecture/ e chama `describeArchitecture` num arquivo
// `*.arch.spec.ts`. Não edite a cópia: edite o original e rode `node config/sync.mjs`.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectFiles, type CheckOptions, type FileInfo } from 'archunit';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// O archunit registra o matcher `toPassAsync` no `expect` global (por isso `globals: true` no Vitest).
// A assinatura de `Matchers` precisa ser idêntica à do Vitest instalado.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toPassAsync(options?: CheckOptions): Promise<void>;
  }
}

export interface ArchitectureOptions {
  /** Camada de entrada: `api` nos serviços NestJS e `functions` na Function App. */
  entryLayer: 'api' | 'functions';
  /**
   * Arquivos da camada de entrada que podem importar a infraestrutura (raiz de composição),
   * como padrões de caminho relativos à raiz do projeto. Ex.: `src/api/**\/*.module.ts`.
   * Use `['src/functions/**']` quando toda a camada de entrada monta as dependências.
   */
  compositionRoots: string[];
  /** Pacotes proibidos em `domain` e `application`, somados à lista padrão. */
  extraForbiddenPackages?: string[];
  /** Raiz do projeto. Padrão: o diretório atual (onde o Vitest roda). */
  rootDir?: string;
}

/** Pacotes de framework e de infraestrutura que nunca entram em `domain` nem em `application`. */
export const DEFAULT_FORBIDDEN_PACKAGES = [
  '@nestjs/*',
  '@azure/*',
  'typeorm',
  'mongodb',
  'mongoose',
  'mssql',
  'better-sqlite3',
  'express',
  'class-validator',
  'class-transformer',
];

const STRICT: CheckOptions = { allowEmptyTests: false };
const LENIENT: CheckOptions = { allowEmptyTests: true };

export function describeArchitecture(options: ArchitectureOptions): void {
  const rootDir = options.rootDir ?? process.cwd();
  const entry = `src/${options.entryLayer}`;
  const forbidden = [...DEFAULT_FORBIDDEN_PACKAGES, ...(options.extraForbiddenPackages ?? [])];
  const has = (folder: string) => listTsFiles(path.join(rootDir, folder)).length > 0;
  const slices = findSlices(rootDir);

  describe('Arquitetura: camadas', () => {
    it.skipIf(!has('src/domain'))(
      'domain não depende de application, infrastructure nem da entrada',
      async () => {
        const rule = projectFiles()
          .inFolder('src/domain/**')
          .shouldNot()
          .dependOnFiles()
          .inFolder(layerPattern(['application', 'infrastructure', options.entryLayer]));
        await expect(rule).toPassAsync(STRICT);
      },
    );

    it.skipIf(!has('src/domain'))('domain não importa frameworks nem infraestrutura', async () => {
      const rule = projectFiles()
        .inFolder('src/domain/**')
        .should()
        .adhereTo(withoutPackages(forbidden), `domain não importa ${forbidden.join(', ')}`);
      await expect(rule).toPassAsync(STRICT);
    });

    it.skipIf(!has('src/application'))(
      'application não depende de infrastructure nem da entrada',
      async () => {
        const rule = projectFiles()
          .inFolder('src/application/**')
          .shouldNot()
          .dependOnFiles()
          .inFolder(layerPattern(['infrastructure', options.entryLayer]));
        await expect(rule).toPassAsync(STRICT);
      },
    );

    it.skipIf(!has('src/application'))('application não importa frameworks nem infraestrutura', async () => {
      const rule = projectFiles()
        .inFolder('src/application/**')
        .should()
        .adhereTo(withoutPackages(forbidden), `application não importa ${forbidden.join(', ')}`);
      await expect(rule).toPassAsync(STRICT);
    });

    it.skipIf(!has('src/infrastructure'))(`infrastructure não depende de ${entry}`, async () => {
      const rule = projectFiles()
        .inFolder('src/infrastructure/**')
        .shouldNot()
        .dependOnFiles()
        .inFolder(layerPattern([options.entryLayer]));
      await expect(rule).toPassAsync(STRICT);
    });

    it.skipIf(!has(entry))(`${entry} só usa infrastructure nas raízes de composição`, async () => {
      const rule = projectFiles()
        .inFolder(`${entry}/**`, { except: { inPath: options.compositionRoots } })
        .shouldNot()
        .dependOnFiles()
        .inFolder(layerPattern(['infrastructure']));
      // Sem nenhum arquivo fora das raízes de composição, não há o que verificar.
      await expect(rule).toPassAsync(LENIENT);
    });
  });

  describe('Arquitetura: slices', () => {
    it.skipIf(slices.length < 2)('um caso de uso não importa outro', async () => {
      for (const slice of slices) {
        const others = slices.filter((other) => other !== slice);
        const rule = projectFiles()
          .inFolder(folderAndBelow(slice))
          .shouldNot()
          .dependOnFiles()
          .inFolder(new RegExp(`^(?:${others.map(escapeRegExp).join('|')})(?:/.*)?$`));
        await expect(rule).toPassAsync(STRICT);
      }
    });

    it.skipIf(!has('src'))('não há dependências circulares', async () => {
      const rule = projectFiles().inFolder('src/**').should().haveNoCycles();
      await expect(rule).toPassAsync(STRICT);
    });
  });

  describe('Arquitetura: nomes', () => {
    it('*.handler.ts só existe em application/features', async () => {
      const rule = projectFiles().withName('*.handler.ts').should().beInFolder('src/application/features/**');
      await expect(rule).toPassAsync(LENIENT);
    });

    it('*.controller.ts só existe em src/api', async () => {
      const rule = projectFiles().withName('*.controller.ts').should().beInFolder('src/api/**');
      await expect(rule).toPassAsync(LENIENT);
    });

    it('*.repository.ts só existe em infrastructure (implementação) ou application/ports (porta)', async () => {
      const rule = projectFiles()
        .withName('*.repository.ts')
        .should()
        .beInFolder(/^src\/(?:infrastructure|application\/ports)(?:\/.*)?$/);
      await expect(rule).toPassAsync(LENIENT);
    });
  });
}

/** Regex para as pastas `src/<camada>` e subpastas. */
function layerPattern(layers: string[]): RegExp {
  return new RegExp(`^src/(?:${layers.map(escapeRegExp).join('|')})(?:/.*)?$`);
}

function folderAndBelow(folder: string): RegExp {
  return new RegExp(`^${escapeRegExp(folder)}(?:/.*)?$`);
}

/** Condição do archunit: o arquivo não importa nenhum dos pacotes da lista (aceita `@escopo/*`). */
export function withoutPackages(packages: string[]): (file: FileInfo) => boolean {
  return (file) =>
    importedSpecifiers(file.content).every(
      (specifier) => !packages.some((pkg) => matchesPackage(specifier, pkg)),
    );
}

export function importedSpecifiers(source: string): string[] {
  return ts.preProcessFile(source, true, true).importedFiles.map((ref) => ref.fileName);
}

export function matchesPackage(specifier: string, pkg: string): boolean {
  if (pkg.endsWith('/*')) return specifier.startsWith(pkg.slice(0, -1));
  return specifier === pkg || specifier.startsWith(`${pkg}/`);
}

/** Um slice é uma pasta de `application/features` que tem um `*.handler.ts`. */
export function findSlices(rootDir: string): string[] {
  const featuresDir = path.join(rootDir, 'src', 'application', 'features');
  const handlers = listTsFiles(featuresDir).filter((file) => file.endsWith('.handler.ts'));
  const folders = handlers.map((file) =>
    path.relative(rootDir, path.dirname(file)).split(path.sep).join('/'),
  );
  return [...new Set(folders)].sort();
}

function listTsFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return listTsFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [full] : [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
