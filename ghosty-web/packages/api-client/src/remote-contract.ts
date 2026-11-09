import type { ApiClient } from './client';

/**
 * Contrato entre o shell e os remotes. Os remotes nunca recebem os tokens: o shell é dono da sessão e
 * entrega um `ApiClient` que já coloca os cabeçalhos e renova o JWT.
 */
export interface NotesAppProps {
  /** Já injeta o JWT e a chave do APIM. */
  api: ApiClient;
  /** Enter na busca. O shell decide se é uma tentativa de desbloqueio; a busca segue igual de qualquer jeito. */
  onSearchSubmit: (query: string) => void;
}

export interface SafetyAppProps {
  /** Já injeta o JWT, a chave do APIM e o `X-Safety-Token`. */
  api: ApiClient;
  user: { displayName: string };
  /** O shell limpa tudo e volta para as notas. */
  onQuickExit: () => void;
}

export interface InviteAppProps {
  /** Sem login. */
  api: ApiClient;
  token: string;
}
