/**
 * Registra o service worker (só no build de produção). Ele recebe a origem do remote das notas, a única
 * origem externa que pode entrar no cache.
 */
export function registerServiceWorker(notesRemoteUrl: string): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const notesOrigin = new URL(notesRemoteUrl, window.location.href).origin;
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`/sw.js?notes=${encodeURIComponent(notesOrigin)}`, { scope: '/' })
      .catch(() => undefined);
  });
}
