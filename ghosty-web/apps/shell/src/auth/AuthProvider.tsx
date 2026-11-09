import { createApiClient, type ApiClient, type Schemas } from '@ghosty/api-client';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ShellConfig } from '../config';

type AuthSession = Schemas['AuthSession'];
export type SessionUser = AuthSession['user'];

/** Chave neutra: o refresh token é o "continuar conectado" do app de notas. */
export const REFRESH_KEY = 'notas.sessao';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  api: ApiClient;
  login: (email: string, password: string) => Promise<'ok' | 'invalid'>;
  register: (input: {
    displayName: string;
    email: string;
    password: string;
  }) => Promise<'ok' | 'email-in-use'>;
  logout: () => Promise<void>;
  /** Esquece a sessão sem chamar o BFF (conta apagada). */
  forget: () => void;
  /** Token da sessão segura, só em memória. */
  getSafetyToken: () => string | null;
  setSafetyToken: (token: string | null) => void;
  /** O shell avisa aqui o que fazer num 403 da área de segurança. */
  setSafetyForbiddenHandler: (handler: (() => void) | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Os tokens ficam só aqui, em memória (nunca em estado do React nem em armazenamento). */
class TokenVault {
  private accessToken: string | null = null;
  private safetyToken: string | null = null;
  private forbiddenHandler: (() => void) | null = null;
  private pending: Promise<string | null> | null = null;

  get access(): string | null {
    return this.accessToken;
  }

  get safety(): string | null {
    return this.safetyToken;
  }

  setAccess(token: string | null): void {
    this.accessToken = token;
  }

  setSafety(token: string | null): void {
    this.safetyToken = token;
  }

  setForbidden(handler: (() => void) | null): void {
    this.forbiddenHandler = handler;
  }

  forbidden(): void {
    this.forbiddenHandler?.();
  }

  /** Várias chamadas com 401 ao mesmo tempo esperam a mesma renovação (o refresh token é de uso único). */
  once(run: () => Promise<string | null>): Promise<string | null> {
    this.pending ??= run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
}

function readRefresh(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefresh(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(REFRESH_KEY, token);
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Sem armazenamento (modo privado restrito): a sessão vale só enquanto a aba estiver aberta.
  }
}

/**
 * Dono da sessão: o JWT de acesso fica só em memória, o refresh token no `localStorage` (para
 * "continuar conectado") e o token da sessão segura nunca sai da memória. Os remotes recebem só o
 * `ApiClient`, que já coloca os cabeçalhos e renova o JWT.
 */
export function AuthProvider({ config, children }: { config: ShellConfig; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (readRefresh() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [vault] = useState(() => new TokenVault());

  const apply = useCallback(
    (session: AuthSession) => {
      vault.setAccess(session.accessToken);
      writeRefresh(session.refreshToken);
      setUser(session.user);
      setStatus('authenticated');
    },
    [vault],
  );

  const clear = useCallback(() => {
    vault.setAccess(null);
    vault.setSafety(null);
    writeRefresh(null);
    setUser(null);
    setStatus('anonymous');
  }, [vault]);

  // Cliente sem renovação, usado só para a própria renovação (evita recursão).
  const bare = useMemo(
    () => createApiClient({ baseUrl: config.apiBaseUrl, subscriptionKey: config.subscriptionKey }),
    [config],
  );

  const refresh = useCallback((): Promise<string | null> => {
    return vault.once(async () => {
      const refreshToken = readRefresh();
      if (!refreshToken) return null;
      const { data } = await bare.POST('/auth/refresh', { body: { refreshToken } });
      if (!data) {
        clear();
        return null;
      }
      apply(data);
      return data.accessToken;
    });
  }, [apply, bare, clear, vault]);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBaseUrl,
        subscriptionKey: config.subscriptionKey,
        getAccessToken: () => vault.access,
        refreshAccessToken: refresh,
        getSafetyToken: () => vault.safety,
        onSafetyForbidden: () => vault.forbidden(),
      }),
    [config, refresh, vault],
  );

  // Ao abrir o app: com refresh token guardado, tenta continuar conectado.
  useEffect(() => {
    let active = true;
    if (!readRefresh()) return;
    void refresh().then((token) => {
      if (active && !token) setStatus('anonymous');
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      api,
      async login(email, password) {
        const { data } = await bare.POST('/auth/login', { body: { email, password } });
        if (!data) return 'invalid';
        apply(data);
        return 'ok';
      },
      async register(input) {
        const { data, response } = await bare.POST('/auth/register', { body: input });
        if (data) {
          apply(data);
          return 'ok';
        }
        if (response.status === 409) return 'email-in-use';
        throw new Error('Não foi possível criar a conta agora.');
      },
      async logout() {
        const refreshToken = readRefresh();
        clear();
        if (refreshToken) await bare.POST('/auth/logout', { body: { refreshToken } }).catch(() => undefined);
      },
      forget: clear,
      getSafetyToken: () => vault.safety,
      setSafetyToken(token) {
        vault.setSafety(token);
      },
      setSafetyForbiddenHandler(handler) {
        vault.setForbidden(handler);
      },
    }),
    [api, apply, bare, clear, status, user, vault],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth precisa estar dentro do AuthProvider.');
  return value;
}
