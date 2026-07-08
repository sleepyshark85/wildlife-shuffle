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
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  titleContainer: {
    alignItems: 'center',
  },
  settingsButton: {
    width: 50,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4c6ef5',
  },
  gameContainer: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  gridWrapper: {
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  turnText: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  footer: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  gameOverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameOverText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 16,
  },
  scoreText: {
    fontSize: 24,
    color: '#666',
    marginBottom: 32,
  },
  resetButton: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
