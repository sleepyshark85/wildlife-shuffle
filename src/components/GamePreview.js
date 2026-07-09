import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';

const BASE_CELL_SIZE = 32;

export default function GamePreview({ nextAnimals, gridWidth = 10, gridHeight = 20 }) {
  if (!nextAnimals || nextAnimals.length === 0) return null;

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Calculate cell size using SAME formula as GameGrid
  const maxWidthCellSize = Math.floor((screenWidth - 32) / gridWidth);
  const maxHeightCellSize = Math.floor((screenHeight - 300) / gridHeight);
  const CELL_SIZE = Math.max(24, Math.min(maxWidthCellSize, maxHeightCellSize));
  const INDICATOR_HEIGHT = 16; // Much thinner indicator row

  const previewWidth = gridWidth * CELL_SIZE;
  console.log(`🔍 Preview: screenWidth=${screenWidth}, screenHeight=${screenHeight}, CELL_SIZE=${CELL_SIZE}, gridWidth=${gridWidth}, previewWidth=${previewWidth}`);

  // Create occupancy map for next row (row 0)
  const occupancy = new Array(gridWidth).fill(false);
  nextAnimals.forEach(animal => {
    for (let col = animal.x; col < animal.x + animal.size && col < gridWidth; col++) {
      occupancy[col] = true;
    }
  });

  return (
    <View style={[styles.container, { width: previewWidth, alignItems: 'center' }]}>
      <Text style={styles.label}>Next row:</Text>
      <View style={[styles.preview, { width: previewWidth, height: INDICATOR_HEIGHT }]}>
        {/* Cell occupancy indicators */}
        {occupancy.map((isFilled, col) => (
          <View
            key={`cell-${col}`}
            style={{
              position: 'absolute',
              width: CELL_SIZE,
              height: INDICATOR_HEIGHT,
              left: col * CELL_SIZE,
              backgroundColor: isFilled ? '#22DD00' : '#0a0f1a',
              borderWidth: 1,
              borderColor: isFilled ? '#00AA00' : '#1a2a3a',
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    color: '#0f3460',
    letterSpacing: 0.3,
  },
  preview: {
    position: 'relative',
    backgroundColor: '#0f1a2e',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderTopWidth: 0,
    borderColor: '#0f3460',
    overflow: 'hidden',
  },
});
