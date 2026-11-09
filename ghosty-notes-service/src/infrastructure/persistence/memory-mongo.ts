/**
 * MongoDB em memória para rodar sem o Atlas (`npm run start:memory` ou `MONGODB_URI` vazia).
 * O pacote é devDependency: a imagem de produção não o tem, e lá a URI é obrigatória.
 */
export interface MemoryMongo {
  uri: string;
  stop(): Promise<void>;
}

export async function startMemoryMongo(): Promise<MemoryMongo> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  return {
    uri: server.getUri(),
    stop: async () => {
      await server.stop();
    },
  };
}
