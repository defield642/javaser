export type Server = {
  id: string;
  name: string;
  region?: string;
  city?: string;
  host?: string;
  port?: number;
  pingUrl?: string;
  enabled?: boolean;
  country?: string;
  provider?: string;
};

export const servers: Server[] = [
  {
    id: "auto",
    name: "Auto Select",
    enabled: true,
    region: "Auto",
    city: "Auto",
    country: "Auto",
    provider: "System"
  },
  // Cloudflare Workers (Real ping endpoints)
  {
    id: "s1",
    name: "Cloudflare Primary",
    region: "GL",
    city: "Global",
    pingUrl: "https://gexup-ping.ti23.workers.dev/",
    enabled: true,
    country: "Global",
    provider: "Cloudflare"
  },
  {
    id: "s2",
    name: "Cloudflare Secondary",
    region: "EU",
    city: "Frankfurt",
    pingUrl: "https://wispy-sky-b1e1.ti23.workers.dev/",
    enabled: true,
    country: "Germany",
    provider: "Cloudflare"
  },
  {
    id: "s3",
    name: "Cloudflare Tertiary",
    region: "AF",
    city: "Nairobi",
    pingUrl: "https://weathered-sound-2133.ti23.workers.dev/",
    enabled: true,
    country: "Kenya",
    provider: "Cloudflare"
  }
];

// Helper function to get enabled servers
export const getEnabledServers = (): Server[] => {
  return servers.filter(server => server.enabled !== false);
};

// Helper function to get server by ID
export const getServerById = (id: string): Server | undefined => {
  return servers.find(server => server.id === id);
};

// Helper function to get servers by region
export const getServersByRegion = (region: string): Server[] => {
  return servers.filter(server => server.region === region && server.enabled !== false);
};

// Helper function to get servers with ping URLs (for HTTP ping)
export const getServersWithPingUrl = (): Server[] => {
  return servers.filter(server => server.pingUrl && server.enabled !== false);
};

// Helper function to get servers with host/port (for TCP ping)
export const getServersWithHostPort = (): Server[] => {
  return servers.filter(server => server.host && server.port && server.enabled !== false);
};
