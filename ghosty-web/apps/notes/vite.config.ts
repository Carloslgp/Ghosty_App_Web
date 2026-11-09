import { federation } from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Remote `notes`: a fachada. Expõe `./App`, carregado pelo shell com a URL fixa de `VITE_NOTES_REMOTE_URL`. */
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'notes',
      filename: 'remoteEntry.js',
      exposes: { './App': './src/App.tsx' },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
        'react-router': { singleton: true },
        '@tanstack/react-query': { singleton: true },
      },
      dts: false,
    }),
  ],
  server: { port: 5174, strictPort: true, origin: 'http://localhost:5174', cors: true },
  preview: { port: 5174, strictPort: true, cors: true },
  build: { target: 'es2022' },
});
