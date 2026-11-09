import type { ApiClient, Problem, Schemas } from '@ghosty/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use } from 'react';

export type Note = Schemas['Note'];
export type NoteColor = Schemas['NoteColor'];
export type NoteKind = Schemas['NoteKind'];
export type CreateNote = Schemas['CreateNoteRequest'];
export type UpdateNote = Schemas['UpdateNoteRequest'];
export type PatchNote = Schemas['PatchNoteRequest'];

export const NOTE_COLORS: { value: NoteColor; label: string }[] = [
  { value: 'default', label: 'Branca' },
  { value: 'yellow', label: 'Amarela' },
  { value: 'green', label: 'Verde' },
  { value: 'blue', label: 'Azul' },
  { value: 'pink', label: 'Rosa' },
  { value: 'gray', label: 'Cinza' },
];

export const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('O remote notes precisa do ApiClient do shell.');
  return api;
}

/** Erro da API com o Problem Details (para a tela decidir, por exemplo, no 409 de versão). */
export class ApiError extends Error {
  constructor(
    readonly problem: Problem | undefined,
    readonly status: number,
  ) {
    super(problem?.detail ?? 'Erro na API.');
    this.name = 'ApiError';
  }
}

function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || result.data === undefined) {
    throw new ApiError(result.error as Problem | undefined, result.response.status);
  }
  return result.data;
}

export const notesKey = (archived: boolean) => ['notes', 'list', { archived }] as const;
export const noteKey = (id: string) => ['notes', 'one', id] as const;

/**
 * Até 100 notas de uma vez: a busca é feita no navegador, então digitar nela não chama o servidor.
 */
export function useNotes(archived: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: notesKey(archived),
    queryFn: async () =>
      unwrap(await api.GET('/notes', { params: { query: { archived, pageSize: 100 } } })).items,
  });
}

export function useNote(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: noteKey(id),
    queryFn: async () => unwrap(await api.GET('/notes/{noteId}', { params: { path: { noteId: id } } })),
  });
}

/** Grava a nota no cache e invalida as listas. */
function useStoreNote() {
  const queryClient = useQueryClient();
  return (note: Note) => {
    queryClient.setQueryData(noteKey(note.id), note);
    void queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
  };
}

export function useCreateNote() {
  const api = useApi();
  const store = useStoreNote();
  return useMutation({
    mutationFn: async (body: CreateNote) => unwrap(await api.POST('/notes', { body })),
    onSuccess: store,
  });
}

export function useUpdateNote(id: string) {
  const api = useApi();
  const store = useStoreNote();
  return useMutation({
    mutationFn: async (body: UpdateNote) =>
      unwrap(await api.PUT('/notes/{noteId}', { params: { path: { noteId: id } }, body })),
    onSuccess: store,
  });
}

export function usePatchNote(id: string) {
  const api = useApi();
  const store = useStoreNote();
  return useMutation({
    mutationFn: async (body: PatchNote) =>
      unwrap(await api.PATCH('/notes/{noteId}', { params: { path: { noteId: id } }, body })),
    onSuccess: store,
  });
}

export function useDeleteNote(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.DELETE('/notes/{noteId}', { params: { path: { noteId: id } } });
      if (error !== undefined) throw new ApiError(error, response.status);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: noteKey(id) });
      void queryClient.invalidateQueries({ queryKey: ['notes', 'list'] });
    },
  });
}
