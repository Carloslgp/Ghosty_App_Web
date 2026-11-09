import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export const SHARED = {
  react: { singleton: true },
  'react-dom': { singleton: true },
  'react-router': { singleton: true },
  '@tanstack/react-query': { singleton: true },
};

/**
 * Host do Module Federation. O remote `notes` tem URL fixa (variável de build); o `safety` não entra
 * no build: a URL dele vem do BFF no desbloqueio e é registrada em tempo de execução.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      federation({
        name: 'shell',
        remotes: {
          notes: {
            type: 'module',
            name: 'notes',
            entry: env.VITE_NOTES_REMOTE_URL || 'http://localhost:5174/remoteEntry.js',
          },
        },
        shared: SHARED,
        dts: false,
      }),
    ],
    server: { port: 5173, strictPort: true },
    build: { target: 'es2022' },
  };
});
