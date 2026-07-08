import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CELL_SIZE = 32;

const ANIMAL_EMOJIS = {
  elephant: '🐘',
  buffalo: '🐃',
  elk: '🦌',
  fox: '🦊',
  rat: '🐀',
};

export default function GamePreview({ nextAnimals, gridWidth = 10 }) {
  if (!nextAnimals || nextAnimals.length === 0) return null;

  const previewWidth = gridWidth * CELL_SIZE;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Next Animals (Row 0 - bottom):</Text>
      <View style={[styles.preview, { width: previewWidth, height: CELL_SIZE }]}>
        {/* Background grid cells */}
        {Array.from({ length: gridWidth }).map((_, i) => (
          <View
            key={`cell-${i}`}
            style={[
              styles.previewCell,
              {
                left: i * CELL_SIZE,
              },
            ]}
          />
        ))}

        {/* Next animals */}
        {nextAnimals.map(animal => (
          <View
            key={animal.id}
            style={[
              styles.animal,
              {
                left: animal.x * CELL_SIZE,
                width: animal.size * CELL_SIZE,
              },
            ]}
          >
            <Text style={[styles.emoji, { fontSize: CELL_SIZE - 4 }]}>
              {ANIMAL_EMOJIS[animal.type]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0f3460',
    letterSpacing: 0.5,
  },
  preview: {
    position: 'relative',
    backgroundColor: '#0f1a2e',
    borderWidth: 0,
    overflow: 'hidden',
  },
  previewCell: {
    position: 'absolute',
    width: CELL_SIZE,
    height: CELL_SIZE,
    top: 0,
    borderWidth: 0.5,
    borderColor: '#2a4a7e',
    backgroundColor: '#1e3a52',
  },
  animal: {
    position: 'absolute',
    height: CELL_SIZE,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2255dd',
    borderWidth: 1,
    borderColor: '#4da6ff',
    borderRadius: 2,
  },
  emoji: {
    fontWeight: 'bold',
    fontSize: CELL_SIZE - 6,
    textAlign: 'center',
  },
});
