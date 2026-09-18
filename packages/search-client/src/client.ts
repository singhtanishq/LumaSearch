import { Client, ClientOptions } from '@elastic/elasticsearch';

export interface SearchClientConfig {
  url: string;
  username?: string;
  password?: string;
  caCertPath?: string;
  verifyCerts?: boolean;
  requestTimeoutMs?: number;
  maxRetries?: number;
}

export function createSearchClient(config: SearchClientConfig): Client {
  const options: ClientOptions = {
    node: config.url,
    requestTimeout: config.requestTimeoutMs ?? 30_000,
    maxRetries: config.maxRetries ?? 3,
    tls: {
      rejectUnauthorized: config.verifyCerts ?? true,
    },
  };
  if (config.username) {
    options.auth = { username: config.username, password: config.password ?? '' };
  }
  return new Client(options);
}

export async function checkSearchHealth(client: Client): Promise<{
  status: 'ok' | 'down';
  latencyMs: number;
  detail?: string;
}> {
  const started = Date.now();
  try {
    const info = await client.info();
    const health = await client.cluster.health();
    const status = health.status ?? 'red';
    return {
      status: status === 'red' ? 'down' : 'ok',
      latencyMs: Date.now() - started,
      detail: `cluster=${status} version=${info.version?.number ?? 'unknown'}`,
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
