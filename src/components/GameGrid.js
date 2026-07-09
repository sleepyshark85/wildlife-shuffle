import React, { useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, useWindowDimensions } from 'react-native';
import Animal from './Animal';

const BASE_CELL_SIZE = 32;

const ANIMAL_EMOJIS = {
  elephant: '🐘',
  buffalo: '🐃',
  elk: '🦌',
  fox: '🦊',
  rat: '🐀',
};

export default function GameGrid({ animals, clearingRows, onMoveAnimal, gridWidth = 10, gridHeight = 20 }) {
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const panResponderRef = useRef(null);
  const dragStartXRef = useRef(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  console.log('GameGrid received clearingRows:', clearingRows);

  // Calculate responsive cell size - scales up on big screens, down on small screens
  const maxWidthCellSize = Math.floor((screenWidth - 32) / gridWidth); // 32 for padding
  const maxHeightCellSize = Math.floor((screenHeight - 300) / gridHeight); // 300 for header, preview, etc.
  const CELL_SIZE = Math.max(24, Math.min(maxWidthCellSize, maxHeightCellSize));

  const createPanResponder = (animalId) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        dragStartXRef.current = evt.nativeEvent.pageX;
        setSelectedAnimal({ id: animalId, startX: evt.nativeEvent.pageX });
      },
      onPanResponderMove: (evt) => {
        const animal = animals.find(a => a.id === animalId);
        if (!animal || !dragStartXRef.current) return;

        const currentX = evt.nativeEvent.pageX;
        const dragDelta = currentX - dragStartXRef.current;
        const cellsToMove = Math.round(dragDelta / CELL_SIZE);
        const previewX = Math.max(0, Math.min(gridWidth - animal.size, animal.x + cellsToMove));

        setDragPreview({ animalId, previewX });
      },
      onPanResponderRelease: () => {
        if (selectedAnimal && dragPreview) {
          const animal = animals.find(a => a.id === selectedAnimal.id);
          if (animal && animal.x !== dragPreview.previewX) {
            onMoveAnimal(selectedAnimal.id, dragPreview.previewX);
          }
        }

        setSelectedAnimal(null);
        setDragPreview(null);
        dragStartXRef.current = null;
      },
      onPanResponderTerminate: () => {
        setSelectedAnimal(null);
        setDragPreview(null);
        dragStartXRef.current = null;
      },
    });
  };

  const gridPixelWidth = gridWidth * CELL_SIZE;
  const gridPixelHeight = gridHeight * CELL_SIZE;
  console.log(`🔍 Grid: screenWidth=${screenWidth}, CELL_SIZE=${CELL_SIZE}, gridWidth=${gridWidth}, gridPixelWidth=${gridPixelWidth}`);

  // Create grid background
  const backgroundCells = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const isClearing = clearingRows.includes(y);
      const visualY = (gridHeight - 1 - y) * CELL_SIZE;
      backgroundCells.push(
        <View
          key={`cell-${y}-${x}`}
          style={{
            position: 'absolute',
            width: CELL_SIZE,
            height: CELL_SIZE,
            borderWidth: 0.5,
            left: x * CELL_SIZE,
            top: visualY,
            backgroundColor: isClearing ? '#FF6600' : '#1e3a52',
            borderColor: '#5a8ace',
          }}
        />
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.grid, { width: gridPixelWidth, height: gridPixelHeight }]}>
        {backgroundCells}

        {/* Render animals */}
        {animals.map(animal => {
          const isSelected = selectedAnimal?.id === animal.id;
          const displayX = dragPreview?.animalId === animal.id ? dragPreview.previewX : animal.x;
          const visualY = gridHeight - 1 - animal.y;
          const panResponder = createPanResponder(animal.id);

          return (
            <View key={animal.id}>
              {/* Show ghost of original position while dragging */}
              {isSelected && dragPreview && dragPreview.previewX !== animal.x && (
                <View
                  style={{
                    position: 'absolute',
                    left: animal.x * CELL_SIZE,
                    top: visualY * CELL_SIZE,
                    width: animal.size * CELL_SIZE,
                    height: CELL_SIZE,
                    borderWidth: 3,
                    borderColor: '#FFB84D',
                    borderRadius: 6,
                    backgroundColor: 'rgba(255, 152, 0, 0.15)',
                    borderStyle: 'dashed',
                    opacity: 0.7,
                    shadowColor: '#FF9800',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                  }}
                />
              )}

              {/* Main animal */}
              <Animal
                animal={animal}
                x={displayX}
                y={visualY}
                cellSize={CELL_SIZE}
                isDragging={isSelected}
                {...panResponder.panHandlers}
                emoji={ANIMAL_EMOJIS[animal.type]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  grid: {
    position: 'relative',
    backgroundColor: '#0f1a2e',
    borderWidth: 0,
  },
});
