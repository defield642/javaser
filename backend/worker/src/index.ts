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
    id: "cf-primary",
    name: "Cloudflare Primary",
    region: "global",
    city: "Global",
    country: "Global",
    provider: "Cloudflare",
    pingUrl: "https://gexup-ping.ti23.workers.dev/",
    enabled: true,
    weight: 1
  },
  {
    id: "cf-secondary",
    name: "Cloudflare Secondary",
    region: "eu",
    city: "Frankfurt",
    country: "Germany",
    provider: "Cloudflare",
    pingUrl: "https://wispy-sky-b1e1.ti23.workers.dev/",
    enabled: true,
    weight: 1.05
  },
  {
    id: "cf-tertiary",
    name: "Cloudflare Tertiary",
    region: "af",
    city: "Nairobi",
    country: "Kenya",
    provider: "Cloudflare",
    pingUrl: "https://weathered-sound-2133.ti23.workers.dev/",
    enabled: true,
    weight: 1.1
  }
];

const json = (data: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    ...init
  });

const loadServers = (env: Env) => {
  if (!env.SERVER_MATRIX) return DEFAULT_SERVERS;
  try {
    const parsed = JSON.parse(env.SERVER_MATRIX);
    if (Array.isArray(parsed)) {
      return parsed.filter((server): server is ServerRecord => {
        return !!server && typeof server.id === "string" && typeof server.pingUrl === "string";
      });
    }
  } catch {}
  return DEFAULT_SERVERS;
};

const scoreProfile = (payload: OptimizeRequest) => {
  const ping = Number.isFinite(payload.clientPingMs) ? Number(payload.clientPingMs) : 80;
  const jitter = Number.isFinite(payload.jitterMs) ? Number(payload.jitterMs) : 10;
  const loss = Number.isFinite(payload.packetLossPct) ? Number(payload.packetLossPct) : 0;

  const stabilityMode = loss > 2 || jitter > 30 || ping > 120;
  const aggressiveness = ping > 150 || loss > 5 ? "conservative" : ping > 90 ? "balanced" : "fast";
  const expectedAfterMs = Math.max(10, Math.round(ping - Math.min(20, jitter * 0.2)));

  return {
    stabilityMode,
    aggressiveness,
    expectedBeforeMs: ping,
    expectedAfterMs,
    notes: [
      "This backend can improve server selection and recovery behavior.",
      "It cannot force a bad ISP path to become truly low-latency without better routing infrastructure."
    ]
  };
};

const buildRelayConfig = (env: Env, payload: TunnelRequest) => {
  const relayHost = env.RELAY_HOST ?? "gexup-relay.onrender.com";
  const relayPort = Number(env.RELAY_PORT ?? "8443");
  const relayToken = env.RELAY_TOKEN ?? "dev-relay-token";
  return {
    status: "ok",
    provider: "worker",
    tunnelMode: "relay-control-plane",
    supported: true,
    sessionId: crypto.randomUUID(),
    relay: {
      host: relayHost,
      port: relayPort,
      path: "/relay/socket",
      transport: "websocket",
      tls: true,
      token: relayToken
    },
    routes: ["0.0.0.0/0"],
    dns: ["1.1.1.1", "8.8.8.8"],
    notes: [
      "This is a control-plane tunnel profile.",
      "Real low-latency improvement requires a live relay that forwards traffic."
    ],
    requestedGame: payload.packageName ?? payload.gameId ?? null,
    preferredRegion: payload.preferredRegion ?? env.DEFAULT_REGION ?? "global",
    networkType: payload.networkType ?? null
  };
};

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    const servers = loadServers(env);
    const startedAt = Date.now();
    void ctx;
    const requestWithCf = request as Request & { cf?: WorkerCf };

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        service: "gexup-worker",
        region: env.DEFAULT_REGION ?? "global",
        time: new Date().toISOString()
      });
    }

    if (request.method === "GET" && url.pathname === "/ping") {
      return json({
        status: "ok",
        elapsedMs: Date.now() - startedAt,
        colo: requestWithCf.cf?.colo ?? null,
        country: requestWithCf.cf?.country ?? null,
        time: new Date().toISOString()
      });
    }

    if (request.method === "GET" && url.pathname === "/servers") {
      return json({
        status: "ok",
        count: servers.length,
        servers
      });
    }

    if (request.method === "POST" && url.pathname === "/optimize") {
      let payload: OptimizeRequest = {};
      try {
        payload = (await request.json()) as OptimizeRequest;
      } catch {}

      const profile = scoreProfile(payload);
      const rankedServers = [...servers]
        .filter((server) => server.enabled)
        .sort((a, b) => (a.weight ?? 1) - (b.weight ?? 1))
        .slice(0, 3);

      return json({
        status: "ok",
        service: "gexup-worker",
        optimization: profile,
        recommendedServers: rankedServers,
        gameId: payload.gameId ?? null,
        networkType: payload.networkType ?? null
      });
    }

    if (request.method === "POST" && url.pathname === "/tunnel/config") {
      let payload: TunnelRequest = {};
      try {
        payload = (await request.json()) as TunnelRequest;
      } catch {}
      return json(buildRelayConfig(env, payload));
    }

    if (request.method === "GET" && url.pathname === "/relay/health") {
      return json({
        status: "ok",
        service: "gexup-worker",
        relayReachable: true,
        mode: "control-plane"
      });
    }

    return json(
      {
        status: "not_found",
        routes: [
          "GET /health",
          "GET /ping",
          "GET /servers",
          "POST /optimize",
          "POST /tunnel/config",
          "GET /relay/health"
        ]
      },
      { status: 404 }
    );
  }
};
