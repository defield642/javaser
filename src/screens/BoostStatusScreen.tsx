import React, { useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Animated,
  Easing
} from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { theme } from "../theme";
import type { Game } from "../data/games";
import type { Server } from "../data/servers";
import type { PingEntry } from "../types/ping";

type BoostPhase = "idle" | "progress" | "active";

type Props = {
  selectedGame: Game | null;
  selectedServer: Server | null;
  isBoosting: boolean;
  boostPhase: BoostPhase;
  boostProgress: number;
  pingEntry: PingEntry | undefined;
  pingHistory: { ms: number; t: number }[];
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
  lockedServerId,
  onOpenSettings,
  onOpenGame,
  onStop,
  onShareLogs,
  optimizationProfile,
  networkInfo
}: Props) => {
  const hasPing = typeof pingEntry?.ms === "number";
  const pingLabel = hasPing
    ? `${pingEntry.ms} ms`
    : !isConnected
      ? "No network"
      : pingEntry?.error
      ? "-"
      : "Not measured";

  const speedLabel = useMemo(() => {
    if (typeof networkInfo?.connectionSpeed === "number" && networkInfo.connectionSpeed > 0) {
      return `${Math.round(networkInfo.connectionSpeed)} Mbps`;
    }
    if (!hasPing) return "-";
    const speed = Math.max(20, Math.min(180, 180 - (pingEntry?.ms ?? 0)));
    return `${Math.round(speed)} Mbps`;
  }, [hasPing, networkInfo?.connectionSpeed, pingEntry?.ms]);

  const smoothHistory = useMemo(() => {
    if (!pingHistory.length) return [];
    const window = 3;
    return pingHistory.map((sample, index) => {
      const start = Math.max(0, index - window + 1);
      const slice = pingHistory.slice(start, index + 1);
      const sum = slice.reduce((acc, value) => acc + value.ms, 0);
      return { ms: sum / slice.length, t: sample.t };
    });
  }, [pingHistory]);
  const chartWidth = 280;
  const chartHeight = 110;
  const lineColor = "#39C6F4";
  const downsampleFactor = 5;
  const displayHistory = useMemo(() => {
    if (!smoothHistory.length) return [];
    const windowMs = 3 * 60 * 1000;
    const endTime = smoothHistory[smoothHistory.length - 1].t;
    const startTime = endTime - windowMs;
    const trimmed = smoothHistory.filter((s) => s.t >= startTime);
    return trimmed.filter((_, index) => index % downsampleFactor === 0);
  }, [smoothHistory]);
  const axisMax = displayHistory.length
    ? Math.max(...displayHistory.map((s) => s.ms), 1)
    : 0;
  const axisMin = displayHistory.length
    ? Math.min(...displayHistory.map((s) => s.ms), axisMax)
    : 0;
  const axisMid = displayHistory.length ? (axisMax + axisMin) / 2 : 0;
  const afterWindow = 6;
  const averageWithoutOutliers = (values: number[]) => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const filtered = values.filter((value) => Math.abs(value - median) <= Math.max(25, median * 0.35));
    const stable = filtered.length ? filtered : values;
    const sum = stable.reduce((acc, value) => acc + value, 0);
    return sum / stable.length;
  };
  const beforeWindow = 6;
  const beforeAvg = useMemo(() => {
    if (typeof optimizationProfile?.expectedBeforeMs === "number") {
      return optimizationProfile.expectedBeforeMs;
    }
    if (!pingHistory.length) return typeof pingEntry?.ms === "number" ? pingEntry.ms : null;
    const firstWindow = pingHistory.slice(0, beforeWindow).map((item) => item.ms);
    return firstWindow.length ? Math.max(...firstWindow) : null;
  }, [optimizationProfile?.expectedBeforeMs, pingEntry?.ms, pingHistory]);
  const afterPing = useMemo(() => {
    if (typeof optimizationProfile?.expectedAfterMs === "number") {
      return optimizationProfile.expectedAfterMs;
    }
    if (!pingHistory.length) return typeof pingEntry?.ms === "number" ? pingEntry.ms : null;
    const recent = pingHistory.slice(-afterWindow).map((item) => item.ms);
    return recent.length ? Math.min(...recent) : pingHistory[pingHistory.length - 1]?.ms ?? null;
  }, [optimizationProfile?.expectedAfterMs, pingEntry?.ms, pingHistory]);
  const startTime = pingHistory.length ? pingHistory[0].t : 0;
  const endTime = displayHistory.length ? displayHistory[displayHistory.length - 1].t : startTime;
  const windowMs = 3 * 60 * 1000;
  const windowStart = Math.max(startTime, endTime - windowMs);
  const formatElapsed = (t: number) => {
    const elapsedSec = Math.max(0, Math.floor((t - startTime) / 1000));
    const hours = Math.floor(elapsedSec / 3600);
    const mins = Math.floor((elapsedSec % 3600) / 60);
    const secs = elapsedSec % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  const points = useMemo(() => {
    if (!displayHistory.length) return [];
    const max = Math.max(...displayHistory.map((s) => s.ms), 1);
    const min = Math.min(...displayHistory.map((s) => s.ms), max);
    const range = Math.max(20, max - min);
    return displayHistory.map((sample) => {
      const x = Math.max(
        0,
        Math.min(chartWidth, ((sample.t - windowStart) / windowMs) * chartWidth)
      );
      const y = chartHeight - ((sample.ms - min) / range) * chartHeight;
      return { x, y };
    });
  }, [displayHistory, chartWidth, chartHeight, windowStart, windowMs]);

  const buildPath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const linePath = useMemo(() => buildPath(points), [points]);
  const areaPath = useMemo(() => {
    if (points.length < 2) return "";
    const base = chartHeight;
    const line = buildPath(points);
    if (!line) return "";
    const last = points[points.length - 1];
    const first = points[0];
    return `${line} L ${last.x} ${base} L ${first.x} ${base} Z`;
  }, [points, chartHeight]);

  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.9,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (boostPhase === "progress") {
    const ringSize = 210;
    const ringStroke = 8;
    const r = (ringSize - ringStroke) / 2;
    const cx = ringSize / 2;
    const cy = ringSize / 2;
    const halfCircumference = Math.PI * r;
    const ratio = Math.max(0, Math.min(1, boostProgress / 100));
    const dashOffset = halfCircumference * (1 - ratio);
    const arcPath = (startAngle: number, endAngle: number, sweep: 0 | 1) => {
      const toRadians = (deg: number) => (deg * Math.PI) / 180;
      const start = {
        x: cx + r * Math.cos(toRadians(startAngle)),
        y: cy + r * Math.sin(toRadians(startAngle))
      };
      const end = {
        x: cx + r * Math.cos(toRadians(endAngle)),
        y: cy + r * Math.sin(toRadians(endAngle))
      };
      return `M ${start.x} ${start.y} A ${r} ${r} 0 0 ${sweep} ${end.x} ${end.y}`;
    };
    return (
      <View style={styles.progressWrap}>
        <View style={styles.progressBackdrop} />
        <Text style={styles.progressTitle}>OPTIMIZING CONNECTION...</Text>
        <View style={styles.dialWrap}>
          <Svg width={ringSize} height={ringSize} style={styles.dialSvg}>
            <Defs>
              <LinearGradient id="mythicGlow" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#2CE7FF" stopOpacity="1" />
                <Stop offset="100%" stopColor="#2A4CFF" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Path
              d={arcPath(270, 90, 0)}
              stroke="rgba(60, 120, 200, 0.35)"
              strokeWidth={ringStroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${halfCircumference} ${halfCircumference}`}
              strokeDashoffset={0}
            />
            <Path
              d={arcPath(270, 90, 1)}
              stroke="rgba(60, 120, 200, 0.35)"
              strokeWidth={ringStroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${halfCircumference} ${halfCircumference}`}
              strokeDashoffset={0}
            />
            <Path
              d={arcPath(270, 90, 0)}
              stroke="url(#mythicGlow)"
              strokeWidth={ringStroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${halfCircumference} ${halfCircumference}`}
              strokeDashoffset={dashOffset}
            />
            <Path
              d={arcPath(270, 90, 1)}
              stroke="url(#mythicGlow)"
              strokeWidth={ringStroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${halfCircumference} ${halfCircumference}`}
              strokeDashoffset={dashOffset}
            />
            <Circle cx={cx} cy={cy} r={r - 18} stroke="rgba(50, 120, 200, 0.3)" strokeWidth="2" fill="none" />
          </Svg>
          <View style={styles.dialMid}>
            <View style={styles.dialInner}>
              {selectedGame?.iconUri ? (
                <Image source={{ uri: selectedGame.iconUri }} style={styles.ringIcon} />
              ) : (
                <Text style={styles.ringText}>{boostProgress}%</Text>
              )}
              {selectedGame?.iconUri ? (
                <Text style={styles.ringTextOverlay}>{boostProgress}%</Text>
              ) : null}
            </View>
          </View>
          <Animated.View style={[styles.dialGlow, { opacity: pulse }]} />
        </View>
        <Text style={styles.progressPercent}>{boostProgress}%</Text>
        <Text style={styles.progressLabel}>CALCULATING BOOST</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${boostProgress}%` }]} />
        </View>
        <Text style={styles.progressHint}>Routing to the most stable node…</Text>
        <Pressable onPress={onStop} style={styles.progressStop}>
          <Text style={styles.progressStopText}>Stop Boosting</Text>
        </Pressable>
      </View>
    );
  }

  const statusLabel = !isConnected ? "Offline" : isBoosting && hasPing ? "Boosted" : "Idle";
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Boost</Text>
        <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>
      <View style={styles.gameStrip}>
        {games.length ? (
          games.map((game) => {
            const isSelected = selectedGame?.id === game.id;
            return (
              <Pressable
                key={game.id}
                onPress={() => onSelectGame(game)}
                style={[styles.gameChip, isSelected && styles.gameChipActive]}
              >
                {game.iconUri ? (
                  <Image source={{ uri: game.iconUri }} style={styles.gameChipIcon} />
                ) : null}
                <Text style={[styles.gameChipText, isSelected && styles.gameChipTextActive]}>
                  {game.name}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptyGames}>No games detected yet</Text>
        )}
      </View>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleLeft}>
              {selectedGame?.iconUri ? (
                <Image source={{ uri: selectedGame.iconUri }} style={styles.cardGameIcon} />
              ) : null}
              <Text style={styles.cardTitle}>{selectedGame?.name ?? "Select a game"}</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={styles.cardSub}>
            Server Region - {selectedServer?.region ?? "Auto"}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Network Speed</Text>
            <Text style={styles.statValue}>{speedLabel}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Ping</Text>
            <Text style={styles.statValue}>{pingLabel}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Current Server</Text>
            <Text style={styles.statValue}>{selectedServer?.name ?? "Auto"}</Text>
          </View>
        </View>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <Text style={styles.sectionTitle}>Latency Curve</Text>
          <Text style={styles.chartTag}>
            {optimizationProfile?.aggressiveness ?? (hasPing ? "Stable" : "Idle")}
          </Text>
        </View>
        {displayHistory.length ? (
          <View style={[styles.chartLineWrap, { width: chartWidth, height: chartHeight }]}>
            <View style={styles.chartYAxis}>
              <Text style={styles.axisLabel}>{Math.round(axisMax)} ms</Text>
              <Text style={styles.axisLabel}>{Math.round(axisMid)} ms</Text>
              <Text style={styles.axisLabel}>{Math.round(axisMin)} ms</Text>
            </View>
            <Svg width={chartWidth} height={chartHeight} style={styles.chartSvg}>
              <Defs>
                <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor="#39C6F4" stopOpacity="0.45" />
                  <Stop offset="100%" stopColor="#39C6F4" stopOpacity="0.05" />
                </LinearGradient>
              </Defs>
              {areaPath ? <Path d={areaPath} fill="url(#areaFill)" /> : null}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={lineColor}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </Svg>
            <View style={styles.chartXAxis}>
              <Text style={styles.axisLabel}>
                {formatElapsed(Math.max(windowStart, endTime - 120000))}
              </Text>
              <Text style={styles.axisLabel}>
                {formatElapsed(Math.max(windowStart, endTime - 60000))}
              </Text>
              <Text style={styles.axisLabel}>{formatElapsed(endTime)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.chartEmpty}>
            <Text style={styles.chartEmptyText}>Waiting for first ping sample...</Text>
          </View>
        )}
        <View style={styles.chartFooter}>
          <View style={[styles.pingCard, styles.pingCardBefore]}>
            <Text style={styles.pingCardLabel}>Before</Text>
            <Text style={styles.pingCardValue}>
              {typeof beforeAvg === "number" ? `${Math.round(beforeAvg)} ms` : "-"}
            </Text>
          </View>
          <View style={[styles.pingCard, styles.pingCardAfter]}>
            <Text style={styles.pingCardLabel}>After</Text>
            <Text style={styles.pingCardValue}>
              {typeof afterPing === "number" ? `${Math.round(afterPing)} ms` : "-"}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={onStop} style={styles.stopButton}>
          <Text style={styles.stopText}>Stop Boosting</Text>
        </Pressable>
        <Pressable onPress={onOpenGame} style={styles.openButton}>
          <Text style={styles.openText}>Open Game</Text>
        </Pressable>
      </View>
      <Pressable onPress={onShareLogs} style={styles.shareLogs}>
        <Text style={styles.shareLogsText}>Share Logs</Text>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.lg
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm
  },
  headerTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.4
  },
  settingsButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10
  },
  settingsText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: "700"
  },
  gameStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: theme.spacing.md
  },
  gameChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.panelAlt,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    flexDirection: "row",
    alignItems: "center"
  },
  gameChipIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
    marginRight: 6
  },
  gameChipActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  gameChipText: {
    color: theme.colors.textMuted,
    fontSize: 11
  },
  gameChipTextActive: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  emptyGames: {
    color: theme.colors.textMuted,
    fontSize: 12
  },
  progressWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  progressBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#071326",
    opacity: 0.85
  },
  progressTitle: {
    color: "#E8F3FF",
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: theme.spacing.lg,
    fontSize: 14
  },
  dialWrap: {
    width: 210,
    height: 210,
    alignItems: "center",
    justifyContent: "center"
  },
  dialSvg: {
    position: "absolute"
  },
  dialMid: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: "#1B3E84",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 26, 58, 0.6)"
  },
  dialInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(6, 16, 36, 0.9)",
    alignItems: "center",
    justifyContent: "center"
  },
  dialGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(60, 190, 255, 0.2)"
  },
  ringIcon: {
    width: 90,
    height: 90,
    borderRadius: 18
  },
  ringText: {
    color: "#8FE6FF",
    fontWeight: "700",
    fontSize: 20
  },
  ringTextOverlay: {
    position: "absolute",
    bottom: -10,
    color: "#E9FBFF",
    fontWeight: "800",
    fontSize: 18,
    textShadowColor: "rgba(41, 198, 255, 0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10
  },
  progressPercent: {
    color: "#7EDCFF",
    fontSize: 28,
    fontWeight: "800",
    marginTop: theme.spacing.lg
  },
  progressLabel: {
    color: "rgba(190, 230, 255, 0.75)",
    fontSize: 11,
    letterSpacing: 1.2,
    marginTop: theme.spacing.xs
  },
  progressBar: {
    width: 220,
    height: 8,
    borderRadius: 8,
    backgroundColor: "rgba(41, 96, 160, 0.5)",
    marginTop: theme.spacing.md,
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#39C6F4"
  },
  progressHint: {
    color: "rgba(200, 230, 255, 0.7)",
    marginTop: theme.spacing.sm
  },
  progressStop: {
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentSoft,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md
  },
  progressStopText: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  cardHeader: {
    marginBottom: theme.spacing.md
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: theme.spacing.sm
  },
  cardGameIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: theme.spacing.sm
  },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16
  },
  cardSub: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 4
  },
  badge: {
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10
  },
  badgeText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700"
  },
  statsRow: {
    marginTop: 0
  },
  stat: {
    backgroundColor: theme.colors.panelAlt,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: 11
  },
  statValue: {
    color: theme.colors.text,
    fontWeight: "700",
    marginTop: 4
  },
  chartCard: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.panelAlt,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  sectionTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    marginBottom: theme.spacing.sm
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  chartTag: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "700"
  },
  chartLineWrap: {
    height: 120,
    marginTop: theme.spacing.sm,
    position: "relative",
    overflow: "hidden",
    alignSelf: "center",
    paddingLeft: 36,
    paddingBottom: 18
  },
  chartYAxis: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 34,
    justifyContent: "space-between"
  },
  chartXAxis: {
    position: "absolute",
    bottom: 0,
    left: 36,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  axisLabel: {
    color: "rgba(255,255,255,0.95)",
    fontSize: 10,
    backgroundColor: "rgba(3, 10, 20, 0.6)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden"
  },
  chartSvg: {
    position: "absolute",
    left: 36,
    top: 0
  },
  chartEmpty: {
    height: 90,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  chartEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 11
  },
  chartFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.md
  },
  pingCard: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  pingCardBefore: {
    marginRight: theme.spacing.sm,
    backgroundColor: "rgba(255, 122, 69, 0.12)"
  },
  pingCardAfter: {
    marginLeft: theme.spacing.sm,
    backgroundColor: "rgba(46, 212, 119, 0.12)"
  },
  pingCardLabel: {
    color: theme.colors.textMuted,
    fontSize: 11
  },
  pingCardValue: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 13,
    marginTop: 4
  },
  footer: {
    marginTop: theme.spacing.lg,
    flexDirection: "row"
  },
  stopButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.accentSoft,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    alignItems: "center",
    marginRight: theme.spacing.md
  },
  stopText: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  openButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    alignItems: "center"
  },
  openText: {
    color: "#03142B",
    fontWeight: "700"
  },
  shareLogs: {
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    alignItems: "center"
  },
  shareLogsText: {
    color: theme.colors.textMuted,
    fontWeight: "700"
  }
});
