import NetInfo from "@react-native-community/netinfo";

export interface DetailedNetworkInfo {
  type: string;
  isConnected: boolean;
  isInternetReachable: boolean | null;
  details: any;
  ipAddress: string | null;
  subnet: string | null;
  strength: number | null; // WiFi signal strength
  ssid: string | null; // WiFi network name
  carrier: string | null; // Mobile carrier name
  cellularGeneration: string | null; // 4G, 5G, etc.
  isWifiEnabled: boolean | null;
  isCellularEnabled: boolean | null;
  connectionSpeed: number | null; // Approximate speed in Mbps
}

const normalizeSsid = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim().replace(/^"+|"+$/g, "");
    if (!trimmed) continue;
    if (
      trimmed === "0x" ||
      trimmed === "00" ||
      trimmed === "<unknown ssid>" ||
      trimmed.toLowerCase() === "unknown ssid" ||
      trimmed.toLowerCase() === "ssid"
    ) {
      continue;
    }
    return trimmed;
  }
  return null;
};

export const getDetailedNetworkInfo = async (): Promise<DetailedNetworkInfo> => {
  try {
    let state = await NetInfo.fetch();

    let strength = null;
    let ssid = null;
    let ipAddress = null;
    let subnet = null;
    let connectionSpeed = null;
    let fallbackType: string = state.type;

    if (!state.isConnected && state.type === "unknown") {
      const refreshed = await NetInfo.refresh();
      fallbackType = refreshed.type;
      if (refreshed.isConnected || refreshed.type !== "unknown") {
        state = refreshed;
      }
    }
    
    // Extract WiFi details
    if (state.type === 'wifi' && state.details) {
      const wifiDetails = state.details as any;
      strength = typeof wifiDetails.strength === "number" ? wifiDetails.strength : null;
      ssid = normalizeSsid(
        wifiDetails.ssid,
        wifiDetails.wifiSSID,
        wifiDetails.bssid
      ) || "Wi-Fi";
      ipAddress = wifiDetails.ipAddress || null;
      subnet = wifiDetails.subnet || null;
      
      const linkSpeed =
        wifiDetails.linkSpeed || wifiDetails.rxLinkSpeed || wifiDetails.txLinkSpeed || null;

      if (typeof linkSpeed === "number" && linkSpeed > 0) {
        connectionSpeed = linkSpeed;
      } else if (strength !== null) {
        if (strength > -50) connectionSpeed = 100; // Excellent
        else if (strength > -60) connectionSpeed = 50; // Good
        else if (strength > -70) connectionSpeed = 20; // Fair
        else connectionSpeed = 5; // Poor
      }
    }
    
    // Extract cellular details
    let carrier = null;
    let cellularGeneration = null;
    if (state.type === 'cellular' && state.details) {
      const cellularDetails = state.details as any;
      carrier = cellularDetails.carrier || "Mobile data";
      cellularGeneration = cellularDetails.cellularGeneration || null;
      
      // Approximate speeds based on cellular generation
      if (cellularGeneration === '5g') connectionSpeed = 200;
      else if (cellularGeneration === '4g') connectionSpeed = 50;
      else if (cellularGeneration === '3g') connectionSpeed = 5;
      else connectionSpeed = 1;
    }
    
    const normalizedReachable =
      typeof state.isInternetReachable === "boolean"
        ? state.isInternetReachable
        : !!state.isConnected;

    const normalizedType =
      state.type && state.type !== "unknown"
        ? state.type
        : fallbackType && fallbackType !== "unknown"
        ? fallbackType
        : normalizedReachable
        ? "connected"
        : "unknown";

    return {
      type: normalizedType,
      isConnected: !!state.isConnected || normalizedReachable,
      isInternetReachable: normalizedReachable,
      details: state.details,
      ipAddress: ipAddress,
      subnet: subnet,
      strength: strength,
      ssid: ssid,
      carrier: carrier,
      cellularGeneration: cellularGeneration,
      isWifiEnabled: state.type === "wifi",
      isCellularEnabled: state.type === "cellular",
      connectionSpeed: connectionSpeed
    };
  } catch (error) {
    console.error("Failed to get network info:", error);
    return {
      type: 'unknown',
      isConnected: false,
      isInternetReachable: false,
      details: null,
      ipAddress: null,
      subnet: null,
      strength: null,
      ssid: null,
      carrier: null,
      cellularGeneration: null,
      isWifiEnabled: null,
      isCellularEnabled: null,
      connectionSpeed: null
    };
  }
};

// Function to check if mobile data is enabled
export const isMobileDataEnabled = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch();
    return state.type === 'cellular';
  } catch (error) {
    console.error("Failed to check mobile data:", error);
    return false;
  }
};

// Function to get connection quality
export const getConnectionQuality = async (): Promise<'excellent' | 'good' | 'fair' | 'poor' | 'unknown'> => {
  try {
    const info = await getDetailedNetworkInfo();
    
    if (!info.isConnected) return 'unknown';
    
    if (info.type === 'wifi' && info.strength) {
      if (info.strength > -50) return 'excellent';
      if (info.strength > -60) return 'good';
      if (info.strength > -70) return 'fair';
      return 'poor';
    }
    
    if (info.type === 'cellular' && info.cellularGeneration) {
      if (info.cellularGeneration === '5g') return 'excellent';
      if (info.cellularGeneration === '4g') return 'good';
      if (info.cellularGeneration === '3g') return 'fair';
      return 'poor';
    }
    
    return 'unknown';
  } catch (error) {
    return 'unknown';
  }
};
