import React from 'react';
import { View, StyleSheet } from 'react-native';

const CELL_SIZE = 32;

export default function AnimalCell({ cellSize = CELL_SIZE }) {
  return (
    <View style={[styles.cell, { width: cellSize, height: cellSize }]} />
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
});
