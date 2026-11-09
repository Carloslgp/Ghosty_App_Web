import type { ApiClient, Problem, Schemas } from '@ghosty/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use } from 'react';

export type Contact = Schemas['Contact'];
export type AlertSettings = Schemas['AlertSettings'];
export type AggregatedData = Schemas['AggregatedData'];
export type MessagePreview = Schemas['MessagePreview'];

export const ApiContext = createContext<ApiClient | null>(null);

export function useApi(): ApiClient {
  const api = use(ApiContext);
  if (!api) throw new Error('O remote safety precisa do ApiClient do shell.');
  return api;
}

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

/** Tudo da área fica sob `['safety', ...]`: a saída rápida apaga esse cache de uma vez. */
export const keys = {
  aggregated: ['safety', 'aggregated'] as const,
  contacts: ['safety', 'contacts'] as const,
  settings: ['safety', 'alert-settings'] as const,
};

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export function useAggregatedData(geo: GeoPermission) {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.aggregated, geo],
    queryFn: async () => unwrap(await api.GET('/aggregated-data', { params: { query: { geo } } })),
  });
}

export function useContacts() {
  const api = useApi();
  return useQuery({
    queryKey: keys.contacts,
    queryFn: async () => unwrap(await api.GET('/safety/contacts')).items,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.contacts });
    void queryClient.invalidateQueries({ queryKey: keys.aggregated });
  };
}

export function useAddContact() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (nickname: string) =>
      unwrap(await api.POST('/safety/contacts', { body: { nickname } })),
    onSuccess: invalidate,
  });
}

export function useReorderContacts() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactIds: string[]) =>
      unwrap(await api.PUT('/safety/contacts/order', { body: { contactIds } })).items,
    onSuccess: (items) => queryClient.setQueryData(keys.contacts, items),
  });
}

export function useRemoveContact() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error, response } = await api.DELETE('/safety/contacts/{contactId}', {
        params: { path: { contactId } },
      });
      if (error !== undefined) throw new ApiError(error, response.status);
    },
    onSuccess: invalidate,
  });
}

export function useCreateInvitation() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (contactId: string) =>
      unwrap(await api.POST('/safety/contacts/{contactId}/invitation', { params: { path: { contactId } } })),
    onSuccess: invalidate,
  });
}

export function useAlertSettings() {
  const api = useApi();
  return useQuery({
    queryKey: keys.settings,
    queryFn: async () => unwrap(await api.GET('/safety/alert-settings')),
  });
}

export function useSaveAlertSettings() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Schemas['UpdateAlertSettingsRequest']) =>
      unwrap(await api.PUT('/safety/alert-settings', { body })),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: keys.aggregated });
    },
  });
}

export async function fetchPreview(
  api: ApiClient,
  template: string,
  contactNickname?: string,
): Promise<MessagePreview> {
  return unwrap(
    await api.POST('/safety/message-preview', {
      body: { template, ...(contactNickname ? { contactNickname } : {}) },
    }),
  );
}
