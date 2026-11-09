export const PASSWORD_HASHER = Symbol('PasswordHasher');

/** Hash de senhas e do código secreto (Argon2id). */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
}
