import type { ApiClient, Problem, Schemas } from '@ghosty/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use } from 'react';

export type Contact = Schemas['Contact'];
export type AlertSettings = Schemas['AlertSettings'];
export type AggregatedData = Schemas['AggregatedData'];
export type MessagePreview = Schemas['MessagePreview'];
export type CheckIn = Schemas['CheckIn'];
export type HelpRequest = Schemas['HelpRequest'];
export type DeliveryStep = Schemas['DeliveryStep'];
export type Mode = 'real' | 'test';
export interface Location {
  lat: number;
  lng: number;
  accuracyMeters: number | null;
}

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
  checkIns: ['safety', 'check-ins'] as const,
  checkIn: (id: string) => ['safety', 'check-ins', id] as const,
  helpRequest: (id: string) => ['safety', 'help-requests', id] as const,
};

/** Uma chave nova a cada tentativa: repetir a mesma requisição (rede instável) não dispara duas vezes. */
export function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export function useAggregatedData(geo: GeoPermission) {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.aggregated, geo],
    queryFn: async () => unwrap(await api.GET('/aggregated-data', { params: { query: { geo } } })),
  });
}

export const CONTACTS_POLL_MS = 10_000;

export function useContacts() {
  const api = useApi();
  return useQuery({
    queryKey: keys.contacts,
    queryFn: async () => unwrap(await api.GET('/safety/contacts')).items,
    // Enquanto houver convite pendente, a tela acompanha a resposta do contato sem precisar sair dela.
    refetchInterval: (query) =>
      query.state.data?.some((contact) => contact.status === 'pending') ? CONTACTS_POLL_MS : false,
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

// ---------------------------------------------------------------- pedidos de ajuda

export const HELP_POLL_MS = 2_000;

export async function triggerHelpRequest(
  api: ApiClient,
  mode: Mode,
  location: Location | null,
): Promise<HelpRequest> {
  return unwrap(
    await api.POST('/safety/help-requests', {
      params: { header: { 'Idempotency-Key': newIdempotencyKey() } },
      body: { mode, ...(location ? { location } : {}) },
    }),
  );
}

/** A linha do tempo: consulta a cada 2 segundos enquanto o pedido ainda está `triggered`. */
export function useHelpRequest(helpRequestId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.helpRequest(helpRequestId ?? 'nenhum'),
    enabled: helpRequestId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/safety/help-requests/{helpRequestId}', {
          params: { path: { helpRequestId: helpRequestId as string } },
        }),
      ),
    refetchInterval: (query) => (query.state.data?.status === 'triggered' ? HELP_POLL_MS : false),
  });
}

export function useCancelHelpRequest() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (helpRequestId: string) =>
      unwrap(
        await api.POST('/safety/help-requests/{helpRequestId}/cancel', {
          params: { path: { helpRequestId } },
        }),
      ),
    onSuccess: (request) => queryClient.setQueryData(keys.helpRequest(request.id), request),
  });
}

// ---------------------------------------------------------------- check-ins

export const CHECK_IN_POLL_MS = 5_000;

/** O check-in ativo do modo pedido (só pode haver um por modo). */
export function useActiveCheckIn(mode: Mode) {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.checkIns, 'active', mode],
    queryFn: async () =>
      unwrap(await api.GET('/safety/check-ins', { params: { query: { status: 'active', mode } } }))
        .items[0] ?? null,
  });
}

/** Um check-in, consultado a cada 5 segundos enquanto ainda está ativo (ensaio do prazo). */
export function useCheckIn(checkInId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.checkIn(checkInId ?? 'nenhum'),
    enabled: checkInId !== null,
    queryFn: async () =>
      unwrap(
        await api.GET('/safety/check-ins/{checkInId}', {
          params: { path: { checkInId: checkInId as string } },
        }),
      ),
    refetchInterval: (query) =>
      query.state.data?.status === 'active' ||
      (query.state.data?.status === 'expired' && !query.state.data.helpRequestId)
        ? CHECK_IN_POLL_MS
        : false,
  });
}

function useInvalidateCheckIns() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.checkIns });
    void queryClient.invalidateQueries({ queryKey: keys.aggregated });
  };
}

export function useStartCheckIn() {
  const api = useApi();
  const invalidate = useInvalidateCheckIns();
  return useMutation({
    mutationFn: async (body: { destination: string; dueAt: string; toleranceMinutes?: number; mode: Mode }) =>
      unwrap(
        await api.POST('/safety/check-ins', {
          params: { header: { 'Idempotency-Key': newIdempotencyKey() } },
          body,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useConfirmArrival() {
  const api = useApi();
  const invalidate = useInvalidateCheckIns();
  return useMutation({
    mutationFn: async (checkInId: string) =>
      unwrap(await api.POST('/safety/check-ins/{checkInId}/confirm', { params: { path: { checkInId } } })),
    onSuccess: invalidate,
  });
}

export function useExtendCheckIn() {
  const api = useApi();
  const invalidate = useInvalidateCheckIns();
  return useMutation({
    mutationFn: async ({ checkInId, dueAt }: { checkInId: string; dueAt: string }) =>
      unwrap(
        await api.PUT('/safety/check-ins/{checkInId}', { params: { path: { checkInId } }, body: { dueAt } }),
      ),
    onSuccess: invalidate,
  });
}

export function useCancelCheckIn() {
  const api = useApi();
  const invalidate = useInvalidateCheckIns();
  return useMutation({
    mutationFn: async (checkInId: string) => {
      const { error, response } = await api.DELETE('/safety/check-ins/{checkInId}', {
        params: { path: { checkInId } },
      });
      if (error !== undefined) throw new ApiError(error, response.status);
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- localização

/**
 * A posição atual, só no momento do pedido ou do check-in. Sem permissão, sem GPS ou demorando mais de
 * 8 segundos: `null`, e o pedido segue sem localização.
 */
export function getCurrentLocation(): Promise<Location | null> {
  const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
  if (!geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null,
        }),
      () => resolve(null),
      { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: true },
    );
  });
}
