import { useState, useCallback, useEffect } from 'react';
import {
  generateAnimal,
  generateAnimalsForTurn,
  advanceGrid,
  applyGravity,
  checkGameOver,
  clearFilledRows,
  getFilledRows,
  canMoveAnimal,
  moveAnimal,
  resetAnimalsCounter,
  setGridDimensions,
} from './gameLogic';
import { DIFFICULTY_LEVELS, validateConfig } from './gameConfig';

function createInitialAnimals(gameConfig) {
  resetAnimalsCounter();
  const animals = generateAnimalsForTurn(0, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth);
  return animals;
}

export function useGameStore(config = null) {
  const gameConfig = config ? validateConfig(config) : { gridWidth: 10, gridHeight: 20, difficulty: 'normal' };

  // Set grid dimensions
  setGridDimensions(gameConfig.gridWidth, gameConfig.gridHeight);

  const [animals, setAnimals] = useState(() => createInitialAnimals(gameConfig));
  const [turn, setTurn] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [nextAnimals, setNextAnimals] = useState(() =>
    generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn)
  );
  const [clearingRows, setClearingRows] = useState([]);

  const executeTurnSequence = useCallback(() => {
    setAnimals(prevAnimals => {
      // Step 1: Grid advancement - all rows shift upward by 1
      let updated = advanceGrid(prevAnimals);

      // Step 2: New animals added at Row 0 (bottom)
      updated = [...nextAnimals, ...updated];

      // Step 3: Gravity is applied
      updated = applyGravity(updated);

      // Step 4 & 5: Row clearing
      let filledRows = getFilledRows(updated, gameConfig.gridWidth, gameConfig.gridHeight);
      if (filledRows.length > 0) {
        setClearingRows(filledRows);
        setTimeout(() => {
          setAnimals(current => {
            const { animals: cleared } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
            // Apply gravity again after clearing
            return applyGravity(cleared);
          });
          setClearingRows([]);
        }, 1200);
      }

      return updated;
    });

    // Generate next animals for the next player move (turn + 1)
    setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn));
  }, [turn, nextAnimals]);

  const moveSelectedAnimal = useCallback((animalId, newX, onMoveComplete) => {
    if (!canMoveAnimal(animals, animalId, newX)) {
      return;
    }

    setAnimals(prev => {
      // Step 6: Move animal
      let updated = moveAnimal(prev, animalId, newX);

      // Step 7: Gravity is applied after player move
      updated = applyGravity(updated);

      // Step 8: Row clearing after player move
      let filledRows = getFilledRows(updated);
      if (filledRows.length > 0) {
        setClearingRows(filledRows);
        setTimeout(() => {
          setAnimals(current => {
            const { animals: cleared } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
            // Apply gravity again after clearing
            return applyGravity(cleared);
          });
          setClearingRows([]);

          // Step 9 & 10: Game over check, turn increment, and next animals generation
          setTurn(prev => prev + 1);
          setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn));

          // Continue to next turn after clearing completes
          if (onMoveComplete) onMoveComplete();
        }, 1200);
      } else {
        // No clearing, continue immediately
        // Step 9 & 10: Game over check, turn increment, and next animals generation
        setAnimals(current => {
          if (checkGameOver(current)) {
            setGameOver(true);
          }
          return current;
        });
        setTurn(prev => prev + 1);
        setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn));

        if (onMoveComplete) onMoveComplete();
      }

      return updated;
    });
  }, [animals, turn]);

  const resetGame = useCallback(() => {
    setAnimals(createInitialAnimals(gameConfig));
    setTurn(0);
    setGameOver(false);
    setNextAnimals(generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn));
    setClearingRows([]);
  }, []);

  // Auto-execute turn when grid becomes completely empty
  useEffect(() => {
    if (clearingRows.length === 0 && animals.length === 0 && !gameOver) {
      const timeout = setTimeout(() => {
        executeTurnSequence();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [animals.length, clearingRows.length, gameOver, executeTurnSequence]);

  return {
    animals,
    turn,
    gameOver,
    nextAnimals,
    clearingRows,
    moveSelectedAnimal,
    resetGame,
    executeTurnSequence,
    config: gameConfig,
  };
}
