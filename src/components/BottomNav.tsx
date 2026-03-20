import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { theme } from "../theme";

export type TabKey = "games" | "boost";

type Props = {
  active: TabKey;
  onChange: (key: TabKey) => void;
  canOpenBoost?: boolean;
};

export const BottomNav = ({ active, onChange, canOpenBoost = true }: Props) => {
  const items: { key: TabKey; label: string }[] = [
    { key: "games", label: "Games" },
    { key: "boost", label: "Boost" }
  ];

  return (
    <View style={styles.wrap}>
      {items.map((item) => {
        const isActive = active === item.key;
        const isDisabled = item.key === "boost" && !canOpenBoost;
        return (
          <Pressable
            key={item.key}
            onPress={() => {
              if (isDisabled) return;
              onChange(item.key);
            }}
            style={[
              styles.item,
              isActive && styles.itemActive,
              isDisabled && styles.itemDisabled
            ]}
          >
            <Text
              style={[
                styles.text,
                isActive && styles.textActive,
                isDisabled && styles.textDisabled
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: theme.colors.panelAlt,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingVertical: theme.spacing.sm
  },
  item: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.spacing.xs
  },
  itemActive: {
    backgroundColor: theme.colors.accentSoft,
    marginHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md
  },
  itemDisabled: {
    opacity: 0.5
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.4
  },
  textActive: {
    color: theme.colors.accent,
    fontWeight: "700"
  },
  textDisabled: {
    color: theme.colors.textMuted
  }
});
