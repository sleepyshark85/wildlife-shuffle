// These are defaults, can be overridden by config
export let GRID_WIDTH = 10;
export let GRID_HEIGHT = 20;

export function setGridDimensions(width, height) {
  GRID_WIDTH = width;
  GRID_HEIGHT = height;
}

const ANIMAL_TYPES = {
  elephant: { size: 4, emoji: '🐘' },
  buffalo: { size: 5, emoji: '🐃' },
  elk: { size: 3, emoji: '🦌' },
  fox: { size: 2, emoji: '🦊' },
  rat: { size: 1, emoji: '🐀' },
};

let nextId = 1;

function getRandomAnimalType() {
  const types = Object.keys(ANIMAL_TYPES).filter(type => type !== 'buffalo');
  return types[Math.floor(Math.random() * types.length)];
}

function getRandomColumn(size) {
  const maxStart = GRID_WIDTH - size;
  return Math.floor(Math.random() * (maxStart + 1));
}

export function generateAnimal(turn) {
  // Buffalo appears every 10 turns, but NOT at turn 0
  const type = (turn > 0 && turn % 10 === 0) ? 'buffalo' : getRandomAnimalType();
  const size = ANIMAL_TYPES[type].size;
  const x = getRandomColumn(size);

  return {
    id: nextId++,
    type,
    x,
    y: 0, // Always spawn at Row 0 (bottom)
    size,
  };
}

export function generateAnimalsForTurn(turn, animalsPerTurn, width = GRID_WIDTH) {
  const count = Math.ceil(animalsPerTurn);
  const animals = [];
  let buffaloAdded = false; // Track if we've already added a buffalo

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let animal = generateAnimal(turn);

    // Keep regenerating until we find a non-overlapping animal that fits
    while (attempts < 10) {
      // If this animal is a buffalo and we already have one, force a non-buffalo type
      if (animal.type === 'buffalo' && buffaloAdded) {
        // Explicitly create a non-buffalo animal
        const types = Object.keys(ANIMAL_TYPES).filter(t => t !== 'buffalo');
        const type = types[Math.floor(Math.random() * types.length)];
        const size = ANIMAL_TYPES[type].size;
        const x = getRandomColumn(size);
        animal = {
          id: nextId++,
          type,
          x,
          y: 0,
          size,
        };
        attempts++;
        continue;
      }

      // Check if animal fits within bounds
      const fitsInBounds = animal.x >= 0 && animal.x + animal.size <= width;

      // Check if it overlaps with other animals in this batch
      const overlaps = !fitsInBounds || animals.some(other => {
        const newStart = animal.x;
        const newEnd = animal.x + animal.size;
        const otherStart = other.x;
        const otherEnd = other.x + other.size;
        return !(newEnd <= otherStart || newStart >= otherEnd);
      });

      if (!overlaps) {
        // Valid animal found
        break;
      }

      // Regenerate with same turn (for consistent behavior)
      animal = generateAnimal(turn);
      attempts++;
    }

    // Only add if we found a valid position, otherwise skip
    if (animal.x >= 0 && animal.x + animal.size <= width) {
      animals.push(animal);
      if (animal.type === 'buffalo') {
        buffaloAdded = true;
      }
    }
  }

  return animals;
}

export function advanceGrid(animals) {
  // All rows shift upward by 1 (each animal's y increases by 1)
  return animals.map(a => ({ ...a, y: a.y + 1 }));
}

export function applyGravity(animals) {
  let result = [...animals];

  // Process animals from bottom to top (low y to high y) so lower animals settle first
  const sorted = result
    .map((animal, index) => ({ ...animal, index }))
    .sort((a, b) => a.y - b.y);

  for (const animal of sorted) {
    let lowestY = animal.y;

    // Check each row below the animal
    for (let testY = animal.y - 1; testY >= 0; testY--) {
      // Check if blocked by any OTHER animal (using current result state)
      const blocked = result.some(other => {
        if (other.id === animal.id) return false;
        if (other.y !== testY) return false;
        // Check for horizontal overlap
        return !(animal.x + animal.size <= other.x || animal.x >= other.x + other.size);
      });

      if (!blocked) {
        lowestY = testY;
      } else {
        break;
      }
    }

    // Update this animal in result
    const resultIndex = result.findIndex(a => a.id === animal.id);
    if (resultIndex !== -1) {
      result[resultIndex] = { ...result[resultIndex], y: lowestY };
    }
  }

  return result;
}

export function getFilledRows(animals, width = GRID_WIDTH, height = GRID_HEIGHT) {
  // Find rows that are completely filled (all columns occupied)
  const rowMap = {};

  for (let y = 0; y < height; y++) {
    rowMap[y] = new Array(width).fill(false);
  }

  // Mark occupied cells
  animals.forEach(animal => {
    if (animal.y >= 0 && animal.y < height) {
      for (let x = animal.x; x < animal.x + animal.size; x++) {
        if (x >= 0 && x < width) {
          rowMap[animal.y][x] = true;
        }
      }
    }
  });

  // Find filled rows
  const filledRows = [];
  for (let y = 0; y < height; y++) {
    if (rowMap[y] && rowMap[y].every(cell => cell)) {
      filledRows.push(y);
    }
  }

  return filledRows;
}

export function clearFilledRows(animals, width = GRID_WIDTH, height = GRID_HEIGHT) {
  const filledRows = getFilledRows(animals, width, height);

  if (filledRows.length === 0) {
    return { animals, clearedRows: [] };
  }

  // Process each filled row: buffalo survives with reduced size, others disappear
  let remaining = animals.filter(animal => {
    // If animal is not in a filled row, keep it
    if (!filledRows.includes(animal.y)) {
      return true;
    }

    // If animal is in a filled row AND is a buffalo, keep it (size will be reduced)
    if (animal.type === 'buffalo') {
      return true;
    }

    // All other animals in filled rows are removed
    return false;
  });

  // Reduce buffalo size for any buffalo in cleared rows
  // NOTE: Do NOT shift positions here - let applyGravity handle all movement after clearing
  remaining = remaining.map(animal => {
    // If buffalo is in a cleared row, reduce its size by 1 (disappears when size reaches 0)
    if (animal.type === 'buffalo' && filledRows.includes(animal.y)) {
      const newSize = animal.size - 1;
      if (newSize <= 0) {
        console.log(`🐃 Buffalo #${animal.id} disappeared (shrunk from ${animal.size})`);
        return null; // Mark for removal
      }
      console.log(`🐃 Buffalo #${animal.id} shrunk from ${animal.size} to ${newSize}`);
      return {
        id: animal.id,
        type: animal.type,
        x: animal.x,
        y: animal.y,
        size: newSize,
      };
    }

    return animal;
  }).filter(animal => animal !== null);

  return { animals: remaining, clearedRows: filledRows };
}

export function canMoveAnimal(animals, animalId, newX) {
  const animal = animals.find(a => a.id === animalId);
  if (!animal) return false;

  // Check bounds
  if (newX < 0 || newX + animal.size > GRID_WIDTH) {
    return false;
  }

  // Check collision with other animals in same row
  const collision = animals.some(other => {
    if (other.id === animalId || other.y !== animal.y) return false;

    // Check if ranges overlap
    const newStart = newX;
    const newEnd = newX + animal.size;
    const otherStart = other.x;
    const otherEnd = other.x + other.size;

    return !(newEnd <= otherStart || newStart >= otherEnd);
  });

  return !collision;
}

export function moveAnimal(animals, animalId, newX) {
  if (!canMoveAnimal(animals, animalId, newX)) {
    return animals;
  }

  return animals.map(a =>
    a.id === animalId ? { ...a, x: newX } : a
  );
}

export function checkGameOver(animals) {
  // Game over if any animal is at Row 19 (top)
  return animals.some(a => a.y >= GRID_HEIGHT - 1);
}

export function resetAnimalsCounter() {
  nextId = 1;
}
