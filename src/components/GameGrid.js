import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Animal from './Animal';

const CELL_SIZE = 32;

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
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (animalId, event) => {
    setSelectedAnimal({ id: animalId, startX: event.clientX });
    setIsDragging(true);
  };

  const handleMouseMove = (event) => {
    if (!isDragging || !selectedAnimal) return;

    const animal = animals.find(a => a.id === selectedAnimal.id);
    if (!animal) return;

    const currentX = event.clientX;
    const dragDelta = currentX - selectedAnimal.startX;
    const cellsToMove = Math.round(dragDelta / CELL_SIZE);
    const previewX = Math.max(0, Math.min(gridWidth - animal.size, animal.x + cellsToMove));

    setDragPreview({ animalId: selectedAnimal.id, previewX });
  };

  const handleMouseUp = (event) => {
    setIsDragging(false);

    if (!selectedAnimal || !dragPreview) {
      setSelectedAnimal(null);
      setDragPreview(null);
      return;
    }

    // Only trigger move if position actually changed
    const animal = animals.find(a => a.id === selectedAnimal.id);
    if (animal && animal.x !== dragPreview.previewX) {
      onMoveAnimal(selectedAnimal.id, dragPreview.previewX);
    }

    setSelectedAnimal(null);
    setDragPreview(null);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setSelectedAnimal(null);
    setDragPreview(null);
  };

  const gridPixelWidth = gridWidth * CELL_SIZE;
  const gridPixelHeight = gridHeight * CELL_SIZE;

  // Create grid background
  const backgroundCells = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const isClearing = clearingRows.includes(y);
      const visualY = (gridHeight - 1 - y) * CELL_SIZE;
      backgroundCells.push(
        <View
          key={`cell-${y}-${x}`}
          style={[
            styles.cell,
            {
              left: x * CELL_SIZE,
              top: visualY,
              backgroundColor: isClearing ? '#FFFF00' : '#f0f0f0',
              animation: isClearing ? 'flash 1.2s ease-in-out' : 'none',
            },
          ]}
        />
      );
    }
  }

  return (
    <View
      style={[styles.container, { userSelect: 'none' }]}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <View style={[styles.grid, { width: gridPixelWidth, height: gridPixelHeight }]}>
        {backgroundCells}

        {/* Render animals */}
        {animals.map(animal => {
          const isSelected = selectedAnimal?.id === animal.id;
          const displayX = dragPreview?.animalId === animal.id ? dragPreview.previewX : animal.x;
          const visualY = gridHeight - 1 - animal.y;

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
                    borderColor: '#FF9800',
                    borderRadius: 4,
                    backgroundColor: 'rgba(255, 152, 0, 0.25)',
                    borderStyle: 'dashed',
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
                onMouseDown={e => handleMouseDown(animal.id, e)}
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
    paddingVertical: 12,
  },
  grid: {
    position: 'relative',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#333',
  },
  cell: {
    position: 'absolute',
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clearingCell: {
    // Animation applied via inline style
  },
});

// Add row clearing flash animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flash {
      0%, 100% {
        background-color: #FFFF00;
        opacity: 1;
      }
      12.5% {
        background-color: #f0f0f0;
        opacity: 1;
      }
      25% {
        background-color: #FFFF00;
        opacity: 1;
      }
      37.5% {
        background-color: #f0f0f0;
        opacity: 1;
      }
      50% {
        background-color: #FFFF00;
        opacity: 1;
      }
      62.5% {
        background-color: #f0f0f0;
        opacity: 1;
      }
      75% {
        background-color: #FFFF00;
        opacity: 1;
      }
      87.5% {
        background-color: #f0f0f0;
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}
