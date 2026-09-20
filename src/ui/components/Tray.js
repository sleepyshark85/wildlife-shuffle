// The tray — the preview contract, made visible (ui.md §6).
//
// v1 rendered a row of flat occupancy squares and then re-rolled the positions
// anyway. v2 renders the ACTUAL animals, at the board's cell width, in their
// exact spawn columns, in their exact species colours, with their exact panel
// counts. The engine guarantees the batch arrives verbatim (AC-301).

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SPECIES } from '../../engine/constants.js';
import { COLORS, COPY, RADIUS, SEAM, SEAM_BUFFALO, SPECIES_STYLE, TYPE } from '../theme.js';

/** 45 degree accent stripes: "these push up from here" (ui.md §6). */
function HazardRule({ width, height }) {
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
          backgroundColor: 'rgba(255,194,75,.45)',
          transform: [{ rotate: '45deg' }],
        }}
      />,
    );
  }
  return <View style={{ width, height, overflow: 'hidden' }}>{bars}</View>;
}

function TrayImpl({ queue, cells, cell, boardW, compact }) {
  const labelH = compact ? 10 : 14;
  const stripH = Math.round(cell * (compact ? 0.67 : 0.78));
  const ruleH = compact ? 2 : 3;
  const bodyH = Math.round(stripH * 0.93);
  const glyph = Math.round(cell * 0.42);

  return (
    <View
      style={{ width: boardW }}
      accessibilityLabel={trayLabel(queue, cells)}
      accessible
    >
      <View style={[styles.labelRow, { height: labelH }]}>
        <Text allowFontScaling={false} style={TYPE.label}>{COPY.trayLabel}</Text>
        <Text allowFontScaling={false} style={TYPE.label}>{cells} CELLS</Text>
      </View>
      <View style={[styles.strip, { width: boardW, height: stripH }]}>
        {queue.map((animal) => {
          const style = SPECIES_STYLE[animal.type] || SPECIES_STYLE.rat;
          const buffalo = animal.type === SPECIES.buffalo.type;
          const seams = [];
          for (let i = 1; i < animal.size; i += 1) {
            seams.push(
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: i * cell,
                  top: 3,
                  bottom: 3,
                  width: 1,
                  backgroundColor: buffalo ? SEAM_BUFFALO : SEAM,
                }}
              />,
            );
          }
          return (
            <View
              key={animal.id}
              style={{
                position: 'absolute',
                left: animal.x * cell,
                top: (stripH - bodyH) / 2,
                width: animal.size * cell,
                height: bodyH,
                borderRadius: 4,
                borderWidth: buffalo ? 2 : 1.5,
                borderColor: style.edge,
                backgroundColor: style.fill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {seams}
              <Text
                allowFontScaling={false}
                style={{ fontSize: glyph, lineHeight: glyph * 1.2, color: style.glyph }}
              >
                {(SPECIES[animal.type] || SPECIES.rat).emoji}
              </Text>
            </View>
          );
        })}
      </View>
      <HazardRule width={boardW} height={ruleH} />
    </View>
  );
}

function trayLabel(queue, cells) {
  if (queue.length === 0) return 'Next arrival: nothing queued.';
  const parts = queue.map((a) => {
    const where = a.size === 1 ? `column ${a.x + 1}` : `columns ${a.x + 1} to ${a.x + a.size}`;
    return `${a.type} at ${where}`;
  });
  return `Next arrival: ${parts.join(', ')}. ${cells} cells.`;
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  strip: {
    backgroundColor: COLORS.panelSunken,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: RADIUS.tray,
    overflow: 'hidden',
  },
});

export const Tray = memo(TrayImpl);
