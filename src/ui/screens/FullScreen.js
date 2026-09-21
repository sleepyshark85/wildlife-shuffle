// The shell S8 (Records) and S9 (Collection) share: a title, a Back control,
// and a scrolling body.
//
// It scrolls, and its text does not pin its size. ui.md §10 splits Dynamic Type
// by surface: the board never scales because it is spatial, the HUD trades its
// labels for its values inside a fixed height, and reading surfaces scale
// freely and scroll. These two screens are reading surfaces — they are nothing
// but text — so there is no reason to exempt them and a hygiene test asserts
// they do not (AC-910c).

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RADIUS, SPACE, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';
import { Button } from '../components/Controls.js';

export function FullScreen({ title, subtitle, onBack, children, testID }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const insets = useSafeAreaInsets();
  return (
    <View testID={testID} style={[styles.screen, { paddingTop: insets.top + SPACE.lg }]}>
      <View style={styles.header}>
        <Text style={theme.type.title}>{title}</Text>
        {subtitle ? <Text style={theme.type.body}>{subtitle}</Text> : null}
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: SPACE.xl }]}
      >
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACE.lg }]}>
        <Button label="Back" testID="back" tone="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

/** A titled panel. Everything on both screens sits in one of these. */
export function Card({ title, children }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  return (
    <View style={styles.card}>
      {title ? <Text style={theme.type.label}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** One `caption ......... value` line. Tabular figures so columns line up. */
export function Line({ caption, value, muted }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  return (
    <View style={styles.line}>
      <Text style={[theme.type.body, muted && styles.mutedInk]} numberOfLines={2}>{caption}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.colors.bg, paddingHorizontal: SPACE.xl },
  header: { gap: SPACE.xs, paddingBottom: SPACE.md },
  body: { flex: 1 },
  bodyContent: { gap: SPACE.md },
  footer: { paddingTop: SPACE.md },
  card: {
    gap: SPACE.sm,
    padding: SPACE.lg,
    backgroundColor: T.colors.panel,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: T.colors.hairline,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACE.md,
  },
  lineValue: {
    ...T.type.button,
    color: T.colors.ink,
    fontVariant: ['tabular-nums'],
  },
  mutedInk: { color: T.colors.inkDim },
}));
