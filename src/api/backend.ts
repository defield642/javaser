import type {Server} from '../data/servers';

export type BackendConfig = {
  id: string;
  name: string;
  baseUrl: string;
  kind: 'worker' | 'java';
};

export type OptimizationProfile = {
  expectedBeforeMs: number | null;
  expectedAfterMs: number | null;
  stabilityMode: boolean;
  aggressiveness: string;
  notes: string[];
  source: string;
  jitterBufferSize?: number;
  fecStrength?: number;
  retransmissionMode?: boolean;
  multiPathEnabled?: boolean;
  keepAliveInterval?: number;
  dnsPreResolution?: boolean;
  packetPrioritization?: boolean;
  congestionControl?: string;
};

export type TunnelConfig = {
  sessionId: string;
  provider: string;
  tunnelMode: string;
  supported: boolean;
  relay: {
    host: string;
    port: number;
    transport: string;
    path?: string;
    tls: boolean;
    token: string;
  };
  routes: string[];
  dns: string[];
  notes: string[];
  source: string;
};

type OptimizeResponse = {
  status?: string;
  optimization?: {
    expectedBeforeMs?: number;
    expectedAfterMs?: number;
    stabilityMode?: boolean;
    aggressiveness?: string;
    notes?: string[];
  };
  recommendedServers?: Server[];
};

type TunnelResponse = {
  status?: string;
  provider?: string;
  tunnelMode?: string;
  supported?: boolean;
  sessionId?: string;
  relay?: {
    host?: string;
    port?: number;
    transport?: string;
    path?: string;
    tls?: boolean;
    token?: string;
  };
  routes?: string[];
  dns?: string[];
  notes?: string[];
};

export const backendConfigs: BackendConfig[] = [
  {
    id: 'worker-primary',
    name: 'Cloudflare Control Plane',
    baseUrl: 'https://gexup-control-plane.ti23.workers.dev',
    kind: 'worker',
  },
  {
    id: 'java-render',
    name: 'Render Optimizer',
    baseUrl: 'https://gexup-java-backend.onrender.com',
    kind: 'java',
  },
];

const normalizeBaseUrl = (value: string) =>
  value.replace(/\/+$/, '').replace(/\/+$/, '');

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const response = await fetch(cleanUrl, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

const postJson = async <T>(url: string, body: unknown): Promise<T | null> => {
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const fetchBackendServers = async (): Promise<Server[]> => {
  const responses = await Promise.all(
    backendConfigs.map(async backend => {
      const data = await getJson<{servers?: Server[]}>(
        `${normalizeBaseUrl(backend.baseUrl)}/servers`,
      );
      return (
        data?.servers?.map(server => ({
          ...server,
          provider: server.provider || backend.name,
        })) ?? []
      );
    }),
  );

  const deduped = new Map<string, Server>();
  for (const server of responses.flat()) {
    if (!server?.id || !server?.pingUrl) continue;
    deduped.set(server.id, server);
  }
  return [...deduped.values()];
};

export const fetchOptimizationProfile = async (payload: {
  gameId?: string;
  clientPingMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  networkType?: string;
  country?: string;
}): Promise<OptimizationProfile | null> => {
  for (const backend of backendConfigs) {
    const data = await postJson<OptimizeResponse>(
      `${normalizeBaseUrl(backend.baseUrl)}/optimize`,
      payload,
    );
    if (!data?.optimization) continue;
    return {
      expectedBeforeMs:
        typeof data.optimization.expectedBeforeMs === 'number'
          ? data.optimization.expectedBeforeMs
          : null,
      expectedAfterMs:
        typeof data.optimization.expectedAfterMs === 'number'
          ? data.optimization.expectedAfterMs
          : null,
      stabilityMode: !!data.optimization.stabilityMode,
      aggressiveness: data.optimization.aggressiveness ?? 'balanced',
      notes: Array.isArray(data.optimization.notes)
        ? data.optimization.notes
        : [],
      source: backend.name,
    };
  }
  return null;
};

export const fetchTunnelConfig = async (payload: {
  gameId?: string;
  packageName?: string;
  preferredRegion?: string;
  networkType?: string;
}): Promise<TunnelConfig | null> => {
  for (const backend of backendConfigs) {
    const data = await postJson<TunnelResponse>(
      `${normalizeBaseUrl(backend.baseUrl)}/tunnel/config`,
      payload,
    );
    if (
      !data?.supported ||
      !data.relay?.host ||
      !data.relay?.port ||
      !data.sessionId
    ) {
      continue;
    }
    return {
      sessionId: data.sessionId,
      provider: data.provider ?? backend.name,
      tunnelMode: data.tunnelMode ?? 'relay',
      supported: true,
      relay: {
        host: data.relay.host,
        port: data.relay.port,
        transport: data.relay.transport ?? 'tcp',
        path: data.relay.path ?? '',
        tls: !!data.relay.tls,
        token: data.relay.token ?? '',
      },
      routes: Array.isArray(data.routes) ? data.routes : [],
      dns: Array.isArray(data.dns) ? data.dns : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      source: backend.name,
    };
  }
  return null;
};
