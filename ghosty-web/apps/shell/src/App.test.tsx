import type { NotesAppProps, SafetyAppProps } from '@ghosty/api-client';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, server } from '../../../test/msw-server';
import { App } from './App';
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
};

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
  });
});
