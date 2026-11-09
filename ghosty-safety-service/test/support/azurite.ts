import { spawn, type ChildProcess } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Conta e chave fixas do emulador (são públicas, documentadas pela Microsoft). */
const ACCOUNT = 'devstoreaccount1';
const KEY = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

export interface Azurite {
  connectionString: string;
  stop(): Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnect(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`O Azurite não respondeu na porta ${port}.`);
}

/** Sobe só o serviço de filas do Azurite, em memória, numa porta livre. Não precisa de Docker. */
export async function startAzurite(): Promise<Azurite> {
  const require = createRequire(import.meta.url);
  const entry = path.join(
    path.dirname(require.resolve('azurite/package.json')),
    'dist',
    'src',
    'queue',
    'main.js',
  );
  const port = await freePort();
  const child: ChildProcess = spawn(
    process.execPath,
    [
      entry,
      '--queueHost',
      '127.0.0.1',
      '--queuePort',
      String(port),
      '--inMemoryPersistence',
      '--silent',
      '--skipApiVersionCheck',
      '--loose',
    ],
    { stdio: 'ignore' },
  );
  await waitForPort(port, 20_000);
  return {
    connectionString: `DefaultEndpointsProtocol=http;AccountName=${ACCOUNT};AccountKey=${KEY};QueueEndpoint=http://127.0.0.1:${port}/${ACCOUNT};`,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill();
      }),
  };
}
