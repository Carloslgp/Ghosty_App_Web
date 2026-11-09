import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { decodeJwt, exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import type {
  Jwk,
  SafetyTokenClaims,
  SignedToken,
  TokenService,
} from '../../application/ports/token-service.js';

export const SAFETY_SCOPE = 'safety';

type SigningKey = KeyObject | Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export interface TokenServiceOptions {
  /** PKCS#8 em PEM. Sem ela, gera um par temporário (só fora de produção): os tokens morrem no restart. */
  privateKeyPem?: string;
  keyId: string;
  issuer: string;
  audience: string;
  accessTtlSeconds: number;
  /** Validade absoluta do token da sessão segura; a janela de inatividade fica no registro de sessões. */
  safetyMaxSeconds: number;
}

/** JWT RS256 com `kid` no cabeçalho. A chave pública sai no JWKS para o `validate-jwt` do APIM. */
export class JoseTokenService implements TokenService {
  private constructor(
    private readonly privateKey: SigningKey,
    private readonly publicKey: SigningKey,
    private readonly options: TokenServiceOptions,
    readonly ephemeral: boolean,
  ) {}

  static async create(options: TokenServiceOptions): Promise<JoseTokenService> {
    if (options.privateKeyPem) {
      const privateKey = createPrivateKey(options.privateKeyPem);
      return new JoseTokenService(privateKey, createPublicKey(privateKey), options, false);
    }
    const pair = await generateKeyPair('RS256', { extractable: true });
    return new JoseTokenService(pair.privateKey, pair.publicKey, options, true);
  }

  get issuer(): string {
    return this.options.issuer;
  }

  private sign(subject: string, ttlSeconds: number, claims: JWTPayload = {}): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.options.keyId, typ: 'JWT' })
      .setSubject(subject)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.privateKey);
  }

  async signAccessToken(accountId: string): Promise<SignedToken> {
    return {
      token: await this.sign(accountId, this.options.accessTtlSeconds),
      expiresIn: this.options.accessTtlSeconds,
    };
  }

  async verifyAccessToken(token: string): Promise<string | null> {
    const payload = await this.verify(token);
    // O token da sessão segura não serve como JWT de acesso.
    if (!payload?.sub || payload.scope !== undefined) return null;
    return payload.sub;
  }

  async signSafetyToken(accountId: string, jti: string): Promise<SignedToken> {
    const token = await this.sign(accountId, this.options.safetyMaxSeconds, { scope: SAFETY_SCOPE, jti });
    return { token, expiresIn: this.options.safetyMaxSeconds };
  }

  async verifySafetyToken(
    token: string,
    options: { ignoreExpiration?: boolean } = {},
  ): Promise<SafetyTokenClaims | null> {
    let currentDate: Date | undefined;
    if (options.ignoreExpiration) {
      try {
        const iat = decodeJwt(token).iat;
        currentDate = typeof iat === 'number' ? new Date(iat * 1000) : undefined;
      } catch {
        return null;
      }
    }
    const payload = await this.verify(token, currentDate);
    if (!payload?.sub || payload.scope !== SAFETY_SCOPE || typeof payload.jti !== 'string') return null;
    return { sub: payload.sub, jti: payload.jti };
  }

  private async verify(token: string, currentDate?: Date): Promise<JWTPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['RS256'],
        currentDate,
      });
      return payload;
    } catch {
      return null;
    }
  }

  async jwks(): Promise<{ keys: Jwk[] }> {
    const jwk = await exportJWK(this.publicKey);
    return {
      keys: [
        { kty: 'RSA', use: 'sig', alg: 'RS256', kid: this.options.keyId, n: jwk.n ?? '', e: jwk.e ?? '' },
      ],
    };
  }
}
