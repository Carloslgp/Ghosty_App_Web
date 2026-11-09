import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Remote `safety`: só é baixado depois do desbloqueio (o shell o registra com a URL que o BFF devolve).
 * Expõe também `./Invite`, a página pública do convite (`/c/:token`), carregada só com um token válido.
 * Em produção, sem source maps e com arquivos nomeados só pelo hash, para nenhum nome revelar o conteúdo.
 */
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'safety',
      filename: 'remoteEntry.js',
      exposes: { './App': './src/App.tsx', './Invite': './src/Invite.tsx' },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        'react-router': { singleton: true },
        '@tanstack/react-query': { singleton: true },
      },
      dts: false,
    }),
  ],
  server: { port: 5175, strictPort: true, origin: 'http://localhost:5175', cors: true },
  preview: { port: 5175, strictPort: true, cors: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: (chunk) => (chunk.name === 'remoteEntry' ? 'remoteEntry.js' : 'assets/[hash].js'),
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  },
});
