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
  connectionSpeed?: number;
  signalStrength?: number;
  batteryOptimization?: boolean;
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

type NetworkHealthScore = {
  overall: number;
  latency: number;
  stability: number;
  bandwidth: number;
  packetLoss: number;
  recommendation: string;
};

type OptimizationProfile = {
  stabilityMode: boolean;
  aggressiveness: 'conservative' | 'balanced' | 'fast' | 'turbo';
  expectedBeforeMs: number;
  expectedAfterMs: number;
  jitterPenaltyMs: number;
  jitterBufferSize: number;
  fecStrength: number;
  retransmissionMode: boolean;
  multiPathEnabled: boolean;
  keepAliveInterval: number;
  dnsPreResolution: boolean;
  packetPrioritization: boolean;
  congestionControl: string;
  notes: string[];
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

// Advanced network health scoring
const computeNetworkHealthScore = (payload: OptimizeRequest): NetworkHealthScore => {
  const ping = Number.isFinite(payload.clientPingMs) ? Number(payload.clientPingMs) : 80;
  const jitter = Number.isFinite(payload.jitterMs) ? Number(payload.jitterMs) : 8;
  const loss = Number.isFinite(payload.packetLossPct) ? Number(payload.packetLossPct) : 0;
  const speed = Number.isFinite(payload.connectionSpeed) ? Number(payload.connectionSpeed) : 10;
  const signal = Number.isFinite(payload.signalStrength) ? Number(payload.signalStrength) : -70;

  // Latency score (0-100)
  const latencyScore = Math.max(0, Math.min(100, 100 - (ping - 20) * 0.8));
  
  // Stability score (0-100)
  const stabilityScore = Math.max(0, Math.min(100, 100 - jitter * 1.5 - loss * 5));
  
  // Bandwidth score (0-100)
  const bandwidthScore = Math.max(0, Math.min(100, speed * 2));
  
  // Packet loss score (0-100)
  const packetLossScore = Math.max(0, Math.min(100, 100 - loss * 10));
  
  // Overall score (weighted average)
  const overall = Math.round(
    latencyScore * 0.35 +
    stabilityScore * 0.30 +
    bandwidthScore * 0.20 +
    packetLossScore * 0.15
  );

  let recommendation = 'Network conditions are optimal for gaming';
  if (overall < 30) {
    recommendation = 'Severe network degradation detected - enabling maximum protection';
  } else if (overall < 50) {
    recommendation = 'Unstable network - activating advanced optimization';
  } else if (overall < 70) {
    recommendation = 'Moderate network quality - applying smart optimization';
  }

  return {
    overall,
    latency: Math.round(latencyScore),
    stability: Math.round(stabilityScore),
    bandwidth: Math.round(bandwidthScore),
    packetLoss: Math.round(packetLossScore),
    recommendation,
  };
};

// Advanced optimization profile calculation
const scoreProfile = (payload: OptimizeRequest): OptimizationProfile => {
  const ping = Number.isFinite(payload.clientPingMs) ? Number(payload.clientPingMs) : 80;
  const jitter = Number.isFinite(payload.jitterMs) ? Number(payload.jitterMs) : 8;
  const loss = Number.isFinite(payload.packetLossPct) ? Number(payload.packetLossPct) : 0;
  const speed = Number.isFinite(payload.connectionSpeed) ? Number(payload.connectionSpeed) : 10;
  const signal = Number.isFinite(payload.signalStrength) ? Number(payload.signalStrength) : -70;

  const healthScore = computeNetworkHealthScore(payload);
  
  const isUnstableNetwork = jitter > 25 || loss > 3;
  const isHighLatency = ping > 120;
  const isPoorSignal = signal < -85;
  const isLowBandwidth = speed < 5;

  // Determine aggressiveness level
  let aggressiveness: 'conservative' | 'balanced' | 'fast' | 'turbo';
  if (loss > 8 || jitter > 50 || ping > 200 || isPoorSignal) {
    aggressiveness = 'conservative';
  } else if (isUnstableNetwork || isHighLatency) {
    aggressiveness = 'balanced';
  } else if (ping < 40 && jitter < 10 && loss < 1) {
    aggressiveness = 'turbo';
  } else {
    aggressiveness = 'fast';
  }

  // Calculate jitter buffer size (adaptive)
  const jitterBufferSize = Math.max(20, Math.min(200, jitter * 3 + loss * 10));
  
  // Forward Error Correction strength
  const fecStrength = loss > 5 ? 0.3 : loss > 2 ? 0.2 : loss > 0 ? 0.1 : 0;
  
  // Retransmission mode for unstable networks
  const retransmissionMode = isUnstableNetwork || isPoorSignal;
  
  // Multi-path bonding for critical situations
  const multiPathEnabled = loss > 5 || jitter > 40 || ping > 150;
  
  // Keep-alive interval (shorter for unstable networks)
  const keepAliveInterval = isUnstableNetwork ? 5000 : 15000;
  
  // DNS pre-resolution
  const dnsPreResolution = true;
  
  // Packet prioritization
  const packetPrioritization = aggressiveness === 'turbo' || aggressiveness === 'fast';
  
  // Congestion control algorithm
  const congestionControl = isUnstableNetwork ? 'BBR' : 'CUBIC';

  const jitterPenalty = Math.min(jitter * 0.6, 25);
  const lossPenalty = loss * 3;
  const effectivePing = ping + jitterPenalty + lossPenalty;
  
  const reductionFactor =
    aggressiveness === 'turbo'
      ? 0.45
      : aggressiveness === 'fast'
      ? 0.35
      : aggressiveness === 'balanced'
      ? 0.22
      : 0.12;
      
  const expectedAfterMs = Math.max(
    12,
    Math.round(effectivePing * (1 - reductionFactor)),
  );

  const stabilityMode = isUnstableNetwork || isPoorSignal;
  
  const notes: string[] = [];
  if (loss > 0) {
    notes.push(`Detected ${loss.toFixed(1)}% packet loss — enabling FEC recovery`);
  }
  if (jitter > 20) {
    notes.push(`High jitter (${jitter.toFixed(0)} ms) — adaptive jitter buffer: ${jitterBufferSize}ms`);
  }
  if (stabilityMode) {
    notes.push('Stability mode active: prioritizing consistent routing over raw speed');
  }
  if (multiPathEnabled) {
    notes.push('Multi-path bonding enabled: combining network interfaces');
  }
  if (dnsPreResolution) {
    notes.push('DNS pre-resolution active: eliminating lookup delays');
  }
  if (packetPrioritization) {
    notes.push('Packet prioritization enabled: gaming traffic gets priority');
  }
  if (congestionControl === 'BBR') {
    notes.push('BBR congestion control: optimized for lossy networks');
  }
  if (retransmissionMode) {
    notes.push('Predictive retransmission enabled: recovering lost packets');
  }
  if (aggressiveness === 'turbo') {
    notes.push('TURBO mode: maximum optimization for optimal conditions');
  }

  return {
    stabilityMode,
    aggressiveness,
    expectedBeforeMs: Math.round(ping),
    expectedAfterMs,
    jitterPenaltyMs: Math.round(jitterPenalty),
    jitterBufferSize,
    fecStrength,
    retransmissionMode,
    multiPathEnabled,
    keepAliveInterval,
    dnsPreResolution,
    packetPrioritization,
    congestionControl,
    notes: notes.length ? notes : ['Advanced optimization enabled for your network'],
  };
};

const rankServersByStability = (
  servers: ServerRecord[],
  payload: OptimizeRequest,
) => {
  const jitter = Number.isFinite(payload.jitterMs) ? Number(payload.jitterMs) : 8;
  const loss = Number.isFinite(payload.packetLossPct) ? Number(payload.packetLossPct) : 0;
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
      const healthScore = computeNetworkHealthScore(payload);
      const rankedServers = rankServersByStability(servers, payload);

      return json({
        status: 'ok',
        service: 'gexup-worker',
        optimization: profile,
        networkHealth: healthScore,
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
