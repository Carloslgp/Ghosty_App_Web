import { setupServer } from 'msw/node';

/** Servidor MSW compartilhado: cada teste registra as rotas do BFF que usa com `server.use(...)`. */
export const server = setupServer();

/** Base do BFF nos testes. */
export const API = 'http://bff.test';
