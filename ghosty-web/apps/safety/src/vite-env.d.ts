/// <reference types="vite/client" />

/** Variáveis de build do Vite usadas por este app. */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
