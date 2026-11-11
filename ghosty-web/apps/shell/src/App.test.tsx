import type { InviteAppProps, NotesAppProps, SafetyAppProps } from '@ghosty/api-client';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '../../../test/msw-server';
import { App } from './App';
import { AUTO_LOCK_MS } from './safety/useSafetyUnlock';
import { REFRESH_KEY } from './auth/AuthProvider';
import type { RemoteLoaders } from './notes/RemoteHosts';

const SESSION = {
  accessToken: 'jwt-1',
  tokenType: 'Bearer',
  expiresIn: 900,
  refreshToken: 'r'.repeat(43),
  refreshExpiresAt: '2026-11-13T12:00:00Z',
  user: { id: '01a15965-b480-79af-a113-29b2fc82e5ef', displayName: 'Maria', email: 'maria@example.com' },
};

/** Remotes falsos: no jsdom não há Module Federation. */
const loaders: RemoteLoaders = {
  notes: () =>
    Promise.resolve({
      default: ({ onSearchSubmit }: NotesAppProps) => (
        <div>
          <p>Lista de notas</p>
          <button onClick={() => onSearchSubmit('246810')}>buscar código</button>
          <button onClick={() => onSearchSubmit('mercado')}>buscar texto</button>
        </div>
      ),
    }),
  safety: () =>
    Promise.resolve({
      default: ({ onQuickExit, user }: SafetyAppProps) => (
        <div>
          <p>Área de {user.displayName}</p>
          <button onClick={onQuickExit}>Voltar às notas</button>
        </div>
      ),
    }),
  invite: (remoteUrl) => {
    invitedFrom.push(remoteUrl);
    return Promise.resolve({
      default: ({ token }: InviteAppProps) => <p>Convite {token.slice(0, 5)}</p>,
    });
  },
};

const invitedFrom: string[] = [];
const TOKEN = 'jKotp-mc9i8mlKGKyexO0wc181jY4RIorNnJu-kXiag';

function renderAt(path: string) {
  window.history.pushState(null, '', path);
  return render(<App config={{ apiBaseUrl: API, subscriptionKey: '' }} loaders={loaders} />);
}

describe('shell', () => {
  beforeEach(() => {
    server.use(http.post(`${API}/auth/refresh`, () => HttpResponse.json(SESSION)));
  });

  it('sem sessão, manda para Entrar; login certo abre as notas e guarda o refresh token', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.json(SESSION)));
    renderAt('/');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'maria@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-1');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Lista de notas')).toBeInTheDocument();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBe(SESSION.refreshToken);
    expect(document.title).not.toMatch(/ghosty|segurança/i);
  });

  it('login errado mostra a mensagem, sem dizer se o e-mail existe', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json({ code: 'UNAUTHENTICATED', status: 401 }, { status: 401 }),
      ),
    );
    renderAt('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'x@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('tentativas demais (429) pedem para esperar, e serviço fora do ar não vira "senha incorreta"', async () => {
    let status = 429;
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { code: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE', status },
          { status },
        ),
      ),
    );
    renderAt('/entrar');
    await userEvent.type(await screen.findByLabelText('E-mail'), 'x@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'qualquer');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/Muitas tentativas seguidas/)).toBeInTheDocument();
    status = 503;
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText(/Não foi possível entrar agora/)).toBeInTheDocument();
    expect(screen.queryByText('E-mail ou senha incorretos.')).not.toBeInTheDocument();
  });

  it('criar conta valida os campos e mostra e-mail já cadastrado no campo', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json({ code: 'EMAIL_IN_USE', status: 409 }, { status: 409 }),
      ),
    );
    renderAt('/cadastro');
    await userEvent.click(await screen.findByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Informe seu nome')).toBeInTheDocument();
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nome'), 'Maria');
    await userEvent.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-1');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Já existe uma conta com este e-mail.')).toBeInTheDocument();
  });

  it('com refresh token guardado, continua conectado', async () => {
    window.localStorage.setItem(REFRESH_KEY, 'r'.repeat(43));
    renderAt('/');
    expect(await screen.findByText('Lista de notas')).toBeInTheDocument();
  });

  it('configurações: senha atual errada aparece no campo; código certo é salvo', async () => {
    window.localStorage.setItem(REFRESH_KEY, 'r'.repeat(43));
    let attempts = 0;
    server.use(
      http.put(`${API}/account/lock-code`, async ({ request }) => {
        attempts += 1;
        const body = (await request.json()) as { currentPassword: string };
        if (body.currentPassword !== 'senha-forte-1') {
          return HttpResponse.json(
            {
              code: 'VALIDATION_FAILED',
              status: 400,
              errors: [{ field: 'currentPassword', message: 'senha atual incorreta' }],
            },
            { status: 400 },
          );
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderAt('/configuracoes');
    const type = async (label: string, value: string) => {
      const input = await screen.findByLabelText(label);
      await userEvent.clear(input);
      await userEvent.type(input, value);
    };
    await type('Novo código', '123');
    await type('Repita o código', '123');
    await type('Senha atual', 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar código' }));
    expect(await screen.findByText('Use de 6 a 8 dígitos')).toBeInTheDocument();
    expect(attempts).toBe(0);

    await type('Novo código', '246810');
    await type('Repita o código', '246810');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar código' }));
    expect(await screen.findByText('Senha atual incorreta')).toBeInTheDocument();

    await type('Senha atual', 'senha-forte-1');
    await type('Novo código', '246810');
    await type('Repita o código', '246810');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar código' }));
    expect(await screen.findByText('Código salvo.')).toBeInTheDocument();
  });

  it('excluir conta pede confirmação, apaga e volta para Entrar', async () => {
    window.localStorage.setItem(REFRESH_KEY, 'r'.repeat(43));
    server.use(http.delete(`${API}/account`, () => new HttpResponse(null, { status: 204 })));
    renderAt('/configuracoes');
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir conta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Excluir definitivamente' }));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(window.localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  describe('convite público (/c/:token)', () => {
    beforeEach(() => {
      invitedFrom.length = 0;
    });

    it('sem login: com token válido, carrega o remote do convite com a URL que o BFF devolveu', async () => {
      server.use(
        http.get(`${API}/invitations/${TOKEN}`, () =>
          HttpResponse.json({
            inviterDisplayName: 'Maria',
            status: 'pending',
            channel: null,
            expiresAt: '2026-11-09T22:10:00Z',
            respondable: true,
            telegramUrl: `https://t.me/bot?start=${TOKEN}`,
            remoteUrl: 'https://remoto.example/remoteEntry.js',
          }),
        ),
      );
      renderAt(`/c/${TOKEN}`);
      expect(await screen.findByText('Convite jKotp')).toBeInTheDocument();
      expect(invitedFrom).toEqual(['https://remoto.example/remoteEntry.js']);
      expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument();
    });

    it('token desconhecido ou malformado: tela neutra, sem baixar o remote', async () => {
      server.use(
        http.get(`${API}/invitations/${TOKEN}`, () =>
          HttpResponse.json({ code: 'NOT_FOUND', status: 404 }, { status: 404 }),
        ),
      );
      renderAt(`/c/${TOKEN}`);
      expect(await screen.findByText('Este link não é válido.')).toBeInTheDocument();
      renderAt('/c/curto');
      expect(await screen.findAllByText('Este link não é válido.')).toHaveLength(2);
      expect(invitedFrom).toEqual([]);
    });

    it('convite vencido: avisa para pedir um link novo', async () => {
      server.use(
        http.get(`${API}/invitations/${TOKEN}`, () =>
          HttpResponse.json({ code: 'INVITATION_EXPIRED', status: 410 }, { status: 410 }),
        ),
      );
      renderAt(`/c/${TOKEN}`);
      expect(await screen.findByText(/Este convite venceu/)).toBeInTheDocument();
      expect(invitedFrom).toEqual([]);
    });
  });

  describe('desbloqueio pela busca', () => {
    beforeEach(() => window.localStorage.setItem(REFRESH_KEY, 'r'.repeat(43)));

    it('texto comum nunca chama o BFF; código errado não muda nada na tela', async () => {
      let unlocks = 0;
      server.use(
        http.post(`${API}/safety/session`, () => {
          unlocks += 1;
          return HttpResponse.json({ code: 'FORBIDDEN', status: 403 }, { status: 403 });
        }),
      );
      renderAt('/');
      await userEvent.click(await screen.findByRole('button', { name: 'buscar texto' }));
      expect(unlocks).toBe(0);
      await userEvent.click(screen.getByRole('button', { name: 'buscar código' }));
      await waitFor(() => expect(unlocks).toBe(1));
      expect(screen.getByText('Lista de notas')).toBeInTheDocument();
    });

    it('código certo abre a área (a URL continua /); a saída rápida revoga e volta às notas', async () => {
      let lockedWith: string | null = null;
      server.use(
        http.post(`${API}/safety/session`, () =>
          HttpResponse.json({
            safetyToken: 'seguro-1',
            expiresIn: 600,
            remoteUrl: 'http://localhost:5175/remoteEntry.js',
          }),
        ),
        http.delete(`${API}/safety/session`, ({ request }) => {
          lockedWith = request.headers.get('x-safety-token');
          return new HttpResponse(null, { status: 204 });
        }),
      );
      renderAt('/');
      await userEvent.click(await screen.findByRole('button', { name: 'buscar código' }));
      expect(await screen.findByText('Área de Maria')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/');

      await userEvent.click(screen.getByRole('button', { name: 'Voltar às notas' }));
      expect(await screen.findByText('Lista de notas')).toBeInTheDocument();
      // O BFF recebe o token para revogar a sessão no servidor.
      await waitFor(() => expect(lockedWith).toBe('seguro-1'));
    });

    describe('aba oculta', () => {
      afterEach(() => {
        vi.useRealTimers();
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      });

      const setVisibility = (state: 'hidden' | 'visible') => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
        document.dispatchEvent(new Event('visibilitychange'));
      };

      it('oculta por mais de 2 minutos, a área tranca sozinha; voltar antes disso não tranca', async () => {
        server.use(
          http.post(`${API}/safety/session`, () =>
            HttpResponse.json({
              safetyToken: 'seguro-2',
              expiresIn: 600,
              remoteUrl: 'http://x/remoteEntry.js',
            }),
          ),
          http.delete(`${API}/safety/session`, () => new HttpResponse(null, { status: 204 })),
        );
        renderAt('/');
        await userEvent.click(await screen.findByRole('button', { name: 'buscar código' }));
        expect(await screen.findByText('Área de Maria')).toBeInTheDocument();

        vi.useFakeTimers();
        setVisibility('hidden');
        await act(() => vi.advanceTimersByTimeAsync(AUTO_LOCK_MS - 1_000));
        setVisibility('visible');
        await act(() => vi.advanceTimersByTimeAsync(AUTO_LOCK_MS));
        expect(screen.getByText('Área de Maria')).toBeInTheDocument();

        setVisibility('hidden');
        await act(() => vi.advanceTimersByTimeAsync(AUTO_LOCK_MS));
        vi.useRealTimers();
        expect(await screen.findByText('Lista de notas')).toBeInTheDocument();
      });
    });
  });
});
