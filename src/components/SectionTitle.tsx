import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {theme} from '../theme';

type Props = {
  title: string;
  subtitle?: string;
};

export const SectionTitle = ({title, subtitle}: Props) => (
  <View style={styles.wrap}>
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.textMuted,
    marginTop: 4,
    fontSize: 12,
  },
});
