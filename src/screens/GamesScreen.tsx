import React from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Image } from "react-native";
import { theme } from "../theme";
import type { Game } from "../data/games";
import type { Server } from "../data/servers";

type Props = {
  games: Game[];
  selectedGame: Game | null;
  selectedServer: Server | null;
  isBoosting: boolean;
  lockedServerId: string | null;
  onBoost: (game: Game) => void;
  onOpenBoost: () => void;
  onOpenSettings: () => void;
  networkInfo?: {
    type?: string;
    ssid?: string | null;
    carrier?: string | null;
    ipAddress?: string | null;
    isConnected?: boolean;
    connectionSpeed?: number | null;
  } | null;
};

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "");
  return letters.join("") || "G";
};

export const GamesScreen = ({
  games,
  selectedGame,
  selectedServer,
  isBoosting,
  lockedServerId,
  onBoost,
  onOpenBoost,
  onOpenSettings,
  networkInfo
}: Props) => {
  const isLocked = lockedServerId && selectedServer?.id === lockedServerId;
  const networkLabel = !networkInfo?.isConnected
    ? "Offline"
    : networkInfo?.type === "wifi"
    ? networkInfo?.ssid || "Wi-Fi"
    : networkInfo?.type === "cellular"
    ? networkInfo?.carrier || "Mobile data"
    : "Connected";
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Boost</Text>
        <Pressable onPress={onOpenSettings} style={styles.settingsButton}>
          <Text style={styles.settingsText}>Settings</Text>
        </Pressable>
      </View>

      <Pressable style={styles.serverRow} onPress={onOpenBoost}>
        <Text style={styles.serverLabel}>Server Region</Text>
        <Text style={styles.serverValue}>
          {selectedServer?.region ?? "Auto"}{isLocked ? " · Locked" : ""}
        </Text>
      </Pressable>

      <View style={styles.serverRow}>
        <Text style={styles.serverLabel}>Current Network</Text>
        <Text style={styles.serverValue}>{networkLabel}</Text>
      </View>

      {games.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No games detected</Text>
          <Text style={styles.emptyText}>
            This device did not report any installed games. If your games appear
            as apps, Android may not tag them as games.
          </Text>
        </View>
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selectedGame?.id === item.id;
            const disabled = isBoosting && !isSelected;
            const boosting = isBoosting && isSelected;
            return (
              <View style={[styles.card, disabled && styles.cardDisabled]}>
                <View style={styles.cardLeft}>
                  {item.iconUri ? (
                    <Image
                      source={{ uri: item.iconUri }}
                      style={styles.appIcon}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.iconFallback}>
                      <Text style={styles.iconFallbackText}>
                        {item.iconText ?? initialsFor(item.name)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardText}>
                    <Text style={styles.gameName}>{item.name}</Text>
                    <Text style={styles.gameSubtitle}>
                      {item.subtitle ?? "Installed game"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => onBoost(item)}
                  disabled={disabled}
                  style={[
                    styles.boostButton,
                    boosting && styles.boostingButton,
                    disabled && styles.boostDisabled
                  ]}
                >
                  <Text style={[styles.boostText, boosting && styles.boostingText]}>
                    {boosting ? "Boosting" : "Boost"}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.sm
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5
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
  serverRow: {
    backgroundColor: theme.colors.panelAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  serverLabel: {
    color: theme.colors.textMuted,
    fontSize: 12
  },
  serverValue: {
    color: theme.colors.text,
    fontWeight: "600"
  },
  listContent: {
    paddingBottom: theme.spacing.lg
  },
  card: {
    backgroundColor: theme.colors.panelAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm
  },
  cardDisabled: {
    opacity: 0.55
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  cardText: {
    flexShrink: 1
  },
  appIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    marginRight: theme.spacing.sm
  },
  iconFallback: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: theme.colors.chip,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.sm
  },
  iconFallbackText: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 12
  },
  gameName: {
    color: theme.colors.text,
    fontWeight: "700"
  },
  gameSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 3
  },
  boostButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 18
  },
  boostingButton: {
    backgroundColor: theme.colors.accentSoft
  },
  boostDisabled: {
    opacity: 0.6
  },
  emptyState: {
    backgroundColor: theme.colors.panelAlt,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  emptyTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    marginBottom: theme.spacing.sm
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  boostText: {
    color: "#03142B",
    fontWeight: "700",
    fontSize: 12
  },
  boostingText: {
    color: theme.colors.accent
  }
});
