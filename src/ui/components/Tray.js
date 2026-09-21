// The tray — the preview contract, made visible (ui.md §6).
//
// v1 rendered a row of flat occupancy squares and then re-rolled the positions
// anyway: it did not show WHAT was coming, only where, and the where was a lie.
//
// v2 now renders SILHOUETTES — shadows at the board's cell width, in their
// exact spawn columns, with each animal's own outline preserved, and the
// engine still guarantees the batch arrives verbatim (AC-301).
//
// Why that does not reopen v1's defect: a silhouette is less SPECIFIC, not
// less true. It states the footprint and the columns exactly, and size is the
// only property that changes how a piece behaves, so everything a player can
// plan against survives. v1 misrepresented; this withholds flavour. The two
// are different acts and only the second is honest (ui.md §6.1).
//
// Two things therefore may NOT be dropped, and both are load-bearing:
//
//   - per-animal outlines (AC-315b). A fox at column 3 and two rats at columns
//     3 and 4 must paint as one 2-wide shadow and two 1-wide ones. Merging
//     them would state a footprint the batch does not have, which is back to
//     misrepresenting. theme.silhouette.gap is what keeps them apart.
//   - the buffalo's gold rim (AC-315c). A buffalo refuses to clear, so hiding
//     one withholds a RULE rather than a flavour.
//
// What is genuinely lost is the pleasure of seeing a herd of elephants coming.
// That is a real cost and it was the owner's call, recorded here so it is not
// mistaken for a free change.

import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SPECIES } from '../../engine/constants.js';
import { plural, trayLabel } from '../format.js';
import { traySilhouettes, trayMetrics } from '../layout.js';
import { EASE, delay, timing } from '../motion.js';
import { frozenLabel, trayStripOpacity } from '../abilities.js';
import { COPY, MOTION, RADIUS, themed } from '../theme.js';
import { useTheme } from '../progressStore.js';

/**
 * AC-902 is deliberately NOT narrowed to match the silhouettes: VoiceOver
 * still names each incoming animal. Hiding the species is a visual choice
 * about flavour, and taking it away from the one audience that cannot see the
 * strip at all would be removing information rather than withholding
 * decoration. Recorded because AC-902 and AC-315 now describe different
 * amounts of detail, and that is on purpose. The label itself is built in
 * `src/ui/format.js`, which imports nothing, so what VoiceOver hears is a value
 * `node --test` can read rather than one only a phone can (§6.7).
 *
 * The tray's label row is 14 pt at full chrome and 10 at compact, so its 10 pt
 * labels can grow by about a third before the row cannot hold them (AC-910c).
 * The strip's animals are board, not text, and never scale (AC-910).
 */
const TRAY_FONT_CAP = 1.3;

/** 45 degree accent stripes: "these push up from here" (ui.md §6). */
function HazardRule({ width, height }) {
  const rule = useTheme().colors.hazardRule;
  const bars = [];
  for (let i = 0, x = -height; x < width + height; i += 1, x += 10) {
    bars.push(
      <View
        key={i}
        style={{
          position: 'absolute',
          left: x,
          top: -height,
          width: 3,
          height: height * 3,
          backgroundColor: rule,
          transform: [{ rotate: '45deg' }],
        }}
      />,
    );
  }
  return <View style={{ width, height, overflow: 'hidden' }}>{bars}</View>;
}

function TrayImpl({ queue, cells, cell, boardW, compact, revealAt, reduced, frozen = 0 }) {
  const theme = useTheme();
  const styles = STYLES[theme.name];
  const { labelH, stripH, ruleH, bodyH } = trayMetrics(cell, compact);
  // AC-1410, and it is load-bearing rather than decoration. The tray's whole
  // contract is that it shows what is coming (§6); while Hold the Line is up,
  // nothing is coming, and a strip still showing a batch would be promising an
  // arrival that will not happen — which is v1's defect exactly, in reverse.
  // So the strip greys out and SAYS SO for as long as the freeze lasts.
  const frozenText = frozenLabel(frozen);
  // AC-1410b. MULTIPLIED into the animated opacity rather than layered after
  // it: a static `opacity: 0.45` in the same style array as `revealStyle` is
  // whichever of the two is written last, and it shipped losing — the label
  // said FROZEN and the strip rendered at full opacity.
  const stripAlpha = trayStripOpacity(frozen);

  // The batch on screen while an arrival is in flight is the NEXT one: the
  // engine advanced the queue in the same reducer call that emptied it. So the
  // strip waits for the flight to clear the tray before it shows its new
  // contents, rather than swapping them under the animals that are still
  // leaving. `withDelay`, not a timer — this is presentation, and presentation
  // does not get to own a timer (AC-828).
  const reveal = useSharedValue(1);
  useEffect(() => {
    if (!revealAt) {
      reveal.value = 1;
      return;
    }
    reveal.value = 0;
    reveal.value = delay(revealAt, withTiming(1, timing(MOTION.reduced, EASE.out, reduced)));
  }, [queue, revealAt, reduced, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ opacity: reveal.value * stripAlpha }));

  return (
    <View
      style={{ width: boardW }}
      accessibilityLabel={trayLabel(queue, cells, frozen)}
      accessible
    >
      <View style={[styles.labelRow, { height: labelH }]}>
        <Text maxFontSizeMultiplier={TRAY_FONT_CAP} style={theme.type.label}>{COPY.trayLabel}</Text>
        <Text
          testID="tray-right"
          maxFontSizeMultiplier={TRAY_FONT_CAP}
          style={[theme.type.label, frozenText ? styles.frozenLabel : null]}
        >
          {frozenText || plural(cells, 'CELL', 'CELLS')}
        </Text>
      </View>
      <Animated.View
        style={[styles.strip, { width: boardW, height: stripH }, revealStyle]}
      >
        {(frozenText ? [] : traySilhouettes(queue, cell, theme.silhouette.gap)).map((shape) => {
          const buffalo = shape.type === SPECIES.buffalo.type;
          return (
            <View
              key={shape.id}
              style={{
                position: 'absolute',
                left: shape.left,
                top: (stripH - bodyH) / 2,
                width: shape.width,
                height: bodyH,
                borderRadius: theme.silhouette.radius,
                backgroundColor: buffalo ? theme.silhouette.buffaloFill : theme.silhouette.fill,
                borderWidth: buffalo ? theme.silhouette.buffaloRimWidth : 0,
                borderColor: buffalo ? theme.silhouette.buffaloRim : 'transparent',
                borderTopWidth: buffalo ? theme.silhouette.buffaloRimWidth : 1,
                borderTopColor: buffalo ? theme.silhouette.buffaloRim : theme.silhouette.edge,
              }}
            />
          );
        })}
      </Animated.View>
      <HazardRule width={boardW} height={ruleH} />
    </View>
  );
}

const STYLES = themed((T) => StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  frozenLabel: { color: T.colors.inkMuted },
  strip: {
    backgroundColor: T.colors.panelSunken,
    borderWidth: 1,
    borderColor: T.colors.hairline,
    borderRadius: RADIUS.tray,
    overflow: 'hidden',
  },
}));

export const Tray = memo(TrayImpl);
