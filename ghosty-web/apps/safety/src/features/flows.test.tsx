import { createApiClient } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '../../../../test/msw-server';
import SafetyApp from '../App';
import InviteApp from '../Invite';
import { ApiContext } from './api';
import { CheckInScreen, nextOccurrence, validateCheckIn } from './check-in';
import { HOLD_MS, HoldButton } from './help';

const HELP = '01a1b2e9-6678-7ead-96cd-77eeda864fb3';
const CHECK_IN = '01a1b2e0-3300-7abf-90bf-07d69a5799b9';
const TOKEN = 'jKotp-mc9i8mlKGKyexO0wc181jY4RIorNnJu-kXiag';

const api = () =>
  createApiClient({ baseUrl: API, getAccessToken: () => 'jwt', getSafetyToken: () => 'seguro' });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function withApi(children: ReactNode) {
  return (
    <QueryClientProvider client={client()}>
      <ApiContext value={api()}>
        <MemoryRouter>{children}</MemoryRouter>
      </ApiContext>
    </QueryClientProvider>
  );
}

const aggregated = (confirmed = 1) => ({
  generatedAt: '2026-11-06T22:10:00Z',
  facade: null,
  safety: {
    network: { total: 1, confirmed, pending: 1 - confirmed, declined: 0, contacts: [] },
    alertSettings: { includeLocation: false, countdownSeconds: 5, reviewed: true },
    activeCheckIn: null,
    lastTest: { helpRequestId: HELP, at: new Date(Date.now() - 3 * 86_400_000).toISOString(), outcome: 'ok' },
  },
  readiness: { score: 80, level: 'ready', items: [], messagePreview: null },
  disabledFeatures: [
    { id: 'decoy-code', title: 'Código alternativo', reason: 'Planejado para uma próxima versão.' },
  ],
  sources: { notes: 'unavailable', safety: 'ok', readiness: 'ok' },
});

const helpRequest = (status: string, mode = 'real', steps: unknown[] = []) => ({
  id: HELP,
  origin: 'button',
  mode,
  status,
  location: null,
  checkInId: null,
  createdAt: new Date().toISOString(),
  dispatchedAt: status === 'triggered' ? null : new Date().toISOString(),
  steps,
});

const step = (outcome: string, nickname: string, channel = 'telegram') => ({
  id: `01a1b2e9-6e48-797f-9e3b-0ab38867${String(nickname.length).padStart(4, '0')}`,
  stepOrder: nickname === 'Ana' ? 1 : 2,
  contactId: '01a1596a-4860-7d3c-971c-a474b56c7ce7',
  contactNickname: nickname,
  channel,
  outcome,
  message: `Oi, ${nickname}. Aqui é Maria.`,
  errorCode: null,
  occurredAt: new Date().toISOString(),
});

afterEach(() => vi.useRealTimers());

describe('HoldButton', () => {
  it('só dispara depois de 2 segundos segurado; soltar ou sair antes cancela', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<HoldButton label="Pedir ajuda" onComplete={onComplete} />);
    const button = screen.getByRole('button', { name: 'Pedir ajuda' });
    expect(button).toHaveAccessibleDescription('Segure por 2 segundos');

    fireEvent.pointerDown(button);
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS - 1));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.pointerUp(button);
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.pointerDown(button);
    fireEvent.pointerLeave(button);
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.pointerDown(button);
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(HOLD_MS);
  });

  it('pelo teclado: segurar Espaço dispara; a repetição da tecla não reinicia; soltar antes cancela', async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<HoldButton label="Pedir ajuda" onComplete={onComplete} />);
    const button = screen.getByRole('button', { name: 'Pedir ajuda' });
    fireEvent.keyDown(button, { key: ' ' });
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    fireEvent.keyUp(button, { key: ' ' });
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.keyDown(button, { key: ' ' });
    await act(() => vi.advanceTimersByTimeAsync(1_500));
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('Pedido de ajuda (painel)', () => {
  const holdAndWait = async (name: string) => {
    fireEvent.pointerDown(screen.getByRole('button', { name }));
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
  };

  it('cancelar a contagem não chama a API', async () => {
    let posts = 0;
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(aggregated())),
      http.post(`${API}/safety/help-requests`, () => {
        posts += 1;
        return HttpResponse.json(helpRequest('triggered'), { status: 202 });
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SafetyApp api={api()} user={{ displayName: 'Maria' }} onQuickExit={vi.fn()} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    await screen.findByRole('button', { name: 'Pedir ajuda' });
    await holdAndWait('Pedir ajuda');
    expect(screen.getByText('Enviando em 5 s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(posts).toBe(0);
    expect(screen.getByRole('button', { name: 'Pedir ajuda' })).toBeInTheDocument();
  });

  it('segurar → contagem → POST com Idempotency-Key → linha do tempo de triggered a dispatched; "Foi engano"', async () => {
    const sent: { key: string | null; body: unknown }[] = [];
    let polls = 0;
    let cancelled = false;
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(aggregated(0))),
      http.post(`${API}/safety/help-requests`, async ({ request }) => {
        sent.push({ key: request.headers.get('idempotency-key'), body: await request.json() });
        return HttpResponse.json(helpRequest('triggered'), { status: 202 });
      }),
      http.get(`${API}/safety/help-requests/${HELP}`, () => {
        polls += 1;
        if (cancelled) return HttpResponse.json(helpRequest('cancelled'));
        return HttpResponse.json(
          polls < 2
            ? helpRequest('triggered')
            : helpRequest('dispatched', 'real', [step('sent', 'Ana'), step('failed', 'Beto', 'web')]),
        );
      }),
      http.post(`${API}/safety/help-requests/${HELP}/cancel`, () => {
        cancelled = true;
        return HttpResponse.json(helpRequest('cancelled'));
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SafetyApp api={api()} user={{ displayName: 'Maria' }} onQuickExit={vi.fn()} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    expect(await screen.findByText(/Nenhum contato confirmou o convite ainda/)).toBeInTheDocument();
    await holdAndWait('Pedir ajuda');
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(await screen.findByText('Avisando a sua rede…')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    // "Incluir localização" desligado: o pedido vai sem localização.
    expect(sent[0]?.body).toEqual({ mode: 'real' });
    expect(screen.getByText(/Contagem de 5 s/)).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(await screen.findByText('Avisos enviados')).toBeInTheDocument();
    expect(screen.getByText(/Telegram · Enviado/)).toBeInTheDocument();
    expect(screen.getByText(/Página web · Falhou/)).toBeInTheDocument();
    expect(screen.queryByText('Ensaio')).not.toBeInTheDocument();
    expect(screen.getAllByText(/não chama a polícia/).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Foi engano' }));
    expect(await screen.findByText('Marcado como engano')).toBeInTheDocument();
  });

  it('o painel mostra o último Teste seguro e os recursos desligados com o motivo', async () => {
    server.use(http.get(`${API}/aggregated-data`, () => HttpResponse.json(aggregated())));
    render(<SafetyApp api={api()} user={{ displayName: 'Maria' }} onQuickExit={vi.fn()} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    expect(await screen.findByText(/Último teste há 3 dias/)).toBeInTheDocument();
    expect(screen.getByText('Código alternativo')).toBeInTheDocument();
    expect(screen.getByText(/Planejado para uma próxima versão/)).toBeInTheDocument();
  });
});

describe('Teste seguro', () => {
  it('ensaia com mode test: selo "Ensaio", "Nada foi enviado" e cada passo "teria sido enviado"', async () => {
    let body: unknown;
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(aggregated())),
      http.get(`${API}/safety/alert-settings`, () =>
        HttpResponse.json({
          messageTemplate: 'Oi',
          includeLocation: true,
          countdownSeconds: 5,
          checkInToleranceMinutes: 10,
          reviewed: true,
          reviewedAt: null,
        }),
      ),
      http.post(`${API}/safety/help-requests`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(helpRequest('triggered', 'test'), { status: 202 });
      }),
      http.get(`${API}/safety/help-requests/${HELP}`, () =>
        HttpResponse.json(helpRequest('dispatched', 'test', [step('would_send', 'Ana')])),
      ),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<SafetyApp api={api()} user={{ displayName: 'Maria' }} onQuickExit={vi.fn()} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    fireEvent.click(await screen.findByRole('link', { name: 'Teste seguro' }));
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Ensaiar pedido de ajuda' }));
    await act(() => vi.advanceTimersByTimeAsync(HOLD_MS));
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(await screen.findByText('Ensaio concluído')).toBeInTheDocument();
    expect(screen.getByText('Ensaio')).toBeInTheDocument();
    expect(screen.getByText(/Nada foi enviado/)).toBeInTheDocument();
    expect(screen.getByText(/Telegram · Teria sido enviado/)).toBeInTheDocument();
    // Sem geolocalização no navegador de teste: o relatório avisa e o pedido segue sem o mapa.
    expect(screen.getByText(/Localização indisponível/)).toBeInTheDocument();
    expect(body).toEqual({ mode: 'test' });
  });

  it('ensaia o check-in com prazo de pouco mais de 1 minuto e retoma um ensaio já em andamento', async () => {
    const starts: { mode: string; toleranceMinutes: number; dueAt: string }[] = [];
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(aggregated())),
      http.get(`${API}/safety/alert-settings`, () =>
        HttpResponse.json({
          messageTemplate: 'Oi',
          includeLocation: false,
          countdownSeconds: 5,
          checkInToleranceMinutes: 10,
          reviewed: true,
          reviewedAt: null,
        }),
      ),
      http.post(`${API}/safety/check-ins`, async ({ request }) => {
        starts.push((await request.json()) as (typeof starts)[number]);
        return HttpResponse.json({ code: 'INVALID_STATE', status: 409 }, { status: 409 });
      }),
      http.get(`${API}/safety/check-ins`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('mode')).toBe('test');
        return HttpResponse.json({
          items: [
            {
              id: CHECK_IN,
              destination: 'Teste seguro',
              dueAt: new Date(Date.now() + 30_000).toISOString(),
              toleranceMinutes: 0,
              deadlineAt: new Date(Date.now() + 30_000).toISOString(),
              status: 'active',
              mode: 'test',
              version: 1,
              createdAt: new Date().toISOString(),
              confirmedAt: null,
              expiredAt: null,
              helpRequestId: null,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      }),
      http.get(`${API}/safety/check-ins/${CHECK_IN}`, () =>
        HttpResponse.json({
          id: CHECK_IN,
          destination: 'Teste seguro',
          dueAt: new Date(Date.now() + 30_000).toISOString(),
          toleranceMinutes: 0,
          deadlineAt: new Date(Date.now() + 30_000).toISOString(),
          status: 'active',
          mode: 'test',
          version: 1,
          createdAt: new Date().toISOString(),
          confirmedAt: null,
          expiredAt: null,
          helpRequestId: null,
        }),
      ),
    );
    render(<SafetyApp api={api()} user={{ displayName: 'Maria' }} onQuickExit={vi.fn()} />, {
      wrapper: ({ children }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>,
    });
    fireEvent.click(await screen.findByRole('link', { name: 'Teste seguro' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar ensaio do check-in' }));
    expect(await screen.findByText(/O prazo vence em \d+ s/)).toBeInTheDocument();
    expect(starts[0]).toMatchObject({ mode: 'test', toleranceMinutes: 0 });
    const lead = new Date(starts[0]!.dueAt).getTime() - Date.now();
    expect(lead).toBeGreaterThan(60_000);
    expect(lead).toBeLessThanOrEqual(70_000);
  });
});

describe('Check-in', () => {
  it('o horário vira o próximo HH:MM (hoje, ou amanhã se já passou)', () => {
    const now = new Date(2026, 10, 6, 22, 0, 0);
    expect(nextOccurrence('23:30', now)).toEqual(new Date(2026, 10, 6, 23, 30));
    expect(nextOccurrence('21:00', now)).toEqual(new Date(2026, 10, 7, 21, 0));
    expect(nextOccurrence('22:00', now)).toEqual(new Date(2026, 10, 7, 22, 0));
    expect(nextOccurrence('25:00', now)).toBeNull();
    expect(nextOccurrence('', now)).toBeNull();
  });

  it('valida destino, horário e tolerância', () => {
    const now = new Date(2026, 10, 6, 22, 0, 0);
    expect(validateCheckIn({ destination: ' ', time: '', toleranceMinutes: '90' }, now).errors).toEqual({
      destination: 'Informe para onde você vai.',
      time: 'Informe o horário em que pretende chegar.',
      toleranceMinutes: 'De 0 a 60 minutos.',
    });
    expect(
      validateCheckIn({ destination: 'x'.repeat(121), time: '23:00', toleranceMinutes: '1.5' }, now).errors,
    ).toMatchObject({ destination: 'Use até 120 caracteres.', toleranceMinutes: 'De 0 a 60 minutos.' });
    expect(
      validateCheckIn({ destination: ' Casa ', time: '23:30', toleranceMinutes: '0' }, now).value,
    ).toEqual({
      destination: 'Casa',
      dueAt: new Date(2026, 10, 6, 23, 30),
      toleranceMinutes: 0,
    });
  });

  it('sem check-in ativo: o formulário não chama a API com erro; com dados certos, inicia com Idempotency-Key', async () => {
    const started: { key: string | null; body: Record<string, unknown> }[] = [];
    let active = false;
    server.use(
      http.get(`${API}/safety/check-ins`, () =>
        HttpResponse.json({
          items: active
            ? [
                {
                  id: CHECK_IN,
                  destination: 'Casa',
                  dueAt: '2026-11-07T02:30:00Z',
                  toleranceMinutes: 10,
                  deadlineAt: '2026-11-07T02:40:00Z',
                  status: 'active',
                  mode: 'real',
                  version: 1,
                  createdAt: '2026-11-06T22:00:00Z',
                  confirmedAt: null,
                  expiredAt: null,
                  helpRequestId: null,
                },
              ]
            : [],
          page: 1,
          pageSize: 20,
          total: active ? 1 : 0,
        }),
      ),
      http.post(`${API}/safety/check-ins`, async ({ request }) => {
        started.push({
          key: request.headers.get('idempotency-key'),
          body: (await request.json()) as Record<string, unknown>,
        });
        active = true;
        return HttpResponse.json({ id: CHECK_IN }, { status: 201 });
      }),
    );
    render(withApi(<CheckInScreen defaultTolerance={10} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar check-in' }));
    expect(screen.getByText('Informe para onde você vai.')).toBeInTheDocument();
    expect(started).toHaveLength(0);

    await userEvent.type(screen.getByLabelText('Para onde você vai'), 'Casa');
    fireEvent.change(screen.getByLabelText('Horário em que pretende chegar'), { target: { value: '23:30' } });
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar check-in' }));
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(started[0]?.body).toMatchObject({ destination: 'Casa', toleranceMinutes: 10, mode: 'real' });
    expect(await screen.findByRole('heading', { name: 'Check-in ativo: Casa' })).toBeInTheDocument();
  });

  it('com check-in ativo: "Cheguei bem" confirma e "Mais 15 min" estende a partir do horário previsto', async () => {
    let confirmed = false;
    let extendedTo: string | undefined;
    const due = new Date(Date.now() + 60 * 60_000);
    server.use(
      http.get(`${API}/safety/check-ins`, () =>
        HttpResponse.json({
          items: confirmed
            ? []
            : [
                {
                  id: CHECK_IN,
                  destination: 'Casa',
                  dueAt: due.toISOString(),
                  toleranceMinutes: 10,
                  deadlineAt: new Date(due.getTime() + 10 * 60_000).toISOString(),
                  status: 'active',
                  mode: 'real',
                  version: 1,
                  createdAt: new Date().toISOString(),
                  confirmedAt: null,
                  expiredAt: null,
                  helpRequestId: null,
                },
              ],
          page: 1,
          pageSize: 20,
          total: confirmed ? 0 : 1,
        }),
      ),
      http.put(`${API}/safety/check-ins/${CHECK_IN}`, async ({ request }) => {
        extendedTo = ((await request.json()) as { dueAt: string }).dueAt;
        return HttpResponse.json({ id: CHECK_IN, version: 2 });
      }),
      http.post(`${API}/safety/check-ins/${CHECK_IN}/confirm`, () => {
        confirmed = true;
        return HttpResponse.json({ id: CHECK_IN, status: 'confirmed' });
      }),
    );
    render(withApi(<CheckInScreen />));
    await userEvent.click(await screen.findByRole('button', { name: 'Mais 15 min' }));
    await waitFor(() => expect(extendedTo).toBe(new Date(due.getTime() + 15 * 60_000).toISOString()));
    await userEvent.click(screen.getByRole('button', { name: 'Cheguei bem' }));
    expect(await screen.findByRole('button', { name: 'Iniciar check-in' })).toBeInTheDocument();
  });
});

describe('Página pública do convite', () => {
  const page = (overrides: Record<string, unknown> = {}) => ({
    inviterDisplayName: 'Maria',
    status: 'pending',
    channel: null,
    expiresAt: '2026-11-09T22:10:00Z',
    respondable: true,
    telegramUrl: `https://t.me/ghosty_dev_bot?start=${TOKEN}`,
    remoteUrl: 'http://localhost:5175/remoteEntry.js',
    ...overrides,
  });
  const renderInvite = () => render(<InviteApp api={createApiClient({ baseUrl: API })} token={TOKEN} />);

  it('mostra quem convidou e as 3 opções; aceitar pelo navegador vira o painel de avisos', async () => {
    let current = page();
    let accepted: unknown;
    server.use(
      http.get(`${API}/invitations/${TOKEN}`, () => HttpResponse.json(current)),
      http.post(`${API}/invitations/${TOKEN}/accept`, async ({ request }) => {
        accepted = await request.json();
        current = page({ status: 'confirmed', channel: 'web', respondable: false });
        return HttpResponse.json(current);
      }),
      http.get(`${API}/invitations/${TOKEN}/alerts`, () =>
        HttpResponse.json({
          items: [
            { helpRequestId: HELP, message: 'Oi, Beto. Aqui é Maria.', publishedAt: '2026-11-06T22:10:06Z' },
          ],
        }),
      ),
    );
    renderInvite();
    expect(
      await screen.findByRole('heading', { name: 'Maria quer ter você na rede de apoio' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar pelo Telegram' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Aceitar pelo navegador' }));
    expect(accepted).toEqual({ channel: 'web' });
    expect(await screen.findByText('Você está na rede de apoio de Maria')).toBeInTheDocument();
    expect(await screen.findByText('Oi, Beto. Aqui é Maria.')).toBeInTheDocument();
  });

  it('aceitar pelo Telegram mostra o link t.me e explica o Iniciar; recusar chama decline', async () => {
    let declined = false;
    server.use(
      http.get(`${API}/invitations/${TOKEN}`, () =>
        HttpResponse.json(declined ? page({ status: 'declined', respondable: false }) : page()),
      ),
      http.post(`${API}/invitations/${TOKEN}/accept`, () => HttpResponse.json(page())),
      http.post(`${API}/invitations/${TOKEN}/decline`, () => {
        declined = true;
        return HttpResponse.json(page({ status: 'declined', respondable: false }));
      }),
    );
    renderInvite();
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar pelo Telegram' }));
    expect(await screen.findByRole('link', { name: 'Abrir no Telegram' })).toHaveAttribute(
      'href',
      `https://t.me/ghosty_dev_bot?start=${TOKEN}`,
    );
    expect(screen.getByText(/toque em/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Escolher outra opção' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(await screen.findByText(/Você recusou o convite/)).toBeInTheDocument();
  });

  it('token desconhecido: tela neutra; vencido: pede um link novo', async () => {
    server.use(
      http.get(`${API}/invitations/${TOKEN}`, () =>
        HttpResponse.json({ code: 'NOT_FOUND', status: 404 }, { status: 404 }),
      ),
    );
    const { unmount } = renderInvite();
    expect(await screen.findByText('Este link não é válido.')).toBeInTheDocument();
    unmount();
    server.use(
      http.get(`${API}/invitations/${TOKEN}`, () =>
        HttpResponse.json({ code: 'INVITATION_EXPIRED', status: 410 }, { status: 410 }),
      ),
    );
    renderInvite();
    expect(await screen.findByText(/Este convite venceu/)).toBeInTheDocument();
  });
});
