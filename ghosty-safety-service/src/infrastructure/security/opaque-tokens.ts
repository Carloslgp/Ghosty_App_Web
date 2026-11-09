import { createHash, randomBytes } from 'node:crypto';
import type { OpaqueToken, OpaqueTokens } from '../../application/ports/opaque-tokens.js';

/** 32 bytes aleatórios (256 bits) em base64url; o banco guarda só o SHA-256. */
export class RandomOpaqueTokens implements OpaqueTokens {
  generate(): OpaqueToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
