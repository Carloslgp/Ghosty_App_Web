import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

/** Só dígitos, de 6 a 8: o resto da busca nunca sai do navegador. */
export const UNLOCK_PATTERN = /^[0-9]{6,8}$/;

export interface UnlockState {
  remoteUrl: string | null;
  /** Enter na busca das notas. */
  onSearchSubmit: (query: string) => void;
  /** Saída rápida: revoga a sessão, apaga o cache da área e volta para as notas. */
  quickExit: () => void;
}

/**
 * Desbloqueio pela busca. Código certo: guarda o token da sessão segura em memória e devolve a URL do
 * remote. Código errado (403): nada muda na tela. Uma chamada por vez, sem repetir sozinho.
 */
export function useSafetyUnlock(): UnlockState {
  const { api, getSafetyToken, setSafetyToken, setSafetyForbiddenHandler } = useAuth();
  const queryClient = useQueryClient();
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const busy = useRef(false);

  const quickExit = useCallback(() => {
    const token = getSafetyToken();
    setSafetyToken(null);
    setRemoteUrl(null);
    queryClient.removeQueries({ queryKey: ['safety'] });
    window.history.replaceState(null, '', '/');
    // O token já saiu da memória; o BFF é avisado (sem esperar) para revogar a sessão no servidor.
    if (token) {
      void api.DELETE('/safety/session', { headers: { 'X-Safety-Token': token } }).catch(() => undefined);
    }
  }, [api, getSafetyToken, queryClient, setSafetyToken]);

  useEffect(() => {
    setSafetyForbiddenHandler(quickExit);
    return () => setSafetyForbiddenHandler(null);
  }, [quickExit, setSafetyForbiddenHandler]);

  const onSearchSubmit = useCallback(
    (query: string) => {
      const code = query.trim();
      if (!UNLOCK_PATTERN.test(code) || busy.current) return;
      busy.current = true;
      void api
        .POST('/safety/session', { body: { code } })
        .then(({ data }) => {
          if (!data) return;
          setSafetyToken(data.safetyToken);
          setRemoteUrl(data.remoteUrl);
        })
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
        });
    },
    [api, setSafetyToken],
  );

  return { remoteUrl, onSearchSubmit, quickExit };
}
