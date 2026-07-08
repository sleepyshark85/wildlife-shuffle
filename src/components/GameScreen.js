import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import GameGrid from './GameGrid';
import GamePreview from './GamePreview';
import { useGameStore } from '../data/gameStore';

export default function GameScreen({ config, onBackToSettings }) {
  const store = useGameStore(config);
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
    const onMoveComplete = () => {
      store.executeTurnSequence();
      setWaitingForPlayer(true);
    };
    store.moveSelectedAnimal(animalId, newX, onMoveComplete);
  };

  const handleReset = () => {
    store.resetGame();
    setWaitingForPlayer(true);
  };

  if (store.gameOver) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.gameOverContainer}>
          <Text style={styles.gameOverText}>Game Over!</Text>
          <Text style={styles.scoreText}>Turn: {store.turn}</Text>
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
          <View style={styles.settingsButton} />
        </View>
      </View>

      <View style={styles.gameContainer}>
        <View style={styles.gridWrapper}>
          <GameGrid
            animals={store.animals}
            clearingRows={store.clearingRows}
            onMoveAnimal={handleMoveAnimal}
            gridWidth={store.config.gridWidth}
            gridHeight={store.config.gridHeight}
          />
        </View>
        <GamePreview nextAnimals={store.nextAnimals} gridWidth={store.config.gridWidth} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.instructions}>
          Drag an animal left or right to move it. Complete rows to clear them!
        </Text>
      </View>
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
    width: '100%',
    backgroundColor: '#f0f4f8',
    alignItems: 'center',
    flex: 1,
  },
  gridWrapper: {
    width: '100%',
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
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 2,
    borderTopColor: '#0f3460',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  instructions: {
    fontSize: 14,
    color: '#0f3460',
    lineHeight: 20,
    fontWeight: '500',
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
