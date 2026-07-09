import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSoundManager } from '../hooks/useSoundManager';

function createInitialAnimals(gameConfig) {
  resetAnimalsCounter();
  const animals = generateAnimalsForTurn(0, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth);
  return animals;
}

function calculateClearPoints(clearedAnimals) {
  // Points equal to sum of sizes of cleared animals
  return clearedAnimals.reduce((total, animal) => total + animal.size, 0);
}

export function useGameStore(config = null, resumeSession = null) {
  const gameConfig = config ? validateConfig(config) : { gridWidth: 10, gridHeight: 20, difficulty: 'normal' };

  // Set grid dimensions
  setGridDimensions(gameConfig.gridWidth, gameConfig.gridHeight);

  const { playSound } = useSoundManager();

  const [animals, setAnimals] = useState(() =>
    resumeSession?.animals || createInitialAnimals(gameConfig)
  );
  const [turn, setTurn] = useState(resumeSession?.turn || 0);
  const [score, setScore] = useState(resumeSession?.score || 0);
  const [gameOver, setGameOver] = useState(false);
  const [nextAnimals, setNextAnimals] = useState(() =>
    resumeSession?.nextAnimals || generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, [])
  );
  const [clearingRows, setClearingRows] = useState([]);
  const clearingTimeoutRef = useRef(null);

  // Local storage for high score and session history
  const [highScore, setHighScore] = useLocalStorage('wildlife-shuffle-highscore', 0);
  const [sessionHistory, setSessionHistory] = useLocalStorage('wildlife-shuffle-history', []);
  const [stats, setStats] = useLocalStorage('wildlife-shuffle-stats', {
    totalGames: 0,
    totalTurns: 0,
    totalScore: 0,
    bestTurnCount: 0,
  });

  // Auto-save game state periodically (every 5 seconds if game is active)
  useEffect(() => {
    if (!gameOver && animals.length > 0) {
      const saveGameState = async () => {
        try {
          const sessionData = {
            animals,
            turn,
            score,
            nextAnimals,
            config: gameConfig,
          };
          await AsyncStorage.setItem('wildlife-shuffle-current-session', JSON.stringify(sessionData));
        } catch (error) {
          console.error('Error auto-saving game state:', error);
        }
      };

      const interval = setInterval(saveGameState, 5000);
      return () => clearInterval(interval);
    }
  }, [animals, turn, score, nextAnimals, gameOver, gameConfig]);

  const executeChainClear = useCallback((animals) => {
    const filledRows = getFilledRows(animals, gameConfig.gridWidth, gameConfig.gridHeight);
    console.log('🔍 Chain clear checking:', filledRows, 'animals:', animals.length);
    if (filledRows.length === 0) return;

    console.log('🟡 Chain clearing rows:', filledRows);

    // Clear any existing timeout
    if (clearingTimeoutRef.current) clearTimeout(clearingTimeoutRef.current);

    // Show clearing effect first
    setClearingRows(filledRows);

    // After delay, clear and remove animals
    clearingTimeoutRef.current = setTimeout(() => {
      setClearingRows([]);
      setAnimals(current => {
        const { animals: cleared, clearedRows } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
        const afterGravity = applyGravity(cleared);

        // Calculate points from cleared animals
        if (clearedRows.length > 0) {
          const clearedAnimals = current.filter(a => clearedRows.includes(a.y) && !cleared.find(c => c.id === a.id));
          const points = calculateClearPoints(clearedAnimals);
          setScore(prev => prev + points);
          playSound('clear');
        }

        // Check if more rows are filled for chain clearing
        const nextFilledRows = getFilledRows(afterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
        if (nextFilledRows.length > 0) {
          // Chain clear - recursively clear more rows
          executeChainClear(afterGravity);
        }

        return afterGravity;
      });
    }, 1000);
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
        const filteredNextAnimals = nextAnimals.filter(newAnimal => {
          return !prevAnimals.some(existing => {
            if (existing.y !== 0) return false; // Only check animals at spawn row
            const newStart = newAnimal.x;
            const newEnd = newAnimal.x + newAnimal.size;
            const existingStart = existing.x;
            const existingEnd = existing.x + existing.size;
            return !(newEnd <= existingStart || newStart >= existingEnd);
          });
        });

        let updated = [...filteredNextAnimals, ...prevAnimals];
        // Step 3: Gravity is applied
        updated = applyGravity(updated);

        // Step 4 & 5: Row clearing with chain clear support
        const filledRows = getFilledRows(updated, gameConfig.gridWidth, gameConfig.gridHeight);
        console.log('🔍 Checking for filled rows:', filledRows, 'Total animals:', updated.length);
        if (filledRows.length > 0) {
          console.log('🟡 Rows to clear:', filledRows);
          setClearingRows(filledRows);

          // Clear rows after a short delay
          setTimeout(() => {
            setClearingRows([]);
            executeChainClear(updated);
          }, 500);
        } else {
          executeChainClear(updated);
        }

        return updated;
      });
    }, 300);
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
          setNextAnimals(generateAnimalsForTurn(turn + 2, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));

          if (onMoveComplete) onMoveComplete();
        };

        setClearingRows(filledRows);
        setTimeout(() => {
          setAnimals(current => {
            const { animals: cleared, clearedRows } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
            const afterGravity = applyGravity(cleared);

            // Calculate points from cleared animals
            if (clearedRows.length > 0) {
              const clearedAnimals = current.filter(a => clearedRows.includes(a.y) && !cleared.find(c => c.id === a.id));
              const points = calculateClearPoints(clearedAnimals);
              setScore(prev => prev + points);
              playSound('clear');
            }

            // Check if more rows are filled for chain clearing
            const nextFilledRows = getFilledRows(afterGravity, gameConfig.gridWidth, gameConfig.gridHeight);
            if (nextFilledRows.length > 0) {
              // Chain clear - show next clearing animation
              setClearingRows(nextFilledRows);
              setTimeout(() => {
                setAnimals(chainCurrent => {
                  const { animals: chainCleared, clearedRows: chainClearedRows } = clearFilledRows(chainCurrent, gameConfig.gridWidth, gameConfig.gridHeight);
                  const chainAfterGravity = applyGravity(chainCleared);

                  // Calculate points from chain cleared animals
                  if (chainClearedRows.length > 0) {
                    const chainClearedAnimals = chainCurrent.filter(a => chainClearedRows.includes(a.y) && !chainCleared.find(c => c.id === a.id));
                    const points = calculateClearPoints(chainClearedAnimals);
                    setScore(prev => prev + points);
                    playSound('clear');
                  }

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
        setNextAnimals(generateAnimalsForTurn(turn + 2, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));

        if (onMoveComplete) onMoveComplete();
      }

      return updated;
    });
  }, [animals, turn, gameConfig.gridWidth, gameConfig.gridHeight]);

  // Save game session to history when game ends
  useEffect(() => {
    if (gameOver && score >= 0) {
      playSound('gameover');
      const isNewHighScore = score > highScore;

      const session = {
        turn,
        score,
        timestamp: new Date().toISOString(),
        config: gameConfig,
      };

      // Update high score and play celebration sound
      if (isNewHighScore) {
        setHighScore(score);
        playSound('highscore');
      }

      // Update statistics
      setStats(prev => ({
        totalGames: prev.totalGames + 1,
        totalTurns: prev.totalTurns + turn,
        totalScore: prev.totalScore + score,
        bestTurnCount: Math.max(prev.bestTurnCount, turn),
      }));

      // Add to session history (keep last 10 sessions)
      setSessionHistory(prev => [session, ...prev.slice(0, 9)]);
    }
  }, [gameOver, turn, score, highScore, gameConfig, setHighScore, setSessionHistory, setStats, playSound]);

  const resetGame = useCallback(() => {
    setAnimals(createInitialAnimals(gameConfig));
    setTurn(0);
    setScore(0);
    setGameOver(false);
    setNextAnimals(generateAnimalsForTurn(1, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));
    setClearingRows([]);
  }, [gameConfig]);

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

  // Save current game state for resume
  const saveSession = useCallback(async () => {
    const sessionData = {
      animals,
      turn,
      score,
      nextAnimals,
      config: gameConfig,
    };
    try {
      await AsyncStorage.setItem('wildlife-shuffle-current-session', JSON.stringify(sessionData));
    } catch (error) {
      console.error('Error saving session:', error);
    }
    return sessionData;
  }, [animals, turn, score, nextAnimals, gameConfig]);

  return {
    animals,
    turn,
    score,
    highScore,
    stats,
    gameOver,
    nextAnimals,
    clearingRows,
    moveSelectedAnimal,
    resetGame,
    executeTurnSequence,
    saveSession,
    config: gameConfig,
    sessionHistory,
  };
}
