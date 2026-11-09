import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnv } from '../config/env.js';
import { createDataSource } from './data-source.js';

/**
 * `npm run migration:run`: aplica as migrações pendentes no Azure SQL, da máquina de quem administra,
 * com o usuário admin (`MSSQL_USER`/`MSSQL_PASSWORD` do admin só nesta execução). A aplicação nunca roda
 * DDL. Com `--show`, só lista o que está pendente.
 */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv();
  if (env.DB_PROVIDER !== 'mssql') {
    process.stdout.write('DB_PROVIDER=sqlite: o esquema local é criado sozinho, não há migração a rodar.\n');
    return;
  }
  const { dataSource } = createDataSource({
    provider: 'mssql',
    mssql: {
      host: env.MSSQL_HOST,
      port: env.MSSQL_PORT,
      database: env.MSSQL_DATABASE,
      user: env.MSSQL_USER,
      password: env.MSSQL_PASSWORD,
    },
  });
  await dataSource.initialize();
  try {
    if (process.argv.includes('--show')) {
      const pending = await dataSource.showMigrations();
      process.stdout.write(pending ? 'Há migrações pendentes.\n' : 'Nenhuma migração pendente.\n');
      return;
    }
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    process.stdout.write(
      applied.length === 0
        ? 'Nenhuma migração pendente.\n'
        : `Migrações aplicadas: ${applied.map((migration) => migration.name).join(', ')}\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`\nFalha na migração: ${error instanceof Error ? error.message : String(error)}\n\n`);
  process.exit(1);
});
