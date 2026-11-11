/**
 * Registra o service worker (só no build de produção). Ele recebe a origem do remote das notas, a única
 * origem externa que pode entrar no cache.
 */
export function registerServiceWorker(notesRemoteUrl: string): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const notesOrigin = new URL(notesRemoteUrl, window.location.href).origin;
  const register = () =>
    void navigator.serviceWorker
      .register(`/sw.js?notes=${encodeURIComponent(notesOrigin)}`, { scope: '/' })
      .catch(() => undefined);
  // O bootstrap chega por import dinâmico (Module Federation): quase sempre depois do `load`, que então
  // nunca mais dispara. Por isso, com a página já carregada, registra na hora.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
