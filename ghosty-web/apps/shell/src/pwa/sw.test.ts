import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type Listener = (event: Record<string, unknown>) => void;

/** Roda o sw.js num `self` falso e devolve o tratador de `fetch`. Os caminhos partem da raiz do ghosty-web (onde o Vitest roda). */
function loadServiceWorker() {
  const code = readFileSync(path.resolve('apps/shell/public/sw.js'), 'utf8');
  const listeners: Record<string, Listener> = {};
  const scope = {
    location: new URL('https://notas.example/sw.js?notes=https%3A%2F%2Fnotes.example'),
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const cache = {
    match: () => Promise.resolve(undefined),
    put: () => Promise.resolve(),
    addAll: () => Promise.resolve(),
  };
  const caches = {
    open: () => Promise.resolve(cache),
    keys: () => Promise.resolve([]),
    delete: () => Promise.resolve(true),
  };
  const fetchStub = () => Promise.resolve(new Response('ok'));
  // O sw.js é JavaScript puro servido como está: o teste o executa com um escopo de worker falso.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function('self', 'caches', 'fetch', code) as (...args: unknown[]) => void;
  run(scope, caches, fetchStub);
  const fetchListener = listeners.fetch as Listener;
  return (url: string, init: { method?: string; mode?: string } = {}) => {
    const respondWith = vi.fn();
    fetchListener({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith });
    return respondWith.mock.calls.length > 0;
  };
}

describe('service worker', () => {
  const intercepts = loadServiceWorker();

  it('guarda o shell e o remote das notas', () => {
    expect(intercepts('https://notas.example/assets/abc.js')).toBe(true);
    expect(intercepts('https://notas.example/', { mode: 'navigate' })).toBe(true);
    expect(intercepts('https://notes.example/remoteEntry.js')).toBe(true);
  });

  it('nunca intercepta a API, a outra área, o próprio sw.js nem escritas', () => {
    expect(intercepts('https://api.example/notes')).toBe(false);
    expect(intercepts('https://api.example/aggregated-data')).toBe(false);
    expect(intercepts('https://outra-origem.example/remoteEntry.js')).toBe(false);
    expect(intercepts('https://outra-origem.example/assets/x.js')).toBe(false);
    expect(intercepts('https://notas.example/sw.js')).toBe(false);
    expect(intercepts('https://notas.example/assets/abc.js', { method: 'POST' })).toBe(false);
  });

  it('o manifest é neutro: "Notas", sem nada da outra área', () => {
    const manifest = readFileSync(path.resolve('apps/shell/public/manifest.webmanifest'), 'utf8');
    expect(JSON.parse(manifest)).toMatchObject({ name: 'Notas', short_name: 'Notas', display: 'standalone' });
    expect(manifest).not.toMatch(/ghosty|segur|safety|alerta|ajuda/i);
  });
});
