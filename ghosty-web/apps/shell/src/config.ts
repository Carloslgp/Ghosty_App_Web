export interface ShellConfig {
  /** BFF direto na máquina local; o API Management na nuvem. */
  apiBaseUrl: string;
  /** Chave pública do produto `web-app` do APIM (vazia na máquina local). */
  subscriptionKey: string;
}

export function loadConfig(): ShellConfig {
  return {
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
    subscriptionKey: import.meta.env.VITE_APIM_SUBSCRIPTION_KEY || '',
  };
}
