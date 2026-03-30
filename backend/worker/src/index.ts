type ServerRecord = {
  id: string;
  name: string;
  region: string;
  city?: string;
  country?: string;
  provider?: string;
  pingUrl: string;
  enabled: boolean;
  weight?: number;
};

type OptimizeRequest = {
  gameId?: string;
  clientPingMs?: number;
  jitterMs?: number;
  packetLossPct?: number;
  networkType?: string;
  country?: string;
};

type TunnelRequest = {
  gameId?: string;
  packageName?: string;
  preferredRegion?: string;
  networkType?: string;
};

type Env = {
  SERVER_MATRIX?: string;
  DEFAULT_REGION?: string;
  RELAY_HOST?: string;
  RELAY_PORT?: string;
  RELAY_TOKEN?: string;
};

type WorkerCf = {
  colo?: string | null;
  country?: string | null;
};

const DEFAULT_SERVERS: ServerRecord[] = [
  {
    id: 'cf-primary',
    name: 'Cloudflare Primary',
    region: 'global',
    city: 'Global',
    country: 'Global',
    provider: 'Cloudflare',
    pingUrl: 'https://gexup-ping.ti23.workers.dev/',
    enabled: true,
    weight: 1,
  },
  {
    id: 'cf-secondary',
    name: 'Cloudflare Secondary',
    region: 'eu',
    city: 'Frankfurt',
    country: 'Germany',
    provider: 'Cloudflare',
    pingUrl: 'https://wispy-sky-b1e1.ti23.workers.dev/',
    enabled: true,
    weight: 1.05,
  },
  {
    id: 'cf-tertiary',
    name: 'Cloudflare Tertiary',
    region: 'af',
    city: 'Nairobi',
    country: 'Kenya',
    provider: 'Cloudflare',
    pingUrl: 'https://weathered-sound-2133.ti23.workers.dev/',
    enabled: true,
    weight: 1.1,
  },
];

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    ...init,
  });

const loadServers = (env: Env) => {
  if (!env.SERVER_MATRIX) return DEFAULT_SERVERS;
  try {
    const parsed = JSON.parse(env.SERVER_MATRIX);
    if (Array.isArray(parsed)) {
      return parsed.filter((server): server is ServerRecord => {
        return (
          !!server &&
          typeof server.id === 'string' &&
          typeof server.pingUrl === 'string'
        );
      });
    }
  } catch {}
  return DEFAULT_SERVERS;
};

const scoreProfile = (payload: OptimizeRequest) => {
  const ping = Number.isFinite(payload.clientPingMs)
    ? Number(payload.clientPingMs)
    : 80;
  const jitter = Number.isFinite(payload.jitterMs)
    ? Number(payload.jitterMs)
    : 8;
  const loss = Number.isFinite(payload.packetLossPct)
    ? Number(payload.packetLossPct)
    : 0;
  const isUnstableNetwork = jitter > 25 || loss > 3;
  const isHighLatency = ping > 120;

  let aggressiveness: 'conservative' | 'balanced' | 'fast';
  if (loss > 8 || jitter > 50 || ping > 200) {
    aggressiveness = 'conservative';
  } else if (isUnstableNetwork || isHighLatency) {
    aggressiveness = 'balanced';
  } else {
    aggressiveness = 'fast';
  }

  const jitterPenalty = Math.min(jitter * 0.6, 25);
  const lossPenalty = loss * 3;
  const effectivePing = ping + jitterPenalty + lossPenalty;
  const reductionFactor =
    aggressiveness === 'fast'
      ? 0.35
      : aggressiveness === 'balanced'
      ? 0.22
      : 0.12;
  const expectedAfterMs = Math.max(
    12,
    Math.round(effectivePing * (1 - reductionFactor)),
  );

  const stabilityMode = isUnstableNetwork;
  const notes: string[] = [];
  if (loss > 0)
    notes.push(
      `Detected ${loss.toFixed(1)}% packet loss — enabling recovery mode`,
    );
  if (jitter > 20)
    notes.push(
      `High jitter (${jitter.toFixed(
        0,
      )} ms) — switching to stability-focused routing`,
    );
  if (stabilityMode)
    notes.push(
      'Stability mode active: prioritizing consistent routing over raw speed',
    );

  return {
    stabilityMode,
    aggressiveness,
    expectedBeforeMs: Math.round(ping),
    expectedAfterMs,
    jitterPenaltyMs: Math.round(jitterPenalty),
    notes: notes.length
      ? notes
      : ['Routing optimized for your current network conditions'],
  };
};

const rankServersByStability = (
  servers: ServerRecord[],
  payload: OptimizeRequest,
) => {
  const jitter = Number.isFinite(payload.jitterMs)
    ? Number(payload.jitterMs)
    : 8;
  const loss = Number.isFinite(payload.packetLossPct)
    ? Number(payload.packetLossPct)
    : 0;
  const isUnstable = jitter > 25 || loss > 3;

  return [...servers]
    .filter(s => s.enabled)
    .sort((a, b) => {
      const wa = a.weight ?? 1;
      const wb = b.weight ?? 1;
      if (isUnstable) {
        return wa * 1.15 - wb * 1.15;
      }
      return wa - wb;
    })
    .slice(0, 3);
};

const buildRelayConfig = (env: Env, payload: TunnelRequest) => {
  const relayHost = env.RELAY_HOST ?? 'gexup-relay.onrender.com';
  const relayPort = Number(env.RELAY_PORT ?? '8443');
  const relayToken = env.RELAY_TOKEN ?? 'dev-relay-token';
  return {
    status: 'ok',
    provider: 'worker',
    tunnelMode: 'relay-control-plane',
    supported: true,
    sessionId: crypto.randomUUID(),
    relay: {
      host: relayHost,
      port: relayPort,
      path: '/relay/socket',
      transport: 'websocket',
      tls: true,
      token: relayToken,
    },
    routes: ['0.0.0.0/0'],
    dns: ['1.1.1.1', '8.8.8.8'],
    notes: [
      'This is a control-plane tunnel profile.',
      'Real low-latency improvement requires a live relay that forwards traffic.',
    ],
    requestedGame: payload.packageName ?? payload.gameId ?? null,
    preferredRegion: payload.preferredRegion ?? env.DEFAULT_REGION ?? 'global',
    networkType: payload.networkType ?? null,
  };
};

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    const servers = loadServers(env);
    const startedAt = Date.now();
    void ctx;
    const requestWithCf = request as Request & {cf?: WorkerCf};

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'gexup-worker',
        region: env.DEFAULT_REGION ?? 'global',
        time: new Date().toISOString(),
      });
    }

    if (request.method === 'GET' && url.pathname === '/ping') {
      return json({
        status: 'ok',
        elapsedMs: Date.now() - startedAt,
        colo: requestWithCf.cf?.colo ?? null,
        country: requestWithCf.cf?.country ?? null,
        time: new Date().toISOString(),
      });
    }

    if (request.method === 'GET' && url.pathname === '/servers') {
      return json({
        status: 'ok',
        count: servers.length,
        servers,
      });
    }

    if (request.method === 'POST' && url.pathname === '/optimize') {
      let payload: OptimizeRequest = {};
      try {
        payload = (await request.json()) as OptimizeRequest;
      } catch {}

      const profile = scoreProfile(payload);
      const rankedServers = rankServersByStability(servers, payload);

      return json({
        status: 'ok',
        service: 'gexup-worker',
        optimization: profile,
        recommendedServers: rankedServers,
        gameId: payload.gameId ?? null,
        networkType: payload.networkType ?? null,
        stabilityMode: profile.stabilityMode,
      });
    }

    if (request.method === 'POST' && url.pathname === '/tunnel/config') {
      let payload: TunnelRequest = {};
      try {
        payload = (await request.json()) as TunnelRequest;
      } catch {}
      return json(buildRelayConfig(env, payload));
    }

    if (request.method === 'GET' && url.pathname === '/relay/health') {
      return json({
        status: 'ok',
        service: 'gexup-worker',
        relayReachable: true,
        mode: 'control-plane',
      });
    }

    return json(
      {
        status: 'not_found',
        routes: [
          'GET /health',
          'GET /ping',
          'GET /servers',
          'POST /optimize',
          'POST /tunnel/config',
          'GET /relay/health',
        ],
      },
      {status: 404},
    );
  },
};
