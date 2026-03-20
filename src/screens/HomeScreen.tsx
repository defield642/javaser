import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { theme } from "../theme";
import type { Game } from "../data/games";
import type { Server } from "../data/servers";

type Props = {
  selectedGame: Game | null;
  selectedServer: Server | null;
  isBoosting: boolean;
  onGoGames: () => void;
  onGoBoost: () => void;
};

export const HomeScreen = ({
  selectedGame,
  selectedServer,
  isBoosting,
  onGoGames,
  onGoBoost
}: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>GeXuP</Text>
        <Text style={styles.tagline}>Game Network Optimizer</Text>
        <Text style={styles.heroText}>
          Focus one game at a time. Lock the best route, cut jitter, and
          stabilize sessions.
        </Text>
        <Pressable style={styles.cta} onPress={onGoGames}>
          <Text style={styles.ctaText}>Select Game</Text>
        </Pressable>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.cardTitle}>Current Session</Text>
        <Text style={styles.cardRow}>
          Game: {selectedGame ? selectedGame.name : "None"}
        </Text>
        <Text style={styles.cardRow}>
          Server: {selectedServer ? selectedServer.name : "Not selected"}
        </Text>
        <Text style={[styles.cardRow, isBoosting ? styles.good : styles.muted]}>
          Status: {isBoosting ? "Boosting" : "Idle"}
        </Text>
        <Pressable
          style={[styles.secondary, isBoosting && styles.secondaryActive]}
          onPress={onGoBoost}
        >
          <Text style={styles.secondaryText}>Open Boost Status</Text>
        </Pressable>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Focus Mode</Text>
          <Text style={styles.tileValue}>1 Game</Text>
          <Text style={styles.tileHint}>Optimized routing per session</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Coverage</Text>
          <Text style={styles.tileValue}>20 Regions</Text>
          <Text style={styles.tileHint}>Worldwide server list</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  hero: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  brand: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1
  },
  tagline: {
    color: theme.colors.accent,
    marginTop: 6,
    fontWeight: "700"
  },
  heroText: {
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    lineHeight: 20
  },
  cta: {
    backgroundColor: theme.colors.accent,
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    alignItems: "center"
  },
  ctaText: {
    color: "#041008",
    fontWeight: "800"
  },
  statusCard: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.panelAlt,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    marginBottom: theme.spacing.sm
  },
  cardRow: {
    color: theme.colors.textMuted,
    marginBottom: 6
  },
  good: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  muted: {
    color: theme.colors.textMuted
  },
  secondary: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    alignItems: "center"
  },
  secondaryActive: {
    borderColor: theme.colors.accent
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 12
  },
  tiles: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg
  },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  tileLabel: {
    color: theme.colors.textMuted,
    fontSize: 12
  },
  tileValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginVertical: 8
  },
  tileHint: {
    color: theme.colors.textMuted,
    fontSize: 11
  }
});
