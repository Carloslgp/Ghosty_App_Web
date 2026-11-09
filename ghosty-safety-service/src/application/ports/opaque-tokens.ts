export const OPAQUE_TOKENS = Symbol('OpaqueTokens');

export interface OpaqueToken {
  /** O valor que vai para o cliente (32 bytes aleatórios em base64url, 43 caracteres). */
  token: string;
  /** O que fica no banco (SHA-256). */
  hash: string;
}

/** Tokens de convite e refresh tokens: o banco só guarda o hash. */
export interface OpaqueTokens {
  generate(): OpaqueToken;
  hash(token: string): string;
}
