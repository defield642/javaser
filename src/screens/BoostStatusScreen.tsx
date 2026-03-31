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
  isConnected: boolean;
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
const CHART_HEIGHT = 160;

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
  isConnected,
  onOpenSettings,
  onOpenGame,
  onStop,
  onShareLogs,
  optimizationProfile,
  jitterMs,
  packetLossPct,
}: Props) => {
  console.log('[SCREEN] BoostStatusScreen render, boostPhase:', boostPhase, 'boostProgress:', boostProgress);
  const hasPing = typeof pingEntry?.ms === 'number';
  const currentPingMs = hasPing ? (pingEntry?.ms as number) : 0;

  const speedLabel = useMemo(() => {
    if (!hasPing) return '—';
    const ms = currentPingMs;
    if (ms < 20) return '100+ Mbps';
    if (ms < 40) return '~50 Mbps';
    if (ms < 70) return '~25 Mbps';
    if (ms < 100) return '~10 Mbps';
    return '~5 Mbps';
  }, [hasPing, currentPingMs]);

  const jitterLabel = useMemo(() => {
    if (typeof jitterMs === 'number') return `${jitterMs} ms`;
    return '—';
  }, [jitterMs]);

  const lossLabel = useMemo(() => {
    if (typeof packetLossPct === 'number') return `${packetLossPct}%`;
    return '0%';
  }, [packetLossPct]);

  const emaHistory = useMemo(() => {
    if (!pingHistory.length) return [];
    const alpha = 0.3;
    return pingHistory.map((entry, i) => {
      if (i === 0) return entry;
      const prev = pingHistory[i - 1].ms;
      const curr = entry.ms;
      return {ms: prev * alpha + curr * (1 - alpha), t: entry.t};
    });
  }, [pingHistory]);

  const displayHistory = useMemo(() => {
    if (!emaHistory.length) return [];
    const maxAge = 120000;
    const startT = Date.now() - maxAge;
    const filtered = emaHistory.filter(s => s.t >= startT);
    if (filtered.length <= 40) return filtered;
    const step = Math.ceil(filtered.length / 40);
    return filtered.filter((_, i) => i % step === 0);
  }, [emaHistory]);

  const chartData = useMemo(() => {
    if (!displayHistory.length) return {points: [], latestTime: 0};
    const vals = displayHistory.map(s => s.ms);
    const rawMin = Math.min(...vals);
    const rawMax = Math.max(...vals);
    const pad = Math.max(10, (rawMax - rawMin) * 0.2);
    const yMin = Math.max(0, rawMin - pad);
    const yMax = rawMax + pad;
    const range = Math.max(yMax - yMin, 10);
    const now = Date.now();
    const timeRange = Math.max(
      displayHistory[displayHistory.length - 1].t - displayHistory[0].t,
      1000,
    );
    const pts = displayHistory.map(s => ({
      x: ((s.t - displayHistory[0].t) / timeRange) * CHART_WIDTH,
      y:
        CHART_HEIGHT -
        ((s.ms - yMin) / range) * CHART_HEIGHT * 0.85 -
        CHART_HEIGHT * 0.05,
    }));
    return {
      points: pts,
      latestTime: now - displayHistory[0].t,
    };
  }, [displayHistory]);

  const {points, latestTime} = chartData;

  const linePath = useMemo(() => buildSpline(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length < 2 || !linePath) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${linePath}L${fmt(last.x)},${CHART_HEIGHT}L${fmt(
      first.x,
    )},${CHART_HEIGHT}Z`;
  }, [points, linePath]);

  const pulse = useRef(new Animated.Value(0.3)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  useEffect(() => {
    const tick = setInterval(() => forceUpdate(), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.8,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, [floatAnim]);

  if (boostPhase === 'progress') {
    const reticleSize = 260;

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBackdrop} />

        <Animated.View style={[styles.progressGlowBg, {opacity: pulse}]} />

        <View style={styles.progressContent}>
          <Animated.View
            style={[
              styles.progressReticleWrap,
              {transform: [{translateY: floatAnim}]},
            ]}>
            <View style={styles.progressReticleOuter}>
              <Svg width={reticleSize} height={reticleSize}>
                <Defs>
                  <LinearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor="#14B8A6" stopOpacity="1" />
                    <Stop offset="100%" stopColor="#22D3EE" stopOpacity="1" />
                  </LinearGradient>
                  <LinearGradient
                    id="innerGlow"
                    x1="0.5"
                    y1="0"
                    x2="0.5"
                    y2="1">
                    <Stop
                      offset="0%"
                      stopColor="rgba(20,184,166,0.5)"
                      stopOpacity="1"
                    />
                    <Stop
                      offset="100%"
                      stopColor="rgba(20,184,166,0)"
                      stopOpacity="1"
                    />
                  </LinearGradient>
                </Defs>
                <Circle
                  cx={reticleSize / 2}
                  cy={reticleSize / 2}
                  r={reticleSize / 2 - 4}
                  stroke="rgba(51,65,85,0.5)"
                  strokeWidth={1}
                  fill="none"
                />
                <Circle
                  cx={reticleSize / 2}
                  cy={reticleSize / 2}
                  r={reticleSize / 2 - 20}
                  stroke="rgba(20,184,166,0.2)"
                  strokeWidth={8}
                  fill="none"
                />
                <Circle
                  cx={reticleSize / 2}
                  cy={reticleSize / 2}
                  r={reticleSize / 2 - 24}
                  stroke="url(#innerGlow)"
                  strokeWidth={6}
                  fill="none"
                />
                <Circle
                  cx={reticleSize / 2}
                  cy={reticleSize / 2}
                  r={reticleSize / 2 - 24}
                  stroke="url(#progressGrad)"
                  strokeWidth={3}
                  fill="none"
                  strokeDasharray={`${
                    Math.PI * (reticleSize / 2 - 24) * 0.75
                  } ${Math.PI * (reticleSize / 2 - 24) * 0.25}`}
                  strokeLinecap="round"
                  rotation={-135}
                  origin={`${reticleSize / 2}, ${reticleSize / 2}`}
                />
              </Svg>

              <View style={styles.progressIconContainer}>
                <View style={styles.progressIconGlow} />
                {selectedGame?.iconUri ? (
                  <Image
                    source={{uri: selectedGame.iconUri}}
                    style={styles.progressIconImage}
                  />
                ) : (
                  <View style={styles.progressIconFallback}>
                    <Text style={styles.progressIconText}>
                      {selectedGame?.name?.substring(0, 2).toUpperCase() ??
                        'BX'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          <Text style={styles.progressTitle}>
            {selectedGame?.name ?? 'Boosting'}
          </Text>
          <Text style={styles.progressSubtitle}>
            {boostProgress < 20
              ? 'Connecting...'
              : boostProgress < 60
              ? 'Optimizing route...'
              : 'Almost ready...'}
          </Text>

          <View style={styles.progressRingContainer}>
            <Svg width={200} height={200}>
              <Defs>
                <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor="#14B8A6" stopOpacity="1" />
                  <Stop offset="100%" stopColor="#22D3EE" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Circle
                cx={100}
                cy={100}
                r={85}
                stroke="rgba(51,65,85,0.3)"
                strokeWidth={6}
                fill="none"
              />
              <Circle
                cx={100}
                cy={100}
                r={85}
                stroke="url(#ringGrad)"
                strokeWidth={6}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 85} ${2 * Math.PI * 85}`}
                strokeDashoffset={2 * Math.PI * 85 * (1 - boostProgress / 100)}
                rotation={-90}
                origin="100, 100"
              />
            </Svg>
            <View style={styles.progressRingCenter}>
              <Text style={styles.progressPercent}>{boostProgress}</Text>
              <Text style={styles.progressPercentLabel}>%</Text>
            </View>
          </View>

          <View style={styles.progressIndicators}>
            <View style={[styles.indicatorDot, styles.indicatorActive]} />
            <View style={styles.indicatorLine} />
            <View
              style={[
                styles.indicatorDot,
                boostProgress > 33
                  ? styles.indicatorActive
                  : styles.indicatorInactive,
              ]}
            />
            <View style={styles.indicatorLine} />
            <View
              style={[
                styles.indicatorDot,
                boostProgress > 66
                  ? styles.indicatorActive
                  : styles.indicatorInactive,
              ]}
            />
          </View>

          <Pressable onPress={onStop} style={styles.progressCancelBtn}>
            <Text style={styles.progressCancelText}>CANCEL</Text>
          </Pressable>
        </View>
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

  const beforePing = optimizationProfile?.expectedBeforeMs ?? null;
  const afterPing = optimizationProfile?.expectedAfterMs ?? null;
  const improvePct =
    beforePing && afterPing && beforePing > 0
      ? Math.round(((beforePing - afterPing) / beforePing) * 100)
      : null;

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

      <View style={styles.heroCard}>
        <View style={styles.heroLeft}>
          <Text style={styles.pingValue}>{currentPingMs || '—'}</Text>
          <Text style={styles.pingUnit}>ms</Text>
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

      {isBoosting && optimizationProfile && (
        <View style={styles.advancedCard}>
          <View style={styles.advancedHeader}>
            <Text style={styles.advancedTitle}>Advanced Optimization</Text>
            <View style={[
              styles.modeBadge,
              {
                backgroundColor:
                  optimizationProfile.aggressiveness === 'turbo'
                    ? 'rgba(34,211,238,0.2)'
                    : optimizationProfile.aggressiveness === 'fast'
                    ? 'rgba(20,184,166,0.2)'
                    : optimizationProfile.aggressiveness === 'balanced'
                    ? 'rgba(99,102,241,0.2)'
                    : 'rgba(255,170,0,0.2)',
              },
            ]}>
              <Text style={[
                styles.modeBadgeText,
                {
                  color:
                    optimizationProfile.aggressiveness === 'turbo'
                      ? '#22D3EE'
                      : optimizationProfile.aggressiveness === 'fast'
                      ? '#14B8A6'
                      : optimizationProfile.aggressiveness === 'balanced'
                      ? '#6366F1'
                      : '#FFAA00',
                },
              ]}>
                {optimizationProfile.aggressiveness.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={styles.featureGrid}>
            {optimizationProfile.jitterBufferSize && (
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>{optimizationProfile.jitterBufferSize}ms</Text>
                <Text style={styles.featureLabel}>Jitter Buffer</Text>
              </View>
            )}
            {typeof optimizationProfile.fecStrength === 'number' && optimizationProfile.fecStrength > 0 && (
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>{(optimizationProfile.fecStrength * 100).toFixed(0)}%</Text>
                <Text style={styles.featureLabel}>FEC Recovery</Text>
              </View>
            )}
            {optimizationProfile.retransmissionMode && (
              <View style={styles.featureItem}>
                <Text style={[styles.featureValue, {color: '#14B8A6'}]}>ON</Text>
                <Text style={styles.featureLabel}>Predictive Retransmit</Text>
              </View>
            )}
            {optimizationProfile.multiPathEnabled && (
              <View style={styles.featureItem}>
                <Text style={[styles.featureValue, {color: '#22D3EE'}]}>ON</Text>
                <Text style={styles.featureLabel}>Multi-Path Bonding</Text>
              </View>
            )}
            {optimizationProfile.packetPrioritization && (
              <View style={styles.featureItem}>
                <Text style={[styles.featureValue, {color: '#14B8A6'}]}>ON</Text>
                <Text style={styles.featureLabel}>Packet Priority</Text>
              </View>
            )}
            {optimizationProfile.congestionControl && (
              <View style={styles.featureItem}>
                <Text style={styles.featureValue}>{optimizationProfile.congestionControl}</Text>
                <Text style={styles.featureLabel}>Congestion Ctrl</Text>
              </View>
            )}
          </View>

          {optimizationProfile.notes.length > 0 && (
            <View style={styles.notesContainer}>
              {optimizationProfile.notes.map((note, i) => (
                <Text key={i} style={styles.noteText}>• {note}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={styles.chartCard}>
        <View style={styles.chartHeaderRow}>
          <Text style={styles.chartTitle}>Latency Curve</Text>
          <View style={styles.chartBadgeContainer}>
            {isBoosting ? (
              <View style={styles.boostedBadge}>
                <Text style={styles.boostedBadgeText}>BOOSTED</Text>
              </View>
            ) : (
              <Text style={styles.chartTag}>
                {optimizationProfile?.aggressiveness ??
                  (hasPing ? pingQualityLabel(currentPingMs) : 'Idle')}
              </Text>
            )}
          </View>
        </View>

        {displayHistory.length >= 2 ? (
          <>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop
                    offset="0%"
                    stopColor={isBoosting ? '#22D3EE' : '#6366F1'}
                    stopOpacity="0.4"
                  />
                  <Stop
                    offset="100%"
                    stopColor={isBoosting ? '#22D3EE' : '#6366F1'}
                    stopOpacity="0"
                  />
                </LinearGradient>
                <LinearGradient id="lineFill" x1="0" y1="0" x2="1" y2="0">
                  <Stop
                    offset="0%"
                    stopColor={isBoosting ? '#14B8A6' : '#6366F1'}
                    stopOpacity="1"
                  />
                  <Stop
                    offset="100%"
                    stopColor={isBoosting ? '#22D3EE' : '#8B5CF6'}
                    stopOpacity="1"
                  />
                </LinearGradient>
              </Defs>
              <Line
                x1={0}
                y1={CHART_HEIGHT * 0.25}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * 0.25}
                stroke="rgba(255,255,255,0.03)"
                strokeWidth={1}
              />
              <Line
                x1={0}
                y1={CHART_HEIGHT * 0.5}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * 0.5}
                stroke="rgba(255,255,255,0.03)"
                strokeWidth={1}
              />
              <Line
                x1={0}
                y1={CHART_HEIGHT * 0.75}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * 0.75}
                stroke="rgba(239,68,68,0.2)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
              <Path
                d={linePath || ''}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke="url(#lineFill)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {points.length > 0 && (
                <>
                  <Circle
                    cx={points[points.length - 1].x}
                    cy={points[points.length - 1].y}
                    r={10}
                    fill={isBoosting ? '#22D3EE' : '#6366F1'}
                    opacity={0.3}
                  />
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
                    fill={isBoosting ? '#22D3EE' : '#6366F1'}
                  />
                </>
              )}
            </Svg>
            <View style={styles.chartAxisRow}>
              <Text style={styles.axisLabel}>Now</Text>
              <Text style={styles.axisLabel}>
                {Math.round(latestTime / 1000 / 4)}s
              </Text>
              <Text style={styles.axisLabel}>
                {Math.round(latestTime / 1000 / 2)}s
              </Text>
              <Text style={styles.axisLabel}>
                {Math.round((latestTime / 1000) * 0.75)}s
              </Text>
              <Text style={styles.axisLabel}>
                {Math.round(latestTime / 1000)}s
              </Text>
            </View>
          </>
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
            {improvePct !== null && (
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
                  {improvePct > 0 ? `↓ ${improvePct}%` : `↑ ${-improvePct}%`}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.pingCompareItem}>
            <Text style={styles.pingCompareLabel}>After</Text>
            <Text
              style={[
                styles.pingCompareValue,
                {
                  color:
                    improvePct !== null && improvePct > 0
                      ? '#00D68F'
                      : theme.colors.text,
                },
              ]}>
              {afterPing !== null ? `${afterPing} ms` : '—'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onOpenGame} style={styles.actionButton}>
          <Text style={styles.actionButtonText}>Open Game</Text>
        </Pressable>
        {isBoosting ? (
          <Pressable onPress={onStop} style={styles.stopButton}>
            <Text style={styles.stopButtonText}>Stop Boost</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onShareLogs}
            style={[styles.actionButton, styles.actionButtonSecondary]}>
            <Text style={styles.actionButtonTextSecondary}>Share Logs</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {padding: 16, paddingBottom: 100},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {fontSize: 24, fontWeight: '800', color: theme.colors.text},
  headerGame: {fontSize: 13, color: theme.colors.textMuted, marginTop: 2},
  settingsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  settingsText: {fontSize: 12, color: theme.colors.textMuted},
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  heroLeft: {flexDirection: 'row', alignItems: 'baseline'},
  pingValue: {fontSize: 56, fontWeight: '700', color: theme.colors.text},
  pingUnit: {fontSize: 18, color: theme.colors.textMuted, marginLeft: 4},
  pingHeroRight: {marginLeft: 'auto', alignItems: 'flex-end'},
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  statusDot: {width: 6, height: 6, borderRadius: 3, marginRight: 6},
  statusChipText: {fontSize: 11, fontWeight: '700'},
  serverName: {fontSize: 12, color: theme.colors.text, fontWeight: '600'},
  regionTag: {fontSize: 10, color: theme.colors.textMuted, marginTop: 2},
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statItem: {flex: 1, alignItems: 'center'},
  statDivider: {width: 1, height: 30, backgroundColor: theme.colors.border},
  statVal: {fontSize: 16, fontWeight: '700', color: theme.colors.text},
  statLbl: {fontSize: 10, color: theme.colors.textMuted, marginTop: 2},
  chartCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chartTitle: {fontSize: 14, fontWeight: '700', color: theme.colors.text},
  chartBadgeContainer: {flexDirection: 'row', alignItems: 'center'},
  chartTag: {fontSize: 11, fontWeight: '600', color: '#6366F1'},
  boostedBadge: {
    backgroundColor: '#14B8A6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  boostedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  chartEmpty: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartEmptyText: {fontSize: 12, color: theme.colors.textMuted},
  chartAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  axisLabel: {fontSize: 10, color: theme.colors.textMuted},
  pingCompare: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pingCompareItem: {flex: 1, alignItems: 'center'},
  pingCompareArrow: {width: 80, alignItems: 'center'},
  pingCompareLabel: {fontSize: 10, color: theme.colors.textMuted},
  pingCompareValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 2,
  },
  improvePill: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10},
  improveText: {fontSize: 12, fontWeight: '700'},
  actionsRow: {flexDirection: 'row', gap: 12},
  actionButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonText: {fontSize: 14, fontWeight: '700', color: '#07121B'},
  actionButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  stopButton: {
    flex: 1,
    backgroundColor: '#FF4D6D',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  stopButtonText: {fontSize: 14, fontWeight: '700', color: '#FFFFFF'},
  advancedCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  advancedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  advancedTitle: {fontSize: 14, fontWeight: '700', color: theme.colors.text},
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  modeBadgeText: {fontSize: 10, fontWeight: '800', letterSpacing: 1},
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  featureItem: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  featureValue: {fontSize: 16, fontWeight: '700', color: theme.colors.text},
  featureLabel: {fontSize: 9, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center'},
  notesContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  noteText: {fontSize: 11, color: theme.colors.textMuted, marginBottom: 6, lineHeight: 16},
  progressContainer: {flex: 1, backgroundColor: '#030712'},
  progressBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030712',
  },
  progressGlowBg: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    right: '10%',
    bottom: '40%',
    borderRadius: 100,
    backgroundColor: 'rgba(20,184,166,0.08)',
  },
  progressContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  progressReticleWrap: {marginBottom: 32},
  progressReticleOuter: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressIconContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressIconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(20,184,166,0.3)',
  },
  progressIconImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#22D3EE',
  },
  progressIconFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(20,184,166,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#22D3EE',
  },
  progressIconText: {fontSize: 32, fontWeight: '800', color: '#22D3EE'},
  progressTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#E2E8F0',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
    textAlign: 'center',
  },
  progressRingContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  progressRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  progressPercent: {fontSize: 48, fontWeight: '800', color: '#14B8A6'},
  progressPercentLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#14B8A6',
    marginTop: 8,
  },
  progressIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  indicatorDot: {width: 12, height: 12, borderRadius: 6},
  indicatorActive: {backgroundColor: '#14B8A6'},
  indicatorInactive: {backgroundColor: '#334155'},
  indicatorLine: {
    width: 40,
    height: 2,
    backgroundColor: '#334155',
    marginHorizontal: 4,
  },
  progressCancelBtn: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
  },
  progressCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 2,
  },
});
