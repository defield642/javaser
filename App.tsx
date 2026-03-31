import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  SafeAreaView,
  View,
  StyleSheet,
  StatusBar,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  AppState,
  Animated,
} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {theme} from './src/theme';
import {BottomNav, TabKey} from './src/components/BottomNav';
import {GamesScreen} from './src/screens/GamesScreen';
import {PingEntry, httpPing} from './src/types/ping';
import {BoostStatusScreen} from './src/screens/BoostStatusScreen';
import {Game, fallbackGames} from './src/data/games';
import {getGameTargetProfile} from './src/data/gameTargets';
import {Server, servers} from './src/data/servers';
import {tcpPing} from './src/types/ping';
import {
  fetchBackendServers,
  fetchOptimizationProfile,
  fetchTunnelConfig,
  OptimizationProfile,
  TunnelConfig,
} from './src/api/backend';
import networkOptimizer from './src/native/NetworkOptimizer';
import {
  getInstalledGames,
  launchInstalledApp,
  startBoostService,
  stopBoostService,
  getBoostState,
  clearBoostState,
  setMediaVolume,
  pingUrl as nativePingUrl,
  isIgnoringBatteryOptimizations,
  openBatteryOptimizationSettings,
  prepareVpn,
  startVpnRelayService,
  stopVpnService,
  getVpnState,
  writeErrorLog,
  shareErrorLog,
} from './src/native/installedApps';
import NetInfo from '@react-native-community/netinfo';
import Tts from 'react-native-tts';
import {SettingsModal, SettingsState} from './src/screens/SettingsModal';
import {
  getDetailedNetworkInfo,
  getConnectionQuality,
} from './src/utils/networkInfo';

const PING_INTERVAL_MS = 3500;
const LOCK_SCAN_INTERVAL_MS = 20000;
const PROGRESS_MIN_MS = 5000;
const PROGRESS_MAX_MS = 15000;
const EMA_ALPHA = 0.28;
const DEFAULT_SETTINGS: SettingsState = {
  autoOpenDelaySec: 15,
  voiceVolume: 1.0,
};

export default function App() {
  const [tab, setTab] = useState<TabKey>('games');
  const [games, setGames] = useState<Game[]>(fallbackGames);
  const [serverCatalog, setServerCatalog] = useState<Server[]>(servers);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [lockedServerId, setLockedServerId] = useState<string | null>(null);
  const [isBoosting, setIsBoosting] = useState(false);
  const [boostPhase, setBoostPhase] = useState<'idle' | 'progress' | 'active'>(
    'idle',
  );
  const [boostProgress, setBoostProgress] = useState(0);
  const boostProgressRef = useRef(0);
  const progressAnimRef = useRef<number | null>(null);
  const [pingMap, setPingMap] = useState<Record<string, PingEntry>>({});
  const [pingHistory, setPingHistory] = useState<
    Record<
      string,
      {ms: number; t: number; networkType?: string; estimatedSpeed?: number}[]
    >
  >({});
  const [isConnected, setIsConnected] = useState(true);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [optimizationProfile, setOptimizationProfile] =
    useState<OptimizationProfile | null>(null);
  const [_tunnelConfig, setTunnelConfig] = useState<TunnelConfig | null>(null);
  const [boostStartTime, setBoostStartTime] = useState<number | undefined>(
    undefined,
  );
  const [jitterMs, setJitterMs] = useState<number>(0);
  const [packetLossPct, setPacketLossPct] = useState<number>(0);
  const pingAttemptCountRef = useRef<
    Record<string, {total: number; failed: number}>
  >({});
  const emaRef = useRef<Record<string, number>>({});
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const launchedRef = useRef<string | null>(null);
  const lockRunningRef = useRef(false);
  const scanRunningRef = useRef(false);
  const pingMapRef = useRef<Record<string, PingEntry>>({});
  const pingHistoryRef = useRef<
    Record<
      string,
      {ms: number; t: number; networkType?: string; estimatedSpeed?: number}[]
    >
  >({});
  const selectedServerRef = useRef<Server | null>(null);
  const isBoostingRef = useRef(false);
  const notificationAskedRef = useRef(false);
  const batteryOptimizationAskedRef = useRef(false);
  const errorCountRef = useRef(0);
  const notifiedServerRef = useRef<string | null>(null);
  const notifyThrottleRef = useRef(0);
  const progressStartRef = useRef<number | null>(null);
  const progressDurationRef = useRef<number>(PROGRESS_MIN_MS);
  const spokenRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const lastNetworkRefreshRef = useRef(0);
  const scanBestServerRef = useRef<() => Promise<void>>();
  const handleStopRef = useRef<() => Promise<void>>();

  const availableServers = useMemo(
    () =>
      serverCatalog.filter(
        server => server.enabled !== false && server.id !== 'auto',
      ),
    [serverCatalog],
  );

  const extractHostFromUrl = (
    url: string,
  ): {host: string; port: number} | null => {
    const match = url.match(/^https?:\/\/([^:\/]+)(?::(\d+))?/);
    if (!match) return null;
    const host = match[1];
    const portStr = match[2];
    const isHttp = url.toLowerCase().startsWith('http:');
    const port = portStr ? Number(portStr) : isHttp ? 80 : 443;
    return {host, port};
  };

  const getServerTarget = (
    server: Server,
  ): {host: string; port: number} | null => {
    if (server.host && server.port) {
      return {host: server.host, port: server.port};
    }
    if (server.pingUrl) {
      const normalized = server.pingUrl.trim();
      let urlToParse = normalized;
      if (!/^https?:\/\//i.test(urlToParse)) {
        urlToParse = 'https://' + urlToParse;
      }
      const result = extractHostFromUrl(urlToParse);
      if (!result) {
        console.warn(
          `Invalid target: could not extract host/port from pingUrl='${server.pingUrl}' for server id='${server.id}'`,
        );
        return null;
      }
      return result;
    }
    console.warn(
      `Invalid target: no host/port or pingUrl for server id='${server.id}'`,
    );
    return null;
  };

  const getGameTargets = (game: Game | null) => {
    return getGameTargetProfile(game)?.targets ?? [];
  };

  const getPingCandidates = (server: Server) => {
    if (!server.pingUrl) return [];
    const trimmed = server.pingUrl.trim();
    const candidates = [trimmed];
    const withoutPingPath = trimmed.replace(/\/ping\/?$/i, '/');
    if (withoutPingPath !== trimmed) {
      candidates.push(withoutPingPath);
    }
    return [...new Set(candidates)];
  };

  const appendMeasureLog = (message: string) => {
    writeErrorLog(`[measure] ${new Date().toISOString()} ${message}`).catch(
      () => {},
    );
  };

  const traceMeasure = (message: string) => {
    appendMeasureLog(message);
  };

  const average = (values: number[]) => {
    if (!values.length) return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  };

  const filteredAverage = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const filtered = values.filter(
      value => Math.abs(value - median) <= Math.max(25, median * 0.35),
    );
    return average(filtered.length ? filtered : values);
  };

  const computeJitter = (values: number[]) => {
    const avg = average(values);
    if (avg === null) return 0;
    const variance =
      values.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) /
      Math.max(1, values.length);
    return Math.sqrt(variance);
  };

  const scoreServer = (serverId: string, fallbackMs?: number) => {
    const history = pingHistoryRef.current[serverId] ?? [];
    const samples = history.slice(-8).map(item => item.ms);
    if (!samples.length) {
      return typeof fallbackMs === 'number' ? fallbackMs : Infinity;
    }
    const avg = samples.reduce((acc, value) => acc + value, 0) / samples.length;
    const variance =
      samples.reduce((acc, value) => acc + Math.pow(value - avg, 2), 0) /
      samples.length;
    const jitter = Math.sqrt(variance);
    const latest = samples[samples.length - 1];
    return avg * 0.65 + latest * 0.25 + jitter * 0.1;
  };

  const ensureBackgroundOptimization = async () => {
    if (Platform.OS !== 'android') return true;
    if (batteryOptimizationAskedRef.current) return true;
    const ignored = await isIgnoringBatteryOptimizations();
    if (ignored) return true;
    batteryOptimizationAskedRef.current = true;
    openBatteryOptimizationSettings().catch(() => {});
    return false;
  };

  useEffect(() => {
    const refreshNetworkInfo = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastNetworkRefreshRef.current < 3000) return;
      lastNetworkRefreshRef.current = now;
      const detailedInfo = await getDetailedNetworkInfo();
      setNetworkInfo(detailedInfo);
      setIsConnected(!!detailedInfo.isConnected);
    };

    const unsubscribe = NetInfo.addEventListener(async state => {
      setIsConnected(!!state.isConnected);
      await refreshNetworkInfo();
    });

    const initNetwork = async () => {
      await refreshNetworkInfo(true);
    };
    initNetwork();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        const detailedInfo = await getDetailedNetworkInfo();
        setNetworkInfo(detailedInfo);

        if (isBoosting && boostPhase === 'active' && selectedServer) {
          measureServerRef.current?.(selectedServer);
        }
      }
      // Cancel all ping/measurement intervals when app goes to background
      if (nextAppState.match(/inactive|background/)) {
        if (pingTimer.current) {
          clearInterval(pingTimer.current);
          pingTimer.current = null;
        }
        if (lockTimer.current) {
          clearInterval(lockTimer.current);
          lockTimer.current = null;
        }
        if (progressTimer.current) {
          clearInterval(progressTimer.current);
          progressTimer.current = null;
        }
        if (progressCompleteTimer.current) {
          clearTimeout(progressCompleteTimer.current);
          progressCompleteTimer.current = null;
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [isBoosting, boostPhase, selectedServer]);

  useEffect(() => {
    const syncVpnState = async () => {
      const vpnState = await getVpnState();
      if (!vpnState?.active) return;
      setTunnelConfig(prev => {
        if (prev) return prev;
        if (!vpnState.relayHost || !vpnState.relayPort) return null;
        return {
          sessionId: 'restored-session',
          provider: 'Android VPN',
          tunnelMode: 'relay-edge',
          supported: true,
          relay: {
            host: vpnState.relayHost,
            port: vpnState.relayPort,
            transport: 'websocket',
            path: vpnState.relayPath ?? '/relay/socket',
            tls: true,
            token: '',
          },
          routes: ['0.0.0.0/0'],
          dns: ['1.1.1.1', '8.8.8.8'],
          notes: [],
          source: 'Android VPN',
        };
      });
    };
    syncVpnState().catch(() => {});
  }, []);

  useEffect(() => {
    const loadBackendServers = async () => {
      const remoteServers = await fetchBackendServers();
      if (!remoteServers.length) return;
      setServerCatalog(prev => {
        const staticAuto =
          prev.find(server => server.id === 'auto') ?? servers[0];
        return [staticAuto, ...remoteServers];
      });
    };

    loadBackendServers().catch(() => {});
  }, []);

  useEffect(() => {
    const loadGames = async () => {
      try {
        const installed = await getInstalledGames();
        if (installed.length) {
          const onlyGames = installed.filter(app => app.isGame);
          const mapped = onlyGames.map(app => ({
            id: app.packageName,
            name: app.name,
            packageName: app.packageName,
            iconUri: app.icon ? `data:image/png;base64,${app.icon}` : undefined,
            subtitle: 'Installed game',
          }));
          setGames(mapped);
          return mapped;
        } else {
          setGames([]);
          return [];
        }
      } catch (error) {
        console.error('Failed to load games:', error);
        return [];
      }
    };

    const restoreBoost = async (installedGames: Game[]) => {
      try {
        const state = await getBoostState();
        if (!state?.active) return;
        const restoredGame = installedGames.find(
          game => game.packageName === state.packageName,
        );
        const restoredServer = availableServers.find(
          server => server.name === state.serverName,
        );
        const startedRecently =
          typeof state.startTime === 'number' &&
          state.startTime > 0 &&
          Date.now() - state.startTime < 6 * 60 * 60 * 1000;

        if (!restoredGame || !restoredServer || !startedRecently) {
          await clearBoostState();
          setIsBoosting(false);
          setBoostPhase('idle');
          setBoostProgress(0);
          return;
        }

        setSelectedGame(restoredGame);
        setSelectedServer(restoredServer);
        setLockedServerId(restoredServer.id);
        setIsBoosting(true);
        setBoostPhase('active');
        setBoostProgress(100);
      } catch (error) {
        console.error('Failed to restore boost state:', error);
        await clearBoostState();
      }
    };

    const initialize = async () => {
      const installedGames = await loadGames();
      await restoreBoost(installedGames);
    };

    initialize();
  }, [availableServers]);

  useEffect(() => {
    Tts.getInitStatus()
      .then(() => Tts.setDefaultRate(0.45))
      .then(() => Tts.setDefaultPitch(1.0))
      .then(() => Tts.voices())
      .then(voices => {
        const english = voices.filter(
          v => v.language?.startsWith('en') && !v.networkConnectionRequired,
        );
        const male = english.find(v =>
          (v.name || '').toLowerCase().includes('male'),
        );
        const preferred = male || english[0];
        if (preferred?.id) {
          Tts.setDefaultVoice(preferred.id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMediaVolume(settings.voiceVolume);
  }, [settings.voiceVolume]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (tab === 'boost') {
        setTab('games');
        return true;
      }
      if (isBoosting) {
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [settingsOpen, tab, isBoosting]);

  useEffect(() => {
    const report = (error: any, isFatal?: boolean) => {
      const payload = `[${new Date().toISOString()}] ${
        isFatal ? 'FATAL' : 'ERROR'
      }: ${error?.message ?? error}\n${error?.stack ?? ''}`;
      writeErrorLog(payload);
    };
    const handler = (global as any).ErrorUtils?.getGlobalHandler?.();
    if ((global as any).ErrorUtils?.setGlobalHandler) {
      (global as any).ErrorUtils.setGlobalHandler(
        (err: any, isFatal?: boolean) => {
          report(err, isFatal);
          if (handler) handler(err, isFatal);
        },
      );
    }
  }, []);

  useEffect(() => {
    selectedServerRef.current = selectedServer;
  }, [selectedServer]);

  useEffect(() => {
    isBoostingRef.current = isBoosting;
  }, [isBoosting]);

  useEffect(() => {
    pingMapRef.current = pingMap;
  }, [pingMap]);

  useEffect(() => {
    pingHistoryRef.current = pingHistory;
  }, [pingHistory]);

  useEffect(() => {
    if (!isBoosting || !selectedServer) {
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
      return;
    }

    pingTimer.current = setInterval(() => {
      if (!scanRunningRef.current && measureServerRef.current) {
        measureServerRef.current(selectedServer);
      }
    }, PING_INTERVAL_MS);

    return () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [isBoosting, selectedServer]);

  useEffect(() => {
    if (!selectedServer || scanRunningRef.current) return;
    const hasFreshPing = (() => {
      const entry = pingMap[selectedServer.id];
      if (!entry || typeof entry.ms !== 'number') return false;
      return Date.now() - entry.updatedAt < 15000;
    })();
    if (hasFreshPing) return;
    measureServerRef
      .current?.(selectedServer, isBoosting ? 1 : 0, selectedGame)
      .catch(() => {});
  }, [
    selectedServer?.id,
    isBoosting,
    selectedGame?.id,
    selectedGame,
    selectedServer,
    networkInfo?.type,
    isConnected,
    pingMap,
  ]);

  useEffect(() => {
    if (!isBoosting) {
      if (lockTimer.current) {
        clearInterval(lockTimer.current);
        lockTimer.current = null;
      }
      return;
    }

    scanBestServerRef.current?.();
    lockTimer.current = setInterval(() => {
      scanBestServerRef.current?.();
    }, LOCK_SCAN_INTERVAL_MS);

    return () => {
      if (lockTimer.current) clearInterval(lockTimer.current);
    };
  }, [isBoosting, selectedGame?.id, selectedServer?.id]);

  useEffect(() => {
    if (boostPhase !== 'progress') {
      if (progressAnimRef.current) {
        clearInterval(progressAnimRef.current);
        progressAnimRef.current = null;
      }
      setBoostProgress(0);
      return;
    }

    if (progressAnimRef.current) {
      console.log('[BOOST] Interval already running, skipping');
      return;
    }

    console.log('[BOOST] Progress phase started');

    if (selectedGame?.name) {
      const key = `start:${selectedGame.name}`;
      if (spokenRef.current !== key) {
        spokenRef.current = key;
        speak(`Boosting ${selectedGame.name} started`);
      }
    }

    const duration = 8000;
    const startTime = Date.now();
    console.log('[BOOST] Duration:', duration, 'ms');

    progressAnimRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, Math.floor((elapsed / duration) * 100));
      console.log('[BOOST] Progress:', progress, '% elapsed:', elapsed, 'ms');
      setBoostProgress(progress);
      
      if (progress >= 100) {
        console.log('[BOOST] Progress complete');
        clearInterval(progressAnimRef.current);
        progressAnimRef.current = null;
        if (isBoostingRef.current) setBoostPhase('active');
      }
    }, 100);

    return () => {
      if (progressAnimRef.current) {
        clearInterval(progressAnimRef.current);
        progressAnimRef.current = null;
      }
    };
  }, [boostPhase, selectedGame?.name]);

  useEffect(() => {
    if (boostPhase !== 'active' || !isBoosting || !selectedGame?.packageName)
      return;
    if (launchedRef.current === selectedGame.packageName) return;
    launchedRef.current = selectedGame.packageName;
    (async () => {
      const notificationOk = await ensureNotificationPermission();
      if (!notificationOk) {
        await handleStopRef.current?.();
        return;
      }
      try {
        const ping = pingMap[selectedServer?.id ?? '']?.ms ?? -1;
        await startBoostService(
          selectedGame.name,
          selectedGame.packageName ?? '',
          selectedServer?.name ?? 'Auto',
          typeof ping === 'number' ? ping : -1,
        );
      } catch (error) {
        console.error('Failed to start boost service:', error);
      }
      const key = `active:${selectedGame.name}`;
      if (spokenRef.current !== key) {
        spokenRef.current = key;
        speak(`Boosting ${selectedGame.name} optimized`);
      }
      if (autoOpenTimer.current) {
        clearTimeout(autoOpenTimer.current);
        autoOpenTimer.current = null;
      }
      const delayMs = Math.max(0, settings.autoOpenDelaySec * 1000);
      autoOpenTimer.current = setTimeout(async () => {
        if (
          !isBoosting ||
          boostPhase !== 'active' ||
          !selectedGame ||
          !selectedGame.packageName
        )
          return;
        await launchInstalledApp(selectedGame.packageName);
      }, delayMs);
    })();
  }, [
    boostPhase,
    isBoosting,
    selectedGame?.packageName,
    selectedGame?.name,
    selectedGame,
    selectedServer?.name,
    selectedServer,
    settings.autoOpenDelaySec,
    pingMap,
  ]);

  useEffect(() => {
    if (!isBoosting || !selectedGame?.name || !selectedServer?.name) return;
    const now = Date.now();
    if (now - notifyThrottleRef.current < 30000) return;
    const signature = `${selectedServer.id}`;
    if (notifiedServerRef.current === signature) return;
    notifiedServerRef.current = signature;
    notifyThrottleRef.current = now;
    const ping = pingMap[selectedServer?.id ?? '']?.ms ?? -1;
    startBoostService(
      selectedGame.name,
      selectedGame.packageName ?? '',
      selectedServer.name,
      typeof ping === 'number' ? ping : -1,
    ).catch(() => {});
  }, [
    isBoosting,
    selectedGame?.name,
    selectedGame?.packageName,
    selectedServer?.id,
    selectedServer?.name,
    pingMap,
  ]);

  useEffect(() => {
    if (boostPhase === 'active' && !boostStartTime) {
      setBoostStartTime(Date.now());
    }
  }, [boostPhase, boostStartTime]);

  useEffect(() => {
    if (boostPhase === 'progress' || boostPhase === 'active') {
      setTab('boost');
    }
  }, [boostPhase]);

  useEffect(() => {
    if (boostPhase === 'idle' && tab === 'boost') {
      setTab('games');
    }
  }, [boostPhase, tab]);

  const handleBoostGame = async (game: Game) => {
    console.log('[BOOST] handleBoostGame called, game:', game.name);
    if (isBoosting && selectedGame?.id !== game.id) return;
    setSelectedGame(game);
    console.log('[BOOST] Selected game set');

    const currentServer =
      selectedServer && selectedServer.id !== 'auto'
        ? selectedServer
        : availableServers[0];
    const pingEntryForCurrent = currentServer
      ? pingMapRef.current[currentServer.id]
      : undefined;
    const currentPing =
      typeof pingEntryForCurrent?.ms === 'number'
        ? pingEntryForCurrent.ms
        : undefined;
    const currentHistory = currentServer
      ? pingHistoryRef.current[currentServer.id] ?? []
      : [];
    const currentJitter =
      currentHistory.length > 1
        ? Math.round(
            computeJitter(currentHistory.slice(-8).map(item => item.ms)),
          )
        : undefined;
    const initialServer =
      selectedServer && selectedServer.id !== 'auto'
        ? selectedServer
        : availableServers[0];
    let server = initialServer;
    if (!server) return;
    console.log('[BOOST] Setting state - isBoosting, boostPhase, boostProgress');
    setSelectedServer(server);
    setIsBoosting(true);
    setBoostPhase('progress');
    setBoostProgress(0);
    progressStartRef.current = null;
    setTab('boost');
    console.log('[BOOST] State set complete');

    fetchOptimizationProfile({
      gameId: game.packageName ?? game.id,
      clientPingMs: currentPing,
      jitterMs: currentJitter,
      networkType: networkInfo?.type,
      country: selectedServer?.country,
    })
      .then(setOptimizationProfile)
      .catch(() => {});

    fetchTunnelConfig({
      gameId: game.id,
      packageName: game.packageName ?? undefined,
      preferredRegion: server.region,
      networkType: networkInfo?.type,
    })
      .then(setTunnelConfig)
      .catch(() => {});

    ensureBackgroundOptimization().catch(() => {});

    const notificationOk = await ensureNotificationPermission();
    if (!notificationOk) {
      setIsBoosting(false);
      setBoostPhase('idle');
      setBoostProgress(0);
      return;
    }
    if (availableServers.length) {
      const bestServer = await findBestServer(game);
      if (bestServer) {
        server = bestServer.server;
        setSelectedServer(bestServer.server);
        setLockedServerId(bestServer.server.id);
      }
    }
    const measured = await measureServer(server, 2, game);
    try {
      const ping =
        typeof measured?.ms === 'number'
          ? measured.ms
          : pingMapRef.current[server.id]?.ms ?? -1;
      await startBoostService(
        game.name,
        game.packageName ?? '',
        server.name,
        typeof ping === 'number' ? ping : -1,
      );
      networkOptimizer.startOptimization().catch(() => {});
      if (typeof ping === 'number' && ping > 0) {
        const jitter = jitterMs || 10;
        const loss = packetLossPct || 0;
        networkOptimizer.updateNetworkMetrics({pingMs: ping, jitterMs: jitter, packetLossPct: loss}).catch(() => {});
      }
      const fetchedTunnelConfig = await fetchTunnelConfig({
        gameId: game.id,
        packageName: game.packageName ?? undefined,
        preferredRegion: server.region,
        networkType: networkInfo?.type,
      });
      if (fetchedTunnelConfig?.supported) {
        const vpnPrepared = await prepareVpn();
        if (vpnPrepared) {
          await startVpnRelayService(
            game.name,
            fetchedTunnelConfig.relay.host,
            fetchedTunnelConfig.relay.port,
            fetchedTunnelConfig.relay.path ?? '/relay/socket',
            fetchedTunnelConfig.relay.token,
          );
        }
      }
    } catch {}
  };

  const handleOpenGame = async () => {
    if (!selectedGame?.packageName) return;
    await launchInstalledApp(selectedGame.packageName);
  };

  const handleStop = async () => {
    setIsBoosting(false);
    setBoostPhase('idle');
    setBoostProgress(0);
    setOptimizationProfile(null);
    setBoostStartTime(undefined);
    setJitterMs(0);
    setPacketLossPct(0);
    progressStartRef.current = null;
    if (autoOpenTimer.current) {
      clearTimeout(autoOpenTimer.current);
      autoOpenTimer.current = null;
    }
    await stopBoostService();
    await stopVpnService();
    launchedRef.current = null;
    setLockedServerId(null);
    setTunnelConfig(null);
    setTab('games');
    if (selectedGame?.name) {
      const key = `stop:${selectedGame.name}`;
      if (spokenRef.current !== key) {
        spokenRef.current = key;
        speak(`Boosting ${selectedGame.name} stopped`);
      }
    }
  };

  const measureTarget = async (
    host: string,
    port: number,
    timeoutMs: number,
    retries: number,
  ) => {
    const samples: number[] = [];
    let lastError = 'timeout';
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const pingResult = await tcpPing(host, port, timeoutMs);
        if (
          typeof pingResult.ms === 'number' &&
          pingResult.ms > 0 &&
          pingResult.ms < 5000
        ) {
          samples.push(pingResult.ms);
        } else if (pingResult.error) {
          lastError = pingResult.error;
        }
      } catch (err: any) {
        lastError = err?.message ?? 'connection error';
      }
    }
    return {samples, lastError};
  };

  const measureBaselineNetwork = async (timeoutMs: number) => {
    const baselineTargets = [
      {host: '1.1.1.1', port: 443},
      {host: '8.8.8.8', port: 443},
    ];
    const allSamples: number[] = [];
    let lastError = 'baseline timeout';
    for (const target of baselineTargets) {
      const measurement = await measureTarget(
        target.host,
        target.port,
        timeoutMs,
        0,
      );
      if (measurement.samples.length) {
        allSamples.push(...measurement.samples);
      }
      if (measurement.lastError) {
        lastError = measurement.lastError;
      }
    }
    return {samples: allSamples, lastError};
  };

  const measureServer = async (
    server: Server,
    retries = 2,
    gameOverride?: Game | null,
  ) => {
    if (!server || scanRunningRef.current) {
      return undefined;
    }

    scanRunningRef.current = true;
    let netInfo: Awaited<ReturnType<typeof getDetailedNetworkInfo>> | null =
      null;

    try {
      netInfo = await getDetailedNetworkInfo();
      traceMeasure(
        `start server=${server.id} name=${server.name} type=${
          netInfo.type
        } connected=${String(netInfo.isConnected)} speed=${String(
          netInfo.connectionSpeed,
        )}`,
      );

      let baseTimeout = 2000;
      if (netInfo.type === 'wifi') {
        if (netInfo.strength && netInfo.strength > -60) {
          baseTimeout = 1500;
        } else {
          baseTimeout = 2500;
        }
      } else if (netInfo.type === 'cellular') {
        if (netInfo.cellularGeneration === '5g') baseTimeout = 2000;
        else if (netInfo.cellularGeneration === '4g') baseTimeout = 2500;
        else baseTimeout = 3000;
      }

      if (
        typeof netInfo.connectionSpeed === 'number' &&
        netInfo.connectionSpeed > 0
      ) {
        if (netInfo.connectionSpeed >= 50)
          baseTimeout = Math.min(baseTimeout, 1500);
        else if (netInfo.connectionSpeed <= 5)
          baseTimeout = Math.max(baseTimeout, 3000);
      }

      const TCP_TIMEOUT = baseTimeout;
      const target = getServerTarget(server);
      if (!target) {
        traceMeasure(`invalid-target server=${server.id}`);
        return {ms: null, error: 'invalid server target'};
      }

      let routeMeasurement = server.pingUrl
        ? {samples: [] as number[], lastError: 'pending'}
        : await measureTarget(target.host, target.port, TCP_TIMEOUT, retries);

      if (server.pingUrl) {
        const httpSamples: number[] = [];
        let httpError = 'no samples';
        const candidateUrls = getPingCandidates(server);
        traceMeasure(
          `http-candidates server=${server.id} urls=${
            candidateUrls.join(',') || 'none'
          }`,
        );

        for (let attempt = 0; attempt <= retries; attempt += 1) {
          let resolved = false;
          const backoff = Math.pow(2, attempt) * 100;

          const nativePingPromises = candidateUrls.map(candidateUrl =>
            nativePingUrl(candidateUrl, Math.max(1800, TCP_TIMEOUT + 300))
              .then(nativeMs => ({ms: nativeMs, url: candidateUrl}))
              .catch(error => ({
                error: error?.message ?? 'native ping failed',
                url: candidateUrl,
              })),
          );
          const nativeResults = await Promise.all(nativePingPromises);
          for (const result of nativeResults) {
            if (
              typeof result.ms === 'number' &&
              result.ms > 0 &&
              result.ms < 5000
            ) {
              httpSamples.push(result.ms);
              resolved = true;
              traceMeasure(
                `native-ping server=${server.id} attempt=${attempt} url=${
                  result.url
                } ms=${String(result.ms)}`,
              );
              break;
            } else if (result.error) {
              httpError = result.error;
              traceMeasure(
                `native-ping-error server=${server.id} attempt=${attempt} url=${result.url} error=${httpError}`,
              );
            }
          }
          if (resolved) break;

          const httpPingPromises = candidateUrls.map(candidateUrl =>
            httpPing(candidateUrl, Math.max(1800, TCP_TIMEOUT + 300))
              .then(result => ({...result, url: candidateUrl}))
              .catch(error => ({
                error: error?.message ?? 'http ping failed',
                url: candidateUrl,
              })),
          );
          const httpResults = await Promise.all(httpPingPromises);
          for (const result of httpResults) {
            if (
              typeof result.ms === 'number' &&
              result.ms > 0 &&
              result.ms < 5000
            ) {
              httpSamples.push(result.ms);
              resolved = true;
              traceMeasure(
                `http-ping server=${server.id} attempt=${attempt} url=${
                  result.url
                } ms=${String(result.ms)}`,
              );
              break;
            }
            if (result.error) {
              httpError = result.error;
              traceMeasure(
                `http-ping-error server=${server.id} attempt=${attempt} url=${result.url} error=${httpError}`,
              );
            }
          }
          if (!resolved && attempt < retries) {
            await new Promise(res => setTimeout(res, backoff));
          }
        }

        routeMeasurement = {
          samples: httpSamples,
          lastError: httpSamples.length ? undefined : httpError,
        };
      }

      const gameTargets = getGameTargets(gameOverride);
      let gameSamples: number[] = [];
      for (const gameTarget of gameTargets) {
        const measurement = await measureTarget(
          gameTarget.host,
          gameTarget.port,
          Math.min(2500, TCP_TIMEOUT + 500),
          0,
        );
        gameSamples = gameSamples.concat(measurement.samples);
      }

      const baselineMeasurement = await measureBaselineNetwork(TCP_TIMEOUT);

      const routeMs = filteredAverage(routeMeasurement.samples);
      const gameMs = filteredAverage(gameSamples);
      traceMeasure(
        `samples server=${server.id} route=${JSON.stringify(
          routeMeasurement.samples,
        )} baseline=${JSON.stringify(
          baselineMeasurement.samples,
        )} game=${JSON.stringify(gameSamples)} routeMs=${String(
          routeMs,
        )} gameMs=${String(gameMs)}`,
      );

      if (routeMs !== null || gameMs !== null) {
        const routeOnly = routeMeasurement.samples.length
          ? Math.round(Math.min(...routeMeasurement.samples))
          : null;
        const baselineOnly = baselineMeasurement.samples.length
          ? Math.round(Math.min(...baselineMeasurement.samples))
          : null;
        const fallbackOnly =
          typeof gameMs === 'number' ? Math.round(gameMs) : null;
        const stabilizedMs = Math.max(
          1,
          baselineOnly !== null
            ? Math.min(routeOnly ?? baselineOnly, baselineOnly)
            : routeOnly ?? fallbackOnly ?? 1,
        );

        let estimatedSpeed = 0;
        if (stabilizedMs < 20) estimatedSpeed = 100;
        else if (stabilizedMs < 40) estimatedSpeed = 50;
        else if (stabilizedMs < 60) estimatedSpeed = 25;
        else if (stabilizedMs < 80) estimatedSpeed = 15;
        else if (stabilizedMs < 100) estimatedSpeed = 10;
        else if (stabilizedMs < 150) estimatedSpeed = 5;
        else estimatedSpeed = 2;

        errorCountRef.current = 0;

        const quality = await getConnectionQuality();
        const currentNetworkType = netInfo?.type;

        const prevEma = emaRef.current[server.id];
        const emaMs =
          prevEma !== undefined
            ? Math.round(EMA_ALPHA * stabilizedMs + (1 - EMA_ALPHA) * prevEma)
            : stabilizedMs;
        emaRef.current[server.id] = emaMs;

        const counts = pingAttemptCountRef.current[server.id] ?? {
          total: 0,
          failed: 0,
        };
        counts.total += 1;
        pingAttemptCountRef.current[server.id] = counts;

        const lossForServer =
          counts.total > 0
            ? Math.round((counts.failed / counts.total) * 100)
            : 0;
        const jitterForServer = computeJitter(routeMeasurement.samples);

        if (server.id === selectedServerRef.current?.id) {
          setJitterMs(Math.round(jitterForServer));
          setPacketLossPct(lossForServer);
        }

        const pingWithContext: PingEntry = {
          ms: emaMs,
          updatedAt: Date.now(),
          error: undefined,
          networkType: currentNetworkType,
          connectionQuality: quality,
          estimatedSpeed,
        };

        setPingMap(prev => ({
          ...prev,
          [server.id]: pingWithContext,
        }));
        traceMeasure(
          `set-ping-map server=${server.id} raw=${stabilizedMs} ema=${emaMs}`,
        );

        setPingHistory(prev => {
          const next = prev[server.id] ? [...prev[server.id]] : [];
          next.push({
            ms: emaMs,
            t: Date.now(),
            networkType: currentNetworkType,
            estimatedSpeed,
          });
          return {...prev, [server.id]: next.slice(-240)};
        });

        if (
          isBoostingRef.current &&
          selectedGame &&
          selectedServer &&
          boostPhase === 'active'
        ) {
          startBoostService(
            selectedGame.name,
            selectedGame.packageName ?? '',
            selectedServer.name,
            emaMs,
          ).catch(() => {});
        }

        return {ms: emaMs, routeMs, gameMs, jitterMs: jitterForServer};
      }

      errorCountRef.current += 1;
      const countsF = pingAttemptCountRef.current[server.id] ?? {
        total: 0,
        failed: 0,
      };
      countsF.total += 1;
      countsF.failed += 1;
      pingAttemptCountRef.current[server.id] = countsF;
      if (server.id === selectedServerRef.current?.id) {
        const lossF =
          countsF.total > 0
            ? Math.round((countsF.failed / countsF.total) * 100)
            : 0;
        setPacketLossPct(lossF);
      }
      traceMeasure(
        `measure-failed server=${server.id} error=${
          routeMeasurement.lastError || 'all retries failed'
        }`,
      );
      setPingMap(prev => {
        const existing = prev[server.id];
        if (typeof existing?.ms === 'number') {
          return {
            ...prev,
            [server.id]: {
              ...existing,
              updatedAt: Date.now(),
              error: undefined,
              networkType: netInfo?.type,
            },
          };
        }
        return {
          ...prev,
          [server.id]: {
            ms: null,
            updatedAt: Date.now(),
            error: routeMeasurement.lastError || 'all retries failed',
            networkType: netInfo?.type,
          },
        };
      });

      return {ms: null, error: routeMeasurement.lastError};
    } catch (error: any) {
      errorCountRef.current += 1;
      traceMeasure(
        `measure-exception server=${server.id} error=${
          error?.message ?? 'measurement failed'
        }`,
      );
      setPingMap(prev => {
        const existing = prev[server.id];
        if (typeof existing?.ms === 'number') {
          return {
            ...prev,
            [server.id]: {
              ...existing,
              updatedAt: Date.now(),
              error: undefined,
              networkType: netInfo?.type,
            },
          };
        }
        return {
          ...prev,
          [server.id]: {
            ms: null,
            updatedAt: Date.now(),
            error: error?.message ?? 'measurement failed',
            networkType: netInfo?.type,
          },
        };
      });
      return {ms: null, error: error?.message ?? 'measurement failed'};
    } finally {
      scanRunningRef.current = false;
    }
  };

  const findBestServer = async (game: Game | null) => {
    let best: {server: Server; score: number; ping: number} | null = null;
    for (const server of availableServers) {
      const measurement = await measureServer(server, 1, game);
      if (typeof measurement?.ms !== 'number') continue;
      const score = scoreServer(server.id, measurement.ms);
      if (!best || score < best.score) {
        best = {server, score, ping: measurement.ms};
      }
    }
    return best;
  };

  const measureServerRef = useRef<
    (
      server: Server,
      retries?: number,
      gameOverride?: Game | null,
    ) => Promise<
      | {
          ms: number | null;
          error?: string;
          routeMs?: number;
          gameMs?: number;
          jitterMs?: number;
        }
      | undefined
    >
  >();

  useEffect(() => {
    measureServerRef.current = measureServer;
    scanBestServerRef.current = scanBestServer;
    handleStopRef.current = handleStop;
  });

  const scanBestServer = async () => {
    if (lockRunningRef.current) return;
    lockRunningRef.current = true;
    const best = await findBestServer(selectedGame);

    if (best) {
      if (
        !selectedServerRef.current ||
        selectedServerRef.current.id !== best.server.id
      ) {
        setSelectedServer(best.server);
      }
      setLockedServerId(best.server.id);
    }

    lockRunningRef.current = false;
  };

  const ensureNotificationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version < 33) return true;
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (alreadyGranted) return true;
    if (notificationAskedRef.current) {
      Linking.openSettings();
      return false;
    }
    notificationAskedRef.current = true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
    Linking.openSettings();
    return false;
  };

  const speak = (text: string) => {
    Tts.speak(text, {
      androidParams: {
        KEY_PARAM_VOLUME: 0.2,
      },
    } as any);
  };

  const activeServer = useMemo(() => {
    if (lockedServerId) {
      const lockedServer = availableServers.find(
        server => server.id === lockedServerId,
      );
      if (lockedServer) {
        return lockedServer;
      }
    }
    if (selectedServer && selectedServer.id !== 'auto') {
      return selectedServer;
    }
    const freshestEntry = Object.entries(pingMap)
      .filter(([, entry]) => typeof entry?.ms === 'number')
      .sort((a, b) => (b[1]?.updatedAt ?? 0) - (a[1]?.updatedAt ?? 0))[0];
    if (!freshestEntry) {
      return selectedServer;
    }
    return (
      availableServers.find(server => server.id === freshestEntry[0]) ??
      selectedServer
    );
  }, [availableServers, lockedServerId, pingMap, selectedServer]);

  const pingEntry = useMemo(() => {
    if (!activeServer) return undefined;
    return pingMap[activeServer.id];
  }, [activeServer, pingMap]);

  const pingHistoryForServer = useMemo(() => {
    if (!activeServer) return [];
    return pingHistory[activeServer.id] ?? [];
  }, [activeServer, pingHistory]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.screen}>
          {tab === 'games' ? (
            <GamesScreen
              games={games}
              selectedGame={selectedGame}
              selectedServer={selectedServer}
              isBoosting={isBoosting}
              lockedServerId={lockedServerId}
              onBoost={handleBoostGame}
              onOpenBoost={() => {
                if (boostPhase !== 'idle') setTab('boost');
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              networkInfo={networkInfo}
            />
          ) : null}

          {tab === 'boost' ? (
            <BoostStatusScreen
              selectedGame={selectedGame}
              selectedServer={activeServer}
              isBoosting={isBoosting}
              boostPhase={boostPhase}
              boostProgress={boostProgress}
              pingEntry={pingEntry}
              pingHistory={pingHistoryForServer}
              jitterMs={jitterMs}
              packetLossPct={packetLossPct}
              isConnected={isConnected}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenGame={handleOpenGame}
              onStop={handleStop}
              onShareLogs={() => {
                shareErrorLog();
              }}
              networkInfo={networkInfo}
              optimizationProfile={optimizationProfile}
            />
          ) : null}
        </View>

        <SettingsModal
          visible={settingsOpen}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onChange={setSettings}
        />

        <BottomNav
          active={tab}
          onChange={setTab}
          canOpenBoost={boostPhase !== 'idle'}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  screen: {
    flex: 1,
    padding: theme.spacing.lg,
    paddingBottom: 10,
  },
});
