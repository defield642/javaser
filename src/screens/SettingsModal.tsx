import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { theme } from "../theme";

export type SettingsState = {
  autoOpenDelaySec: number;
  voiceVolume: number;
};

type Props = {
  visible: boolean;
  settings: SettingsState;
  onClose: () => void;
  onChange: (next: SettingsState) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const SettingsModal = ({ visible, settings, onClose, onChange }: Props) => {
  if (!visible) return null;

  const update = (patch: Partial<SettingsState>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Auto open game delay</Text>
          <View style={styles.controls}>
            <Pressable
              onPress={() => update({ autoOpenDelaySec: clamp(settings.autoOpenDelaySec - 10, 0, 180) })}
              style={styles.step}
            >
              <Text style={styles.stepText}>-10</Text>
            </Pressable>
            <Text style={styles.value}>{settings.autoOpenDelaySec}s</Text>
            <Pressable
              onPress={() => update({ autoOpenDelaySec: clamp(settings.autoOpenDelaySec + 10, 0, 180) })}
              style={styles.step}
            >
              <Text style={styles.stepText}>+10</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Voice volume</Text>
          <View style={styles.controls}>
            <Pressable
              onPress={() => update({ voiceVolume: clamp(settings.voiceVolume - 0.1, 0.2, 1.0) })}
              style={styles.step}
            >
              <Text style={styles.stepText}>-</Text>
            </Pressable>
            <Text style={styles.value}>{settings.voiceVolume.toFixed(2)}</Text>
            <Pressable
              onPress={() => update({ voiceVolume: clamp(settings.voiceVolume + 0.1, 0.2, 1.0) })}
              style={styles.step}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(4, 8, 16, 0.85)",
    padding: theme.spacing.lg,
    justifyContent: "center"
  },
  card: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md
  },
  title: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: 16
  },
  close: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  row: {
    marginBottom: theme.spacing.md
  },
  label: {
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.xs
  },
  controls: {
    flexDirection: "row",
    alignItems: "center"
  },
  step: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  stepText: {
    color: theme.colors.text,
    fontWeight: "700"
  },
  value: {
    color: theme.colors.text,
    fontWeight: "700",
    marginHorizontal: theme.spacing.md
  },
  toggle: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
    alignItems: "center"
  },
  toggleOn: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: theme.colors.accentSoft
  },
  toggleText: {
    color: theme.colors.textMuted,
    fontWeight: "700"
  },
  toggleTextOn: {
    color: theme.colors.accent
  }
});
