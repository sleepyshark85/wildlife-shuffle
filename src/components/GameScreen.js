import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameGrid from './GameGrid';
import GamePreview from './GamePreview';
import StatsPanel from './StatsPanel';
import { useGameStore } from '../data/gameStore';

const BASE_CELL_SIZE = 32;

export default function GameScreen({ config, onBackToSettings }) {
  const { width: screenWidth } = useWindowDimensions();
  const [resumeSession, setResumeSession] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Load saved session from AsyncStorage on mount
  useEffect(() => {
    const loadSavedSession = async () => {
      try {
        const saved = await AsyncStorage.getItem('wildlife-shuffle-current-session');
        if (saved) {
          setResumeSession(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Error loading saved session:', error);
      } finally {
        setSessionLoaded(true);
      }
    };

    loadSavedSession();
  }, []);

  const store = useGameStore(config, resumeSession);

  // Calculate the exact container width needed for the grid
  const maxWidthCellSize = Math.floor((screenWidth - 32) / store.config.gridWidth);
  const CELL_SIZE = Math.max(24, maxWidthCellSize);
  const containerWidth = store.config.gridWidth * CELL_SIZE;
  const [waitingForPlayer, setWaitingForPlayer] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Game starts with initial animals, no auto-sequence yet
  useEffect(() => {
    setInitialized(true);
  }, []);

  // Log animal positions
  useEffect(() => {
    console.log(`\n=== TURN ${store.turn} (${store.animals.length} animals) ===`);
    store.animals.forEach(a => {
      console.log(`  Animal #${a.id} (${a.type}, size ${a.size}): Row ${a.y}, Col ${a.x}`);
    });
  }, [store.turn, store.animals]);

  const handleMoveAnimal = (animalId, newX) => {
    setWaitingForPlayer(false);
    const onMoveComplete = (nextAnimalsParam) => {
      store.executeTurnSequence(nextAnimalsParam);
      setWaitingForPlayer(true);
    };
    store.moveSelectedAnimal(animalId, newX, onMoveComplete);
  };

  const handleReset = async () => {
    try {
      // Clear saved session when starting a new game
      await AsyncStorage.removeItem('wildlife-shuffle-current-session');
    } catch (error) {
      console.error('Error clearing saved session:', error);
    }
    store.resetGame();
    setWaitingForPlayer(true);
  };

  if (store.gameOver) {
    const isNewHighScore = store.score > store.highScore;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gameOverContainer}>
          <Text style={styles.gameOverText}>Game Over!</Text>
          {isNewHighScore && <Text style={styles.newHighScoreText}>🎉 New High Score! 🎉</Text>}
          <View style={styles.gameOverStats}>
            <Text style={styles.gameOverStatLabel}>Turn:</Text>
            <Text style={styles.gameOverStatValue}>{store.turn}</Text>
            <Text style={styles.gameOverStatLabel}>Score:</Text>
            <Text style={styles.gameOverStatValue}>{store.score}</Text>
            <Text style={styles.gameOverStatLabel}>Best:</Text>
            <Text style={styles.gameOverStatValue}>{store.highScore}</Text>
          </View>
          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.resetButtonText}>Play Again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.settingsButton} onPress={onBackToSettings}>
            <Text style={styles.settingsButtonText}>⚙️ Settings</Text>
          </Pressable>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>Wildlife Shuffle</Text>
            <Text style={styles.turnText}>Turn: {store.turn}</Text>
          </View>
          <Pressable style={styles.settingsButton} onPress={() => setShowStats(true)}>
            <Text style={styles.settingsButtonText}>📊 Stats</Text>
          </Pressable>
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>Score: {store.score}</Text>
          <Text style={styles.statText}>Best: {store.highScore}</Text>
        </View>
      </View>

      <View style={[styles.gameContainer, { width: containerWidth, alignSelf: 'center' }]}>
        <View style={styles.gridWrapper}>
          <GameGrid
            animals={store.animals}
            clearingRows={store.clearingRows}
            onMoveAnimal={handleMoveAnimal}
            gridWidth={store.config.gridWidth}
            gridHeight={store.config.gridHeight}
          />
        </View>
        <GamePreview nextAnimals={store.nextAnimals} gridWidth={store.config.gridWidth} gridHeight={store.config.gridHeight} />
      </View>

      {showStats && (
        <StatsPanel
          stats={store.stats}
          sessionHistory={store.sessionHistory}
          onClose={() => setShowStats(false)}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f8',
  },
  header: {
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 2,
    borderBottomColor: '#0f3460',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f3460',
  },
  titleContainer: {
    alignItems: 'center',
  },
  settingsButton: {
    width: 50,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  settingsButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f3460',
  },
  gameContainer: {
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    paddingVertical: 12,
  },
  gridWrapper: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0f3460',
    letterSpacing: -0.5,
  },
  turnText: {
    fontSize: 16,
    color: '#4da6ff',
    marginTop: 6,
    fontWeight: '600',
  },
  footer: {
    padding: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  instructions: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    fontWeight: '400',
  },
  gameOverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f8',
  },
  gameOverText: {
    fontSize: 56,
    fontWeight: '800',
    color: '#e74c3c',
    marginBottom: 20,
    letterSpacing: -1,
  },
  newHighScoreText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f39c12',
    marginBottom: 20,
  },
  gameOverStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 40,
    gap: 12,
  },
  gameOverStatLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f3460',
  },
  gameOverStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4da6ff',
  },
  scoreText: {
    fontSize: 26,
    color: '#0f3460',
    marginBottom: 40,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
