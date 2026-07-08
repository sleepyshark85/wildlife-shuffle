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

  return (
    <View
      style={[
        styles.animal,
        isDropping && styles.dropping,
        {
          left: x * cellSize,
          top: y * cellSize,
          width,
          height: cellSize,
          backgroundColor: isDragging ? '#3366ff' : '#2255dd',
          borderColor: isDragging ? '#00d4ff' : '#4da6ff',
        },
      ]}
      {...panHandlers}
    >
      <Text style={[styles.emoji, { fontSize: cellSize - 4 }]}>{emoji}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  animal: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropping: {
  },
  emoji: {
    fontWeight: 'bold',
    textAlignVertical: 'center',
    textAlign: 'center',
  },
});
