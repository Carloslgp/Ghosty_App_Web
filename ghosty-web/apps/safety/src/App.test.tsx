import { createApiClient } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, server } from '../../../test/msw-server';
import SafetyApp from './App';
import { PREVIEW_DEBOUNCE_MS } from './features/components';

const AGGREGATED = {
  generatedAt: '2026-11-06T22:10:00Z',
  facade: { totalNotes: 3, pinned: 1, updatedLast14Days: 3, remindersToday: 0 },
  safety: {
    network: { total: 1, confirmed: 1, pending: 0, declined: 0, contacts: [] },
    alertSettings: { includeLocation: true, countdownSeconds: 10, reviewed: true },
    activeCheckIn: null,
    lastTest: null,
  },
  readiness: {
    score: 55,
    level: 'almost',
    items: [
      {
        id: 'recent-test',
        ok: false,
        weight: 20,
        text: 'Nenhum Teste seguro feito ainda',
        recommendation: 'Faça um Teste seguro.',
      },
    ],
    messagePreview: null,
  },
  disabledFeatures: [
    { id: 'web-push', reason: 'Planejado. Hoje a página web do contato precisa estar aberta.' },
  ],
  sources: { notes: 'ok', safety: 'ok', readiness: 'fallback' },
};

const contact = (id: string, nickname: string, position: number) => ({
  id,
  nickname,
  position,
  status: 'pending',
  channel: null,
  inviteExpiresAt: null,
  respondedAt: null,
  createdAt: '2026-11-01T10:00:00Z',
});
const ANA = contact('01a1596a-4860-7d3c-971c-a474b56c7ce7', 'Ana', 1);
const BETO = contact('01a1596b-32c0-78b2-b54a-d7fa1a1e7fa2', 'Beto', 2);

function renderSafety(onQuickExit = vi.fn()) {
  const api = createApiClient({ baseUrl: API, getAccessToken: () => 'jwt', getSafetyToken: () => 'seguro' });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafetyApp api={api} user={{ displayName: 'Maria' }} onQuickExit={onQuickExit} />
    </QueryClientProvider>,
  );
  return { onQuickExit };
}

describe('remote safety', () => {
  afterEach(() => vi.useRealTimers());

  it('abre no painel com a prontidão, o aviso de cálculo simplificado e os recursos desligados', async () => {
    server.use(http.get(`${API}/aggregated-data`, () => HttpResponse.json(AGGREGATED)));
    renderSafety();
    expect(await screen.findByRole('heading', { name: 'Prontidão: 55 de 100' })).toBeInTheDocument();
    expect(screen.getByText('Quase pronta')).toBeInTheDocument();
    expect(screen.getByText(/Cálculo simplificado/)).toBeInTheDocument();
    expect(screen.getByText(/Planejado. Hoje a página web/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /190/ })).toHaveAttribute('href', 'tel:190');
  });

  it('a saída rápida funciona pelo botão e por Esc duas vezes em até 1 segundo', async () => {
    server.use(http.get(`${API}/aggregated-data`, () => HttpResponse.json(AGGREGATED)));
    const { onQuickExit } = renderSafety();
    await userEvent.click(screen.getByRole('button', { name: 'Voltar às notas' }));
    expect(onQuickExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onQuickExit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onQuickExit).toHaveBeenCalledTimes(2);
  });

  it('rede: reordenar chama PUT /safety/contacts/order com a nova ordem; convite mostra o link', async () => {
    let order: string[] | undefined;
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(AGGREGATED)),
      http.get(`${API}/safety/contacts`, () => HttpResponse.json({ items: [ANA, BETO] })),
      http.put(`${API}/safety/contacts/order`, async ({ request }) => {
        order = ((await request.json()) as { contactIds: string[] }).contactIds;
        return HttpResponse.json({
          items: [
            { ...BETO, position: 1 },
            { ...ANA, position: 2 },
          ],
        });
      }),
      http.post(`${API}/safety/contacts/${ANA.id}/invitation`, () =>
        HttpResponse.json(
          {
            contactId: ANA.id,
            token: 't'.repeat(43),
            inviteUrl: `http://localhost:5173/c/${'t'.repeat(43)}`,
            telegramUrl: 'https://t.me/x',
            expiresAt: '2026-11-09T22:10:00Z',
          },
          { status: 201 },
        ),
      ),
    );
    renderSafety();
    await userEvent.click(screen.getByRole('link', { name: 'Rede de apoio' }));
    expect(await screen.findByText('1. Ana')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir Ana' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Descer Ana' }));
    await waitFor(() => expect(order).toEqual([BETO.id, ANA.id]));
    expect(await screen.findByText('1. Beto')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Gerar convite' })[1]!);
    expect(await screen.findByLabelText('Link do convite de Ana')).toHaveValue(
      `http://localhost:5173/c/${'t'.repeat(43)}`,
    );
  });

  it('mensagem: a prévia espera 500 ms depois da última tecla e o salvar fica bloqueado acima do limite', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const previews: string[] = [];
    let withinLimit = true;
    server.use(
      http.get(`${API}/aggregated-data`, () => HttpResponse.json(AGGREGATED)),
      http.get(`${API}/safety/alert-settings`, () =>
        HttpResponse.json({
          messageTemplate: 'Oi {apelido}',
          includeLocation: true,
          countdownSeconds: 10,
          checkInToleranceMinutes: 10,
          reviewed: false,
          reviewedAt: null,
        }),
      ),
      http.post(`${API}/safety/message-preview`, async ({ request }) => {
        const { template } = (await request.json()) as { template: string };
        previews.push(template);
        return HttpResponse.json({
          text: template.replace('{apelido}', 'Ana'),
          characters: template.length,
          limit: 4096,
          withinLimit,
          mapUrl: null,
        });
      }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSafety();
    await user.click(screen.getByRole('link', { name: 'Mensagem' }));
    const textarea = await screen.findByLabelText('Mensagem');
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    await waitFor(() => expect(previews).toEqual(['Oi {apelido}']));

    withinLimit = false;
    await user.type(textarea, ', tudo bem?');
    // Várias teclas seguidas: nenhuma prévia antes de 500 ms de pausa.
    expect(previews).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(PREVIEW_DEBOUNCE_MS));
    await waitFor(() => expect(previews).toEqual(['Oi {apelido}', 'Oi {apelido}, tudo bem?']));
    expect(await screen.findByText(/passa do limite do Telegram/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar mensagem' })).toBeDisabled();
  });
});
