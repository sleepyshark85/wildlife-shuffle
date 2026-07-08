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
    generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, [])
  );
  const [clearingRows, setClearingRows] = useState([]);

  const executeChainClear = useCallback((animals) => {
    const filledRows = getFilledRows(animals, gameConfig.gridWidth, gameConfig.gridHeight);
    if (filledRows.length === 0) return;

    setClearingRows(filledRows);
    setTimeout(() => {
      setAnimals(current => {
        const { animals: cleared } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
        const afterGravity = applyGravity(cleared);

        // Check if more rows are filled for chain clearing
        const nextFilledRows = getFilledRows(afterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
        if (nextFilledRows.length > 0) {
          // Chain clear - recursively clear more rows
          executeChainClear(afterGravity);
        } else {
          // No more rows to clear
          setClearingRows([]);
        }

        return afterGravity;
      });
    }, 1200);
  }, [gameConfig.gridWidth, gameConfig.gridHeight]);

  const executeTurnSequence = useCallback(() => {
    setAnimals(prevAnimals => {
      // Step 1: Grid advancement - all rows shift upward by 1
      return advanceGrid(prevAnimals);
    });

    // Step 2: New animals added at Row 0 (bottom) - with 300ms delay
    setTimeout(() => {
      setAnimals(prevAnimals => {
        // Filter out new animals that would overlap with existing animals at y=0
        const validNextAnimals = nextAnimals.filter(newAnimal => {
          return !prevAnimals.some(existing => {
            if (existing.y !== 0) return false; // Only check animals at spawn row
            const newStart = newAnimal.x;
            const newEnd = newAnimal.x + newAnimal.size;
            const existingStart = existing.x;
            const existingEnd = existing.x + existing.size;
            return !(newEnd <= existingStart || newStart >= existingEnd);
          });
        });

        let updated = [...validNextAnimals, ...prevAnimals];
        // Step 3: Gravity is applied
        updated = applyGravity(updated);

        // Step 4 & 5: Row clearing with chain clear support
        executeChainClear(updated);

        return updated;
      });
    }, 300);

    // Generate next animals for the next player move (turn + 1)
    setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));
  }, [turn, nextAnimals, executeChainClear]);

  const moveSelectedAnimal = useCallback((animalId, newX, onMoveComplete) => {
    if (!canMoveAnimal(animals, animalId, newX)) {
      return;
    }

    setAnimals(prev => {
      // Step 6: Move animal
      let updated = moveAnimal(prev, animalId, newX);

      // Step 7: Gravity is applied after player move
      updated = applyGravity(updated);

      // Step 8: Row clearing after player move with chain clear support
      let filledRows = getFilledRows(updated, gameConfig.gridWidth, gameConfig.gridHeight);
      if (filledRows.length > 0) {
        const onChainClearComplete = () => {
          // Step 9 & 10: Game over check, turn increment, and next animals generation
          setTurn(prev => prev + 1);
          setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));

          if (onMoveComplete) onMoveComplete();
        };

        setClearingRows(filledRows);
        setTimeout(() => {
          setAnimals(current => {
            const { animals: cleared } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
            const afterGravity = applyGravity(cleared);

            // Check if more rows are filled for chain clearing
            const nextFilledRows = getFilledRows(afterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
            if (nextFilledRows.length > 0) {
              // Chain clear - show next clearing animation
              setClearingRows(nextFilledRows);
              setTimeout(() => {
                setAnimals(chainCurrent => {
                  const { animals: chainCleared } = clearFilledRows(chainCurrent, gameConfig.gridWidth, gameConfig.gridHeight);
                  const chainAfterGravity = applyGravity(chainCleared);

                  // Recursively check for more chain clears
                  const moreFilledRows = getFilledRows(chainAfterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
                  if (moreFilledRows.length === 0) {
                    setClearingRows([]);
                    // Check game over and complete turn
                    setAnimals(current => {
                      if (checkGameOver(current)) {
                        setGameOver(true);
                      }
                      return current;
                    });
                    onChainClearComplete();
                  }
                  return chainAfterGravity;
                });
              }, 1200);
            } else {
              setClearingRows([]);
              // Check game over and complete turn
              setAnimals(current => {
                if (checkGameOver(current)) {
                  setGameOver(true);
                }
                return current;
              });
              onChainClearComplete();
            }

            return afterGravity;
          });
        }, 1200);
      } else {
        // No clearing, continue immediately
        setAnimals(current => {
          if (checkGameOver(current)) {
            setGameOver(true);
          }
          return current;
        });
        setTurn(prev => prev + 1);
        setNextAnimals(generateAnimalsForTurn(turn + 1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));

        if (onMoveComplete) onMoveComplete();
      }

      return updated;
    });
  }, [animals, turn, gameConfig.gridWidth, gameConfig.gridHeight]);

  const resetGame = useCallback(() => {
    setAnimals(createInitialAnimals(gameConfig));
    setTurn(0);
    setGameOver(false);
    setNextAnimals(generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));
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

  // Check for initial filled rows (e.g., from first spawn) and clear them
  useEffect(() => {
    if (turn === 0 && clearingRows.length === 0 && animals.length > 0) {
      const filledRows = getFilledRows(animals, gameConfig.gridWidth, gameConfig.gridHeight);
      if (filledRows.length > 0) {
        // Initial animals form filled rows, clear them automatically
        setClearingRows(filledRows);
        setTimeout(() => {
          setAnimals(current => {
            const { animals: cleared } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
            const afterGravity = applyGravity(cleared);

            // Check if more rows are filled
            const nextFilledRows = getFilledRows(afterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
            if (nextFilledRows.length === 0) {
              setClearingRows([]);
              setTurn(1); // Move to turn 1 after clearing
              setNextAnimals(generateAnimalsForTurn(2, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));
            }

            return afterGravity;
          });
        }, 1200);
      }
    }
  }, [turn, animals.length, clearingRows.length, gameConfig]);

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
