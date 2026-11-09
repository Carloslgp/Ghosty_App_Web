import type { NotesServiceClient } from '../../application/ports/notes-service.client.js';
import type {
  IssuedRefreshToken,
  Json,
  SafetyAccount,
  SafetyServiceClient,
  UpstreamResponse,
} from '../../application/ports/safety-service.client.js';
import type { RequestMeta } from '../../application/ports/upstream-error.js';
import type { ServiceHttpClient } from './service-http.client.js';

const id = (value: string) => encodeURIComponent(value);

export class SafetyServiceHttpClient implements SafetyServiceClient {
  constructor(private readonly http: ServiceHttpClient) {}

  private async json<T>(
    method: string,
    path: string,
    meta: RequestMeta,
    body?: Json,
    authCall = false,
  ): Promise<T> {
    return (await this.http.call(method, path, { meta, body, authCall })).body as T;
  }

  createAccount(input: { email: string; displayName: string; password: string }, meta: RequestMeta) {
    return this.json<SafetyAccount>('POST', '/accounts', meta, input);
  }

  authenticate(input: { email: string; password: string }, meta: RequestMeta) {
    return this.json<SafetyAccount>('POST', '/accounts/authenticate', meta, input, true);
  }

  getAccount(accountId: string, meta: RequestMeta) {
    return this.json<SafetyAccount>('GET', `/accounts/${id(accountId)}`, meta);
  }

  updateAccount(accountId: string, input: { displayName: string }, meta: RequestMeta) {
    return this.json<SafetyAccount>('PUT', `/accounts/${id(accountId)}`, meta, input);
  }

  async deleteAccount(accountId: string, meta: RequestMeta): Promise<void> {
    await this.http.call('DELETE', `/accounts/${id(accountId)}`, { meta });
  }

  async setSecretCode(
    accountId: string,
    input: { currentPassword: string; code: string },
    meta: RequestMeta,
  ) {
    await this.http.call('PUT', `/accounts/${id(accountId)}/secret-code`, { meta, body: input });
  }

  async verifySecretCode(accountId: string, code: string, meta: RequestMeta): Promise<void> {
    await this.http.call('POST', `/accounts/${id(accountId)}/secret-code/verify`, {
      meta,
      body: { code },
      authCall: true,
    });
  }

  issueRefreshToken(accountId: string, meta: RequestMeta) {
    return this.json<IssuedRefreshToken>('POST', '/refresh-tokens', meta, { accountId });
  }

  rotateRefreshToken(token: string, meta: RequestMeta) {
    return this.json<IssuedRefreshToken>('POST', '/refresh-tokens/rotate', meta, { token }, true);
  }

  async revokeRefreshToken(token: string, meta: RequestMeta): Promise<void> {
    await this.http.call('POST', '/refresh-tokens/revoke', { meta, body: { token } });
  }

  forUser(
    accountId: string,
    method: string,
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<UpstreamResponse> {
    return this.http.call(method, path, { userId: accountId, body, meta });
  }
}

export class NotesServiceHttpClient implements NotesServiceClient {
  constructor(private readonly http: ServiceHttpClient) {}

  forUser(
    accountId: string,
    method: string,
    path: string,
    body: Json | undefined,
    meta: RequestMeta,
  ): Promise<UpstreamResponse> {
    return this.http.call(method, path, { userId: accountId, body, meta });
  }
}
