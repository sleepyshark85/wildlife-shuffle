import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const CELL_SIZE = 32;

export default function Animal({ animal, x, y, cellSize = CELL_SIZE, isDragging, emoji, ...panHandlers }) {
  const width = animal.size * cellSize;
  const [isDropping, setIsDropping] = useState(false);
  const [prevY, setPrevY] = useState(y);

  // Detect when animal drops and trigger animation
  useEffect(() => {
    if (y > prevY && !isDragging) {
      setIsDropping(true);
      const timeout = setTimeout(() => setIsDropping(false), 300);
      return () => clearTimeout(timeout);
    }
    setPrevY(y);
  }, [y, isDragging]);

  // Buffalo styling - more dangerous looking
  const isBuffalo = animal.type === 'buffalo';
  const baseColor = isBuffalo ? '#e74c3c' : '#2255dd';
  const dragColor = isBuffalo ? '#c0392b' : '#3366ff';
  const borderColor = isBuffalo ? (isDragging ? '#a93226' : '#d35400') : (isDragging ? '#00d4ff' : '#4da6ff');
  const borderWidth = isBuffalo ? 2.5 : 1;
  const shadowColor = isBuffalo ? '#e74c3c' : '#2255dd';

  return (
    <View
      style={[
        styles.animal,
        isDropping && styles.dropping,
        isBuffalo && styles.buffaloContainer,
        {
          left: x * cellSize,
          top: y * cellSize,
          width,
          height: cellSize,
          backgroundColor: isDragging ? dragColor : baseColor,
          borderColor,
          borderWidth,
          shadowColor,
          shadowOffset: isBuffalo ? { width: 0, height: 0 } : { width: 0, height: 0 },
          shadowOpacity: isBuffalo ? 0.4 : 0,
          shadowRadius: isBuffalo ? 6 : 0,
          elevation: isBuffalo ? 8 : 0,
        },
      ]}
      {...panHandlers}
    >
      <Text style={[styles.emoji, { fontSize: cellSize - 4, fontWeight: isBuffalo ? '900' : 'bold' }]}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  animal: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    overflow: 'hidden',
  },
  buffaloContainer: {
    borderRadius: 4,
  },
  dropping: {
  },
  emoji: {
    fontWeight: 'bold',
    textAlignVertical: 'center',
    textAlign: 'center',
  },
});
