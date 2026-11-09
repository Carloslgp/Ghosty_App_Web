import { describe, expect, it } from 'vitest';
import { InitialSchema1731110400000 } from '../../src/infrastructure/persistence/migrations/mssql/1731110400000-initial-schema.js';
import { buildSchemas } from '../../src/infrastructure/persistence/schemas.js';
import { AesGcmFieldCipher } from '../../src/infrastructure/security/aes-gcm.field-cipher.js';
import { Argon2PasswordHasher } from '../../src/infrastructure/security/argon2.password-hasher.js';
import { RandomOpaqueTokens } from '../../src/infrastructure/security/opaque-tokens.js';
import { DEV_ENCRYPTION_KEY, loadEnv } from '../../src/infrastructure/config/env.js';
import { TEST_KEY } from '../support/safety-kit.js';

const SQL = InitialSchema1731110400000.statements.join('\n');

describe('Migração do SQL Server', () => {
  it('cria toda tabela e coluna dos EntitySchema, com o tipo e a nulidade do SQL Server', () => {
    const typeOf = (column: { type?: unknown; length?: string | number }) => {
      const type = String(column.type);
      return column.length !== undefined ? `${type}(${String(column.length)})` : type;
    };
    for (const schema of Object.values(buildSchemas('mssql'))) {
      const table = schema.options.tableName as string;
      const block = SQL.split('CREATE TABLE').find((part) => part.trimStart().startsWith(`[${table}]`));
      expect(block, `tabela ${table}`).toBeDefined();
      for (const column of Object.values(schema.options.columns)) {
        const name = column?.name as string;
        const nullability = column?.nullable ? 'NULL' : 'NOT NULL';
        expect(block, `${table}.${name}`).toContain(`[${name}] ${typeOf(column as object)} ${nullability}`);
      }
    }
  });

  it('cria os índices e as restrições de unicidade dos EntitySchema', () => {
    for (const schema of Object.values(buildSchemas('mssql'))) {
      for (const index of [...(schema.options.indices ?? []), ...(schema.options.uniques ?? [])]) {
        expect(SQL).toContain(`[${index.name}]`);
      }
    }
  });
});

describe('Segurança', () => {
  it('AES-256-GCM: IV aleatório por valor, formato v1 e detecção de adulteração', () => {
    const cipher = new AesGcmFieldCipher(TEST_KEY);
    const a = cipher.encrypt('Ana');
    const b = cipher.encrypt('Ana');
    expect(a).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('Ana');
    expect(cipher.blindIndex('42')).toBe(cipher.blindIndex('42'));
    expect(cipher.blindIndex('42')).not.toBe(cipher.blindIndex('43'));
    const [v, iv, , data] = a.split(':');
    expect(() => cipher.decrypt([v, iv, Buffer.alloc(16).toString('base64'), data].join(':'))).toThrow();
    expect(() => cipher.decrypt('v2:x:y:z')).toThrow('formato desconhecido');
    expect(() => new AesGcmFieldCipher(Buffer.alloc(16).toString('base64'))).toThrow('32 bytes');
  });

  it('Argon2id com os parâmetros da OWASP', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('senha-forte-1');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(hash, 'senha-forte-1')).toBe(true);
    expect(await hasher.verify(hash, 'errada')).toBe(false);
    expect(await hasher.verify('não é hash', 'x')).toBe(false);
  });

  it('tokens opacos de 256 bits em base64url, com hash SHA-256', () => {
    const tokens = new RandomOpaqueTokens();
    const { token, hash } = tokens.generate();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens.hash(token)).toBe(hash);
  });
});

describe('Variáveis de ambiente', () => {
  const base = { INTERNAL_API_KEY: 'dev-internal-key', DATA_ENCRYPTION_KEY: DEV_ENCRYPTION_KEY };

  it('valores padrão da máquina local', () => {
    expect(loadEnv(base)).toMatchObject({
      PORT: 3002,
      DB_PROVIDER: 'sqlite',
      CODE_MAX_ATTEMPTS: 5,
      INVITE_TTL_HOURS: 72,
      MESSAGING_ENABLED: true,
    });
  });

  it('lista o que falta, sem mostrar valores', () => {
    expect(() => loadEnv({})).toThrow(/INTERNAL_API_KEY[\s\S]*DATA_ENCRYPTION_KEY/);
    expect(() => loadEnv({ ...base, DB_PROVIDER: 'mssql' })).toThrow(/MSSQL_HOST/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /desenvolvimento não vale em produção/,
    );
  });
});
