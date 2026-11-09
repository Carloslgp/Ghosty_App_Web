import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { InitialSchema1731110400000 } from './migrations/mssql/1731110400000-initial-schema.js';
import { buildSchemas, type DbProvider, type Schemas } from './schemas.js';

export interface DatabaseOptions {
  provider: DbProvider;
  /** Arquivo do SQLite, ou `:memory:` nos testes. */
  sqlitePath?: string;
  mssql?: { host: string; port: number; database: string; user: string; password: string };
  /** Pool mínimo 0 e conexões ociosas fechadas: o Azure SQL serverless consegue pausar. */
  poolMin?: number;
  poolIdleMs?: number;
}

export const MSSQL_MIGRATIONS = [InitialSchema1731110400000];

/**
 * - `sqlite` (máquina local e testes): o esquema é sincronizado automaticamente.
 * - `mssql` (Azure SQL): `synchronize` desligado; as migrações de `migrations/mssql` rodam na subida.
 * O driver do SQLite (`better-sqlite3`) é devDependency e só é carregado com `sqlite`.
 */
export function createDataSource(options: DatabaseOptions): { dataSource: DataSource; schemas: Schemas } {
  const schemas = buildSchemas(options.provider);
  const entities = Object.values(schemas);
  let config: DataSourceOptions;

  if (options.provider === 'sqlite') {
    const database = options.sqlitePath ?? ':memory:';
    if (database !== ':memory:') mkdirSync(path.dirname(path.resolve(database)), { recursive: true });
    config = { type: 'better-sqlite3', database, entities, synchronize: true };
  } else {
    const mssql = options.mssql;
    if (!mssql) throw new Error('Faltam as opções do SQL Server.');
    config = {
      type: 'mssql',
      host: mssql.host,
      port: mssql.port,
      database: mssql.database,
      username: mssql.user,
      password: mssql.password,
      entities,
      synchronize: false,
      migrations: MSSQL_MIGRATIONS,
      migrationsRun: true,
      options: { encrypt: true, trustServerCertificate: false },
      pool: { min: options.poolMin ?? 0, idleTimeoutMillis: options.poolIdleMs ?? 30_000 },
    };
  }

  return { dataSource: new DataSource(config), schemas };
}
