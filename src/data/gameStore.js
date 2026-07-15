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

  const executeClearingLoop = useCallback((startingAnimals, onComplete) => {
    let current = startingAnimals;
    let totalPoints = 0;
    let comboCount = 0;

    const doClear = () => {
      const filledRows = getFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
      console.log('🔍 Checking for filled rows:', filledRows, 'animals:', current.length);

      if (filledRows.length === 0) {
        // No more rows to clear, loop complete
        console.log('✅ Clearing loop complete, total points:', totalPoints, 'combo count:', comboCount);
        setClearingRows([]);
        setAnimals(current);
        if (onComplete) onComplete(current, totalPoints);
        return;
      }

      console.log('🟡 Clearing rows:', filledRows);
      // Update state with current positions before showing clearing animation
      setAnimals(current);
      setClearingRows(filledRows);

      setTimeout(() => {
        const { animals: cleared, clearedRows } = clearFilledRows(current, gameConfig.gridWidth, gameConfig.gridHeight);
        const afterGravity = applyGravity(cleared);

        // Update React state after gravity
        setAnimals(afterGravity);

        // Calculate points from cleared animals with combo multiplier
        if (clearedRows.length > 0) {
          comboCount++;
          const comboMultiplier = Math.pow(1.5, comboCount - 1); // 1.0x, 1.5x, 2.25x, 3.375x, ...

          const clearedAnimals = current.filter(a => clearedRows.includes(a.y) && !cleared.find(c => c.id === a.id));
          const basePoints = calculateClearPoints(clearedAnimals);
          const comboPoints = Math.floor(basePoints * comboMultiplier);

          totalPoints += comboPoints;
          setScore(prev => prev + comboPoints);

          console.log(`🎯 Combo #${comboCount}: ${basePoints} × ${comboMultiplier.toFixed(2)} = ${comboPoints} points`);
          playSound('clear');
        }

        current = afterGravity;
        // Continue loop by checking for more filled rows
        doClear();
      }, 1000);
    };

    doClear();
  }, [gameConfig.gridWidth, gameConfig.gridHeight, playSound]);

  const executeTurnSequence = useCallback((nextAnimalsParam) => {
    console.log(`🚀 executeTurnSequence called with param:`, nextAnimalsParam?.map(a => `#${a.id}(${a.type})`).join(', '));

    setAnimals(prevAnimals => {
      // Step 1: Grid advancement - all rows shift upward by 1
      let updated = advanceGrid(prevAnimals);

      // Step 2: New animals added at Row 0 (bottom)
      const animalsToAdd = nextAnimalsParam || nextAnimals;
      console.log(`➕ Adding animals to grid:`, animalsToAdd.map(a => `#${a.id}(${a.type})`).join(', '));

      // Filter out new animals that would overlap with existing animals at y=0
      const filteredNextAnimals = animalsToAdd.filter(newAnimal => {
        const hasOverlap = updated.some(existing => {
          if (existing.y !== 0) return false;
          const newStart = newAnimal.x;
          const newEnd = newAnimal.x + newAnimal.size;
          const existingStart = existing.x;
          const existingEnd = existing.x + existing.size;
          return !(newEnd <= existingStart || newStart >= existingEnd);
        });
        if (hasOverlap) {
          console.log(`  ❌ Filtering out #${newAnimal.id}(${newAnimal.type}, x=${newAnimal.x}, size=${newAnimal.size}) - overlaps with y=0`);
        }
        return !hasOverlap;
      });
      console.log(`  ✅ Filtered animals: ${filteredNextAnimals.length}/${animalsToAdd.length}`);

      updated = [...filteredNextAnimals, ...updated];

      // Step 3: Apply gravity
      updated = applyGravity(updated);

      // Step 4 & 5: Loop until no rows can be cleared
      executeClearingLoop(updated, (clearedAnimals) => {
        // Game over check happens after clearing loop
        if (checkGameOver(clearedAnimals)) {
          setGameOver(true);
        }
      });

      return updated;
    });
  }, [turn, nextAnimals, executeClearingLoop]);

  const moveSelectedAnimal = useCallback((animalId, newX, onMoveComplete) => {
    if (!canMoveAnimal(animals, animalId, newX)) {
      return;
    }

    // Step 1: Move animal
    let updated = moveAnimal(animals, animalId, newX);

    // Step 2: Apply gravity
    updated = applyGravity(updated);

    // Step 3-5: Loop until no rows can be cleared
    const currentPreviewAnimals = nextAnimals;
    executeClearingLoop(updated, (clearedAnimals) => {
      // After clearing loop completes
      setAnimals(clearedAnimals);

      // Step 6: Check game over
      if (checkGameOver(clearedAnimals)) {
        setGameOver(true);
        return;
      }

      // Step 7: Start new turn (increment turn and generate new animals)
      console.log(`🔄 Turn increment: ${turn} → ${turn + 1}`);
      setTurn(prev => prev + 1);
      const newNextAnimals = generateAnimalsForTurn(turn + 2, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []);
      console.log(`📋 Updated nextAnimals:`, newNextAnimals.map(a => `#${a.id}(${a.type})`).join(', '));
      setNextAnimals(newNextAnimals);

      if (onMoveComplete) onMoveComplete(currentPreviewAnimals);  // Pass CURRENT preview animals
    });
  }, [animals, turn, nextAnimals, executeClearingLoop]);

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
        // Initial animals form filled rows, clear them using clearing loop
        executeClearingLoop(animals, (clearedAnimals) => {
          setTurn(1); // Move to turn 1 after clearing
          setNextAnimals(generateAnimalsForTurn(2, DIFFICULTY_LEVELS[gameConfig.difficulty].animalsPerTurn, gameConfig.gridWidth, []));
        });
      }
    }
  }, [turn, animals.length, clearingRows.length, gameConfig, executeClearingLoop]);

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
