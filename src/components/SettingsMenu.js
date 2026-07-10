import React from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { DIFFICULTY_LEVELS, DEFAULT_CONFIG } from '../data/gameConfig';

export default function SettingsMenu({ onStartGame }) {
  const handleStartGame = () => {
    onStartGame({
      gridWidth: DEFAULT_CONFIG.gridWidth,
      gridHeight: DEFAULT_CONFIG.gridHeight,
      difficulty: DEFAULT_CONFIG.difficulty
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Wildlife Shuffle</Text>
          <Text style={styles.subtitle}>A Puzzle Game</Text>
        </View>

        {/* Start Button */}
        <Pressable style={styles.startButton} onPress={handleStartGame}>
          <Text style={styles.startButtonText}>Start Game</Text>
        </Pressable>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Game Info</Text>
          <Text style={styles.infoText}>
            • Drag animals left/right to move them
          </Text>
          <Text style={styles.infoText}>
            • Fill complete rows to clear them
          </Text>
          <Text style={styles.infoText}>
            • Game ends when any animal reaches the top row
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
  },
  startButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    paddingVertical: 16,
    marginVertical: 24,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#e7f5ff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4c6ef5',
    marginBottom: 32,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4c6ef5',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#1971c2',
    lineHeight: 20,
  },
});
