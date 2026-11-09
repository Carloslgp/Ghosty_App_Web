export const TOKEN_SERVICE = Symbol('TokenService');

export interface SignedToken {
  token: string;
  /** Segundos até vencer. */
  expiresIn: number;
}

export interface SafetyTokenClaims {
  sub: string;
  jti: string;
}

export interface Jwk {
  kty: 'RSA';
  use: 'sig';
  alg: 'RS256';
  kid: string;
  n: string;
  e: string;
}

/** JWTs RS256: o de acesso (15 minutos) e o da sessão segura (`scope=safety`). */
export interface TokenService {
  signAccessToken(accountId: string): Promise<SignedToken>;
  /** Devolve o `sub`, ou `null` se o token for inválido ou estiver vencido. */
  verifyAccessToken(token: string): Promise<string | null>;
  signSafetyToken(accountId: string, jti: string): Promise<SignedToken>;
  /** Com `ignoreExpiration`, aceita token vencido (o logout da área responde 204 mesmo assim). */
  verifySafetyToken(
    token: string,
    options?: { ignoreExpiration?: boolean },
  ): Promise<SafetyTokenClaims | null>;
  jwks(): Promise<{ keys: Jwk[] }>;
  readonly issuer: string;
}
