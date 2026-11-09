import { MongoClient, type Db } from 'mongodb';

/**
 * Cliente do MongoDB. O driver conecta sozinho na primeira operação, então criar a conexão não acessa
 * a rede (o `openapi:export` e os testes de arquitetura não precisam de banco).
 */
export class MongoConnection {
  private constructor(
    private readonly client: MongoClient,
    readonly db: Db,
  ) {}

  static create(uri: string, dbName: string): MongoConnection {
    const client = new MongoClient(uri, {
      appName: 'notes-service',
      serverSelectionTimeoutMS: 5_000,
      // Poucas conexões: o cluster Free do Atlas tem limite baixo.
      maxPoolSize: 10,
    });
    return new MongoConnection(client, client.db(dbName));
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
