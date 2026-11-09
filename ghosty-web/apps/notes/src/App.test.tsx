import { createApiClient } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { API, server } from '../../../test/msw-server';
import NotesApp from './App';
import { matchesQuery } from './features/notes/search';

const base = {
  color: 'default',
  labels: [] as string[],
  pinned: false,
  archived: false,
  reminderAt: null,
  createdAt: '2026-11-01T10:00:00Z',
  version: 1,
};
const NOTES = [
  {
    ...base,
    id: 'a'.repeat(24),
    kind: 'text',
    title: 'Ideias de presente',
    body: 'Mãe: livro de receitas',
    updatedAt: '2026-11-03T10:00:00Z',
  },
  {
    ...base,
    id: 'b'.repeat(24),
    kind: 'checklist',
    title: 'Lista do mercado',
    items: [
      { id: '01a1ab94-8600-70de-85cf-24f12763c4f4', text: 'pão', done: false },
      { id: '01a1ab94-89e8-7df8-90e4-100f3bb07132', text: 'Café', done: false },
    ],
    pinned: true,
    labels: ['casa'],
    updatedAt: '2026-11-01T10:00:00Z',
  },
  {
    ...base,
    id: 'c'.repeat(24),
    kind: 'text',
    title: 'Dentista',
    body: 'quinta 14h',
    updatedAt: '2026-11-04T10:00:00Z',
  },
];

function renderApp(path = '/', onSearchSubmit = vi.fn()) {
  const api = createApiClient({ baseUrl: API, getAccessToken: () => 'jwt' });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <NotesApp api={api} onSearchSubmit={onSearchSubmit} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSearchSubmit };
}

function listHandler(calls: URL[] = []) {
  return http.get(`${API}/notes`, ({ request }) => {
    const url = new URL(request.url);
    calls.push(url);
    const archived = url.searchParams.get('archived') === 'true';
    const items = NOTES.filter((note) => note.archived === archived);
    return HttpResponse.json({ items, page: 1, pageSize: 100, total: items.length });
  });
}

describe('remote notes', () => {
  it('lista as fixadas primeiro e depois as mais recentes', async () => {
    server.use(listHandler());
    renderApp();
    const pinned = await screen.findByRole('region', { name: 'Fixadas' });
    expect(within(pinned).getByText('Lista do mercado')).toBeInTheDocument();
    const others = screen.getByRole('region', { name: 'Outras' });
    expect(
      within(others)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([expect.stringContaining('Dentista'), expect.stringContaining('Ideias de presente')]);
  });

  it('a busca filtra no navegador, sem chamar o servidor, e o Enter avisa o shell', async () => {
    const calls: URL[] = [];
    server.use(listHandler(calls));
    const { onSearchSubmit } = renderApp();
    await screen.findByText('Lista do mercado');
    const search = screen.getByRole('searchbox', { name: 'Buscar notas' });

    await userEvent.type(search, 'cafe');
    expect(screen.getByText('Lista do mercado')).toBeInTheDocument();
    expect(screen.queryByText('Dentista')).not.toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.searchParams.get('q')).toBeNull();

    await userEvent.clear(search);
    await userEvent.type(search, '246810{Enter}');
    expect(onSearchSubmit).toHaveBeenCalledWith('246810');
    expect(screen.getByText('Nenhuma nota encontrada')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it('busca sem acento acha com acento, também nos itens e etiquetas', () => {
    const note = NOTES[1] as Parameters<typeof matchesQuery>[0];
    expect(matchesQuery(note, 'CAFÉ')).toBe(true);
    expect(matchesQuery(note, 'casa')).toBe(true);
    expect(matchesQuery(note, 'feijão')).toBe(false);
    expect(matchesQuery(NOTES[0] as Parameters<typeof matchesQuery>[0], 'mae')).toBe(true);
  });

  it('Nova nota cria e abre o editor', async () => {
    let created: unknown;
    server.use(
      listHandler(),
      http.post(`${API}/notes`, async ({ request }) => {
        created = await request.json();
        return HttpResponse.json(
          {
            ...base,
            id: 'd'.repeat(24),
            kind: 'text',
            title: 'Nova nota',
            body: '',
            updatedAt: base.createdAt,
          },
          { status: 201 },
        );
      }),
      http.get(`${API}/notes/${'d'.repeat(24)}`, () =>
        HttpResponse.json({
          ...base,
          id: 'd'.repeat(24),
          kind: 'text',
          title: 'Nova nota',
          body: '',
          updatedAt: base.createdAt,
        }),
      ),
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova nota' }));
    expect(await screen.findByLabelText('Título')).toHaveValue('Nova nota');
    expect(created).toMatchObject({ kind: 'text', color: 'default', pinned: false });
  });

  it('editor: salva com a versão, mostra o conflito de versão e marca item na hora', async () => {
    const checklist = NOTES[1] as (typeof NOTES)[1] & {
      items: { id: string; text: string; done: boolean }[];
    };
    let putBody: Record<string, unknown> | undefined;
    let conflict = false;
    server.use(
      http.get(`${API}/notes/${checklist.id}`, () => HttpResponse.json(checklist)),
      http.put(`${API}/notes/${checklist.id}`, async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>;
        if (conflict) return HttpResponse.json({ code: 'VERSION_CONFLICT', status: 409 }, { status: 409 });
        return HttpResponse.json({ ...checklist, title: putBody.title, version: 2 });
      }),
      http.patch(`${API}/notes/${checklist.id}`, async ({ request }) => {
        const body = (await request.json()) as { item: { id: string; done: boolean } };
        return HttpResponse.json({
          ...checklist,
          version: 2,
          items: checklist.items.map((item) =>
            item.id === body.item.id ? { ...item, done: body.item.done } : item,
          ),
        });
      }),
    );
    renderApp(`/nota/${checklist.id}`);

    const title = await screen.findByLabelText('Título');
    await userEvent.clear(title);
    await userEvent.type(title, 'Mercado');
    await userEvent.type(screen.getByLabelText('Novo item'), 'leite{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Nota salva.')).toBeInTheDocument();
    expect(putBody).toMatchObject({
      version: 1,
      kind: 'checklist',
      title: 'Mercado',
      labels: ['casa'],
      items: [
        { id: '01a1ab94-8600-70de-85cf-24f12763c4f4', text: 'pão', done: false },
        { id: '01a1ab94-89e8-7df8-90e4-100f3bb07132', text: 'Café', done: false },
        { text: 'leite', done: false },
      ],
    });

    conflict = true;
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/A nota mudou em outro lugar/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Marcar pão' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Marcar pão' })).toBeChecked());
  });

  it('arquivadas ficam numa lista separada', async () => {
    const calls: URL[] = [];
    server.use(listHandler(calls));
    renderApp('/arquivadas');
    expect(await screen.findByRole('heading', { name: 'Arquivadas' })).toBeInTheDocument();
    await waitFor(() => expect(calls.at(-1)?.searchParams.get('archived')).toBe('true'));
    expect(screen.getByText('Nenhuma nota ainda')).toBeInTheDocument();
  });
});
