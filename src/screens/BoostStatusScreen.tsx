import React, {useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line,
} from 'react-native-svg';
import {theme} from '../theme';
import type {Game} from '../data/games';
import type {Server} from '../data/servers';
import type {PingEntry} from '../types/ping';

type BoostPhase = 'idle' | 'progress' | 'active';

type Props = {
  selectedGame: Game | null;
  selectedServer: Server | null;
  isBoosting: boolean;
  boostPhase: BoostPhase;
  boostProgress: number;
  pingEntry: PingEntry | undefined;
  pingHistory: {ms: number; t: number}[];
  boostStartTime?: number;
  games: Game[];
  onSelectGame: (game: Game) => void;
  isConnected: boolean;
  lockedServerId: string | null;
  onOpenSettings: () => void;
  onOpenGame: () => void;
  onStop: () => void;
  onShareLogs: () => void;
  optimizationProfile?: {
    expectedBeforeMs: number | null;
    expectedAfterMs: number | null;
    aggressiveness: string;
    source: string;
  } | null;
  networkInfo?: {
    type?: string;
    ssid?: string | null;
    carrier?: string | null;
    ipAddress?: string | null;
    isConnected?: boolean;
    connectionSpeed?: number | null;
  } | null;
  jitterMs?: number;
  packetLossPct?: number;
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_H_PAD = 44;
const CHART_WIDTH = SCREEN_WIDTH - CHART_H_PAD * 2 - 32;
const CHART_HEIGHT = 120;

function pingColor(ms: number): string {
  if (ms < 60) return '#00D68F';
  if (ms < 100) return '#FFAA00';
  return '#FF4D6D';
}

function pingQualityLabel(ms: number): string {
  if (ms < 40) return 'Excellent';
  if (ms < 70) return 'Good';
  if (ms < 100) return 'Fair';
  if (ms < 150) return 'Poor';
  return 'Bad';
}

const fmt = (n: number) => String(n.toFixed(1));

const buildSpline = (pts: {x: number; y: number}[]) => {
  if (pts.length < 2) return '';
  let d = `M${fmt(pts[0].x)},${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${fmt(cp1x)},${fmt(cp1y)},${fmt(cp2x)},${fmt(cp2y)},${fmt(
      p2.x,
    )},${fmt(p2.y)}`;
  }
  return d;
};

export const BoostStatusScreen = ({
  selectedGame,
  selectedServer,
  isBoosting,
  boostPhase,
  boostProgress,
  pingEntry,
  pingHistory,
  games,
  onSelectGame,
  isConnected,
  onOpenSettings,
  onOpenGame,
  onStop,
  onShareLogs,
  optimizationProfile,
  networkInfo,
  jitterMs,
  packetLossPct,
}: Props) => {
  const hasPing = typeof pingEntry?.ms === 'number';
  const currentPingMs = hasPing ? (pingEntry?.ms as number) : 0;

  const speedLabel = useMemo(() => {
    if (
      typeof networkInfo?.connectionSpeed === 'number' &&
      networkInfo.connectionSpeed > 0
    ) {
      return `${Math.round(networkInfo.connectionSpeed)} Mbps`;
    }
    if (!hasPing) return '—';
    const ms = currentPingMs;
    if (ms < 20) return '100+ Mbps';
    if (ms < 40) return '~50 Mbps';
    if (ms < 70) return '~25 Mbps';
    if (ms < 100) return '~10 Mbps';
    return '~5 Mbps';
  }, [hasPing, networkInfo?.connectionSpeed, currentPingMs]);

  const jitterLabel = useMemo(() => {
    if (typeof jitterMs === 'number' && jitterMs >= 0)
      return `${Math.round(jitterMs)} ms`;
    if (pingHistory.length > 2) {
      const recent = pingHistory.slice(-8).map(s => s.ms);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const jitter = Math.sqrt(
        recent.reduce((a, v) => a + Math.pow(v - avg, 2), 0) / recent.length,
      );
      return `${Math.round(jitter)} ms`;
    }
    return '—';
  }, [jitterMs, pingHistory]);

  const lossLabel = useMemo(() => {
    if (typeof packetLossPct === 'number')
      return `${Math.round(packetLossPct)}%`;
    return '0%';
  }, [packetLossPct]);

  const emaHistory = useMemo(() => {
    if (!pingHistory.length) return [];
    const alpha = 0.3;
    const result: {ms: number; t: number}[] = [];
    let ema = pingHistory[0].ms;
    for (const s of pingHistory) {
      ema = alpha * s.ms + (1 - alpha) * ema;
      result.push({ms: ema, t: s.t});
    }
    return result;
  }, [pingHistory]);

  const displayHistory = useMemo(() => {
    if (!emaHistory.length) return [];
    const windowMs = 3 * 60 * 1000;
    const endT = emaHistory[emaHistory.length - 1].t;
    const startT = endT - windowMs;
    const trimmed = emaHistory.filter(s => s.t >= startT);
    if (trimmed.length <= 40) return trimmed;
    const step = Math.ceil(trimmed.length / 40);
    return trimmed.filter((_, i) => i % step === 0);
  }, [emaHistory]);

  const {points, yMin, yMax} = useMemo(() => {
    if (!displayHistory.length) {
      return {points: [], yMin: 0, yMax: 200};
    }
    const vals = displayHistory.map(s => s.ms);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const pad = Math.max(10, (rawMax - rawMin) * 0.2);
    const yMin = Math.max(0, rawMin - pad);
    const yMax = rawMax + pad;
    const range = Math.max(yMax - yMin, 10);

    const endT = displayHistory[displayHistory.length - 1].t;
    const startT = displayHistory[0].t;
    const tRange = Math.max(endT - startT, 1);

    const pts = displayHistory.map(s => ({
      x: ((s.t - startT) / tRange) * CHART_WIDTH,
      y:
        CHART_HEIGHT -
        ((s.ms - yMin) / range) * CHART_HEIGHT * 0.9 -
        CHART_HEIGHT * 0.05,
    }));

    return {points: pts, yMin, yMax};
  }, [displayHistory]);

  const linePath = useMemo(() => buildSpline(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length < 2 || !linePath) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${linePath}L${fmt(last.x)},${CHART_HEIGHT}L${fmt(
      first.x,
    )},${CHART_HEIGHT}Z`;
  }, [points, linePath]);

  const currentColor = hasPing ? pingColor(currentPingMs) : theme.colors.accent;

  const beforePing = useMemo(() => {
    if (typeof optimizationProfile?.expectedBeforeMs === 'number') {
      return Math.round(optimizationProfile.expectedBeforeMs);
    }
    const window = pingHistory.slice(0, 8).map(s => s.ms);
    if (!window.length)
      return typeof pingEntry?.ms === 'number' ? pingEntry.ms : null;
    const sorted = [...window].sort((a, b) => a - b);
    return Math.round(sorted[Math.floor(sorted.length / 2)]);
  }, [optimizationProfile?.expectedBeforeMs, pingHistory, pingEntry?.ms]);

  const afterPing = useMemo(() => {
    if (typeof optimizationProfile?.expectedAfterMs === 'number') {
      return Math.round(optimizationProfile.expectedAfterMs);
    }
    const window = emaHistory.slice(-6).map(s => s.ms);
    if (!window.length)
      return typeof pingEntry?.ms === 'number'
        ? Math.round(pingEntry.ms)
        : null;
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    return Math.round(avg);
  }, [optimizationProfile?.expectedAfterMs, emaHistory, pingEntry?.ms]);

  const improvePct = useMemo(() => {
    if (beforePing === null || afterPing === null || beforePing <= 0)
      return null;
    const pct = Math.round(((beforePing - afterPing) / beforePing) * 100);
    return pct;
  }, [beforePing, afterPing]);

  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (boostPhase === 'progress') {
    const ringSize = 180;
    const stroke = 8;
    const r = (ringSize - stroke) / 2;
    const cx = ringSize / 2;
    const cy = ringSize / 2;
    const circumference = 2 * Math.PI * r;
    const ratio = Math.max(0, Math.min(1, boostProgress / 100));
    return (
      <View style={styles.progressWrap}>
        <View style={styles.progressBackdrop} />
        <View style={styles.dialWrap}>
          <Svg
            width={ringSize}
            height={ringSize}
            style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#00D68F" stopOpacity="1" />
                <Stop offset="100%" stopColor="#00FFB3" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke="url(#progressGrad)"
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - ratio)}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          </Svg>
          <View style={styles.dialCenter}>
            <Text style={styles.dialPct}>{boostProgress}%</Text>
            <Text style={styles.dialSub}>BOOSTING</Text>
          </View>
          <Animated.View style={[styles.dialGlow, {opacity: pulse}]} />
        </View>
        <Text style={styles.progressGameName}>
          {selectedGame?.name ?? 'Boosting'}
        </Text>
        <Text style={styles.progressHint}>Optimizing connection…</Text>
        <Pressable onPress={onStop} style={styles.progressStop}>
          <Text style={styles.progressStopText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const statusLabel = !isConnected
    ? 'Offline'
    : isBoosting && hasPing
    ? pingQualityLabel(currentPingMs)
    : 'Idle';
  const statusColor = !isConnected
    ? theme.colors.danger
    : isBoosting && hasPing
    ? pingColor(currentPingMs)
    : theme.colors.textMuted;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Boost Status</Text>
          {selectedGame ? (
            <Text style={styles.headerGame}>{selectedGame.name}</Text>
          ) : null}
        </View>
        <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>

      <View style={styles.pingHeroCard}>
        <View style={styles.pingHeroLeft}>
          <Text
            numberOfLines={1}
            style={[styles.pingHeroValue, {color: currentColor}]}>
            {hasPing ? currentPingMs : '—'}
          </Text>
          <Text style={styles.pingHeroUnit}>ms</Text>
        </View>
        <View style={styles.pingHeroRight}>
          <View style={[styles.statusChip, {borderColor: statusColor}]}>
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
            <Text style={[styles.statusChipText, {color: statusColor}]}>
              {statusLabel}
            </Text>
          </View>
          <Text style={styles.serverName}>
            {selectedServer?.name ?? 'Auto'}
          </Text>
          <Text style={styles.regionTag}>
            {selectedServer?.region ?? '—'} · {selectedServer?.city ?? ''}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{jitterLabel}</Text>
          <Text style={styles.statLbl}>Jitter</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{speedLabel}</Text>
          <Text style={styles.statLbl}>Speed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statVal}>{lossLabel}</Text>
          <Text style={styles.statLbl}>Loss</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartTitle}>Latency Curve</Text>
          <Text style={[styles.chartTag, {color: currentColor}]}>
            {optimizationProfile?.aggressiveness ??
              (hasPing ? pingQualityLabel(currentPingMs) : 'Idle')}
          </Text>
        </View>

        {displayHistory.length >= 2 ? (
          <View style={styles.chartWrap}>
            <View style={styles.chartYLabels}>
              <Text style={styles.axisLabel}>{Math.round(yMax)}</Text>
              <Text style={styles.axisLabel}>
                {Math.round((yMax + yMin) / 2)}
              </Text>
              <Text style={styles.axisLabel}>{Math.round(yMin)}</Text>
            </View>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={currentColor}
                    stopOpacity="0.35"
                  />
                  <Stop
                    offset="100%"
                    stopColor={currentColor}
                    stopOpacity="0"
                  />
                </LinearGradient>
              </Defs>
              <Line
                x1={0}
                y1={CHART_HEIGHT * 0.33}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * 0.33}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              <Line
                x1={0}
                y1={CHART_HEIGHT * 0.66}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * 0.66}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth={1}
              />
              {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={currentColor}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {points.length > 0 ? (
                <>
                  <Circle
                    cx={points[points.length - 1].x}
                    cy={points[points.length - 1].y}
                    r={6}
                    fill={theme.colors.bg}
                  />
                  <Circle
                    cx={points[points.length - 1].x}
                    cy={points[points.length - 1].y}
                    r={4}
                    fill={currentColor}
                  />
                </>
              ) : null}
            </Svg>
          </View>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>
              {isBoosting
                ? 'Measuring latency…'
                : 'Start boosting to see the curve'}
            </Text>
          </View>
        )}

        <View style={styles.pingCompare}>
          <View style={styles.pingCompareItem}>
            <Text style={styles.pingCompareLabel}>Before</Text>
            <Text style={styles.pingCompareValue}>
              {beforePing !== null ? `${beforePing} ms` : '—'}
            </Text>
          </View>
          <View style={styles.pingCompareArrow}>
            {improvePct !== null ? (
              <View
                style={[
                  styles.improvePill,
                  {
                    backgroundColor:
                      improvePct > 0
                        ? 'rgba(0,214,143,0.18)'
                        : 'rgba(255,77,109,0.18)',
                  },
                ]}>
                <Text
                  style={[
                    styles.improveText,
                    {color: improvePct > 0 ? '#00D68F' : '#FF4D6D'},
                  ]}>
                  {improvePct > 0
                    ? `↓ ${improvePct}%`
                    : improvePct === 0
                    ? '→ 0%'
                    : `↑ ${Math.abs(improvePct)}%`}
                </Text>
              </View>
            ) : (
              <Text style={styles.arrowText}>→</Text>
            )}
          </View>
          <View style={styles.pingCompareItem}>
            <Text style={styles.pingCompareLabel}>After</Text>
            <Text
              style={[
                styles.pingCompareValue,
                afterPing !== null && afterPing < (beforePing ?? 999)
                  ? {color: '#00D68F'}
                  : {},
              ]}>
              {afterPing !== null ? `${afterPing} ms` : '—'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.gameStrip}>
        {games.slice(0, 5).map(game => {
          const isSelected = selectedGame?.id === game.id;
          return (
            <Pressable
              key={game.id}
              onPress={() => onSelectGame(game)}
              style={[styles.gameChip, isSelected && styles.gameChipActive]}>
              {game.iconUri ? (
                <Image
                  source={{uri: game.iconUri}}
                  style={styles.gameChipIcon}
                />
              ) : null}
              <Text
                style={[
                  styles.gameChipText,
                  isSelected && {color: theme.colors.accent},
                ]}
                numberOfLines={1}>
                {game.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actionRow}>
        <Pressable onPress={onStop} style={styles.stopButton}>
          <Text style={styles.stopText}>Stop Boost</Text>
        </Pressable>
        <Pressable onPress={onOpenGame} style={styles.openButton}>
          <Text style={styles.openText}>Open Game</Text>
        </Pressable>
      </View>

      <Pressable onPress={onShareLogs} style={styles.shareLogs}>
        <Text style={styles.shareLogsText}>Share Diagnostic Logs</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerGame: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  settingsText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  pingHeroCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pingHeroLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  pingHeroValue: {
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -1,
  },
  pingHeroUnit: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  pingHeroRight: {
    alignItems: 'flex-end',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  serverName: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
  regionTag: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  statsRow: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statVal: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  statLbl: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.border,
  },
  chartCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  chartTitle: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  chartTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  chartYLabels: {
    width: 32,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 6,
    paddingVertical: 4,
    height: CHART_HEIGHT,
  },
  axisLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  pingCompare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pingCompareItem: {
    alignItems: 'center',
    flex: 1,
  },
  pingCompareLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  pingCompareValue: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  pingCompareArrow: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  arrowText: {
    color: theme.colors.textMuted,
    fontSize: 18,
  },
  improvePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  improveText: {
    fontSize: 13,
    fontWeight: '800',
  },
  gameStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  gameChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelAlt,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 140,
  },
  gameChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  gameChipIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 5,
  },
  gameChipText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  stopButton: {
    flex: 1,
    backgroundColor: 'rgba(255,77,109,0.15)',
    borderWidth: 1,
    borderColor: '#FF4D6D',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stopText: {
    color: '#FF4D6D',
    fontWeight: '700',
    fontSize: 14,
  },
  openButton: {
    flex: 1,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openText: {
    color: theme.colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  shareLogs: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  shareLogsText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  progressWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  progressBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#060E1E',
  },
  progressTitle: {
    color: '#BCD8FF',
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 13,
  },
  dialWrap: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialCenter: {
    alignItems: 'center',
  },
  dialPct: {
    color: '#E0F4FF',
    fontWeight: '800',
    fontSize: 36,
  },
  dialSub: {
    color: 'rgba(100,200,255,0.7)',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 2,
  },
  dialGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(0,214,143,0.15)',
  },
  progressGameIcon: {
    marginBottom: 12,
  },
  progressGameIconImage: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.colors.panel,
  },
  progressGameIconFallback: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressGameIconText: {
    color: theme.colors.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  progressGameName: {
    color: '#E0F4FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  progressBarContainer: {
    width: 260,
    marginBottom: 20,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,214,143,0.15)',
    overflow: 'hidden',
  },
  progressBar: {
    width: 220,
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(0,214,143,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressHint: {
    color: 'rgba(150,200,255,0.65)',
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
  },
  progressStop: {
    borderWidth: 1,
    borderColor: 'rgba(255,77,109,0.5)',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  progressStopText: {
    color: '#FF4D6D',
    fontWeight: '700',
    fontSize: 13,
  },
});
