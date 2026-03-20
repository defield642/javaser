import { NativeModules, Platform } from "react-native";

export type InstalledApp = {
  packageName: string;
  name: string;
  icon?: string;
  isGame?: boolean;
};

const NativeInstalledApps = NativeModules.InstalledApps;

export async function getInstalledGames(): Promise<InstalledApp[]> {
  if (Platform.OS !== "android") return [];
  if (!NativeInstalledApps?.getInstalledGames) return [];
  try {
    const apps = await NativeInstalledApps.getInstalledGames();
    if (!Array.isArray(apps)) return [];
    return apps.filter((app) => app?.packageName && app?.name);
  } catch {
    return [];
  }
}

export async function launchInstalledApp(packageName: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.launchApp) return false;
  try {
    await NativeInstalledApps.launchApp(packageName);
    return true;
  } catch {
    return false;
  }
}

export async function startBoostService(
  gameName: string,
  gamePackage: string,
  serverName: string,
  ping: number
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.startBoostService) return false;
  try {
    await NativeInstalledApps.startBoostService(gameName, gamePackage, serverName, ping);
    return true;
  } catch {
    return false;
  }
}

export async function stopBoostService(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.stopBoostService) return false;
  try {
    await NativeInstalledApps.stopBoostService();
    return true;
  } catch {
    return false;
  }
}

export async function getBoostState(): Promise<{
  active: boolean;
  gameName: string;
  packageName: string;
  serverName: string;
  startTime: number;
} | null> {
  if (Platform.OS !== "android") return null;
  if (!NativeInstalledApps?.getBoostState) return null;
  try {
    return await NativeInstalledApps.getBoostState();
  } catch {
    return null;
  }
}

export async function clearBoostState(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.clearBoostState) return false;
  try {
    await NativeInstalledApps.clearBoostState();
    return true;
  } catch {
    return false;
  }
}

export async function prepareVpn(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.prepareVpn) return false;
  try {
    return await NativeInstalledApps.prepareVpn();
  } catch {
    return false;
  }
}

export async function startVpnService(gameName: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.startVpnService) return false;
  try {
    await NativeInstalledApps.startVpnService(gameName);
    return true;
  } catch {
    return false;
  }
}

export async function startVpnRelayService(
  gameName: string,
  relayHost: string,
  relayPort: number,
  relayPath: string,
  relayToken: string
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.startVpnRelayService) return false;
  try {
    await NativeInstalledApps.startVpnRelayService(
      gameName,
      relayHost,
      relayPort,
      relayPath,
      relayToken
    );
    return true;
  } catch {
    return false;
  }
}

export async function stopVpnService(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.stopVpnService) return false;
  try {
    await NativeInstalledApps.stopVpnService();
    return true;
  } catch {
    return false;
  }
}

export async function getVpnState(): Promise<{
  active: boolean;
  startTime: number;
  gameName: string;
  relayHost: string;
  relayPort: number;
  relayPath?: string;
  relayConnected?: boolean;
} | null> {
  if (Platform.OS !== "android") return null;
  if (!NativeInstalledApps?.getVpnState) return null;
  try {
    return await NativeInstalledApps.getVpnState();
  } catch {
    return null;
  }
}

export async function openDataSettings(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.openDataSettings) return false;
  try {
    await NativeInstalledApps.openDataSettings();
    return true;
  } catch {
    return false;
  }
}

export async function setMediaVolume(level: number): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.setMediaVolume) return false;
  try {
    await NativeInstalledApps.setMediaVolume(level);
    return true;
  } catch {
    return false;
  }
}

export async function pingUrl(url: string, timeoutMs: number): Promise<number | null> {
  if (Platform.OS !== "android") return null;
  if (!NativeInstalledApps?.pingUrl) return null;
  try {
    const result = await NativeInstalledApps.pingUrl(url, timeoutMs);
    return typeof result === "number" && result > 0 ? result : null;
  } catch {
    return null;
  }
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  if (!NativeInstalledApps?.isIgnoringBatteryOptimizations) return true;
  try {
    return await NativeInstalledApps.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.openBatteryOptimizationSettings) return false;
  try {
    await NativeInstalledApps.openBatteryOptimizationSettings();
    return true;
  } catch {
    return false;
  }
}

export async function writeErrorLog(message: string): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.writeErrorLog) return false;
  try {
    await NativeInstalledApps.writeErrorLog(message);
    return true;
  } catch {
    return false;
  }
}

export async function shareErrorLog(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.shareErrorLog) return false;
  try {
    await NativeInstalledApps.shareErrorLog();
    return true;
  } catch {
    return false;
  }
}

export async function playGoodSound(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.playGoodSound) return false;
  try {
    await NativeInstalledApps.playGoodSound();
    return true;
  } catch {
    return false;
  }
}

export async function playBadSound(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!NativeInstalledApps?.playBadSound) return false;
  try {
    await NativeInstalledApps.playBadSound();
    return true;
  } catch {
    return false;
  }
}
