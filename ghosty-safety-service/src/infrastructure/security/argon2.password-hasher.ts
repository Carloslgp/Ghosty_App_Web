import { hash, verify, type Algorithm } from '@node-rs/argon2';
import type { PasswordHasher } from '../../application/ports/password-hasher.js';

/** Argon2id com a linha de base da OWASP: 19 MiB de memória, 2 iterações, paralelismo 1. */
const OPTIONS = {
  algorithm: 2 as Algorithm, // Argon2id (o enum do pacote é `const` e não pode ser importado como valor)
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
