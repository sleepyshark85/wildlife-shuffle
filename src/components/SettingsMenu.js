import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import { DIFFICULTY_LEVELS, DEFAULT_CONFIG, GRID_CONSTRAINTS } from '../data/gameConfig';

export default function SettingsMenu({ onStartGame }) {
  const [gridWidth, setGridWidth] = useState(DEFAULT_CONFIG.gridWidth);
  const [gridHeight, setGridHeight] = useState(DEFAULT_CONFIG.gridHeight);
  const [difficulty, setDifficulty] = useState(DEFAULT_CONFIG.difficulty);

  const handleStartGame = () => {
    onStartGame({ gridWidth, gridHeight, difficulty });
  };

  const handleWidthChange = (delta) => {
    const newWidth = gridWidth + delta;
    if (newWidth >= GRID_CONSTRAINTS.minWidth && newWidth <= GRID_CONSTRAINTS.maxWidth) {
      setGridWidth(newWidth);
    }
  };

  const handleHeightChange = (delta) => {
    const newHeight = gridHeight + delta;
    if (newHeight >= GRID_CONSTRAINTS.minHeight && newHeight <= GRID_CONSTRAINTS.maxHeight) {
      setGridHeight(newHeight);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Wildlife Shuffle</Text>
          <Text style={styles.subtitle}>Game Settings</Text>
        </View>

        {/* Grid Width Setting */}
        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Grid Width: {gridWidth}</Text>
          <Text style={styles.settingDescription}>
            Range: {GRID_CONSTRAINTS.minWidth} - {GRID_CONSTRAINTS.maxWidth}
          </Text>
          <View style={styles.controlRow}>
            <Pressable
              style={[styles.button, styles.buttonMinus]}
              onPress={() => handleWidthChange(-1)}
            >
              <Text style={styles.buttonText}>−</Text>
            </Pressable>
            <View style={styles.valueDisplay}>
              <Text style={styles.valueText}>{gridWidth}</Text>
            </View>
            <Pressable
              style={[styles.button, styles.buttonPlus]}
              onPress={() => handleWidthChange(1)}
            >
              <Text style={styles.buttonText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Grid Height Setting */}
        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Grid Height: {gridHeight}</Text>
          <Text style={styles.settingDescription}>
            Range: {GRID_CONSTRAINTS.minHeight} - {GRID_CONSTRAINTS.maxHeight}
          </Text>
          <View style={styles.controlRow}>
            <Pressable
              style={[styles.button, styles.buttonMinus]}
              onPress={() => handleHeightChange(-1)}
            >
              <Text style={styles.buttonText}>−</Text>
            </Pressable>
            <View style={styles.valueDisplay}>
              <Text style={styles.valueText}>{gridHeight}</Text>
            </View>
            <Pressable
              style={[styles.button, styles.buttonPlus]}
              onPress={() => handleHeightChange(1)}
            >
              <Text style={styles.buttonText}>+</Text>
            </Pressable>
          </View>
        </View>

        {/* Difficulty Setting */}
        <View style={styles.settingGroup}>
          <Text style={styles.settingLabel}>Difficulty Level</Text>
          <Text style={styles.settingDescription}>
            {DIFFICULTY_LEVELS[difficulty].label} - {DIFFICULTY_LEVELS[difficulty].animalsPerTurn} animal(s) per turn
          </Text>
          <View style={styles.difficultyButtons}>
            {Object.entries(DIFFICULTY_LEVELS).map(([key, value]) => (
              <Pressable
                key={key}
                style={[
                  styles.difficultyButton,
                  difficulty === key && styles.difficultyButtonActive,
                ]}
                onPress={() => setDifficulty(key)}
              >
                <Text
                  style={[
                    styles.difficultyButtonText,
                    difficulty === key && styles.difficultyButtonTextActive,
                  ]}
                >
                  {value.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
  settingGroup: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#999',
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  button: {
    width: 50,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  buttonMinus: {
    borderColor: '#ff6b6b',
    backgroundColor: '#ffe0e0',
  },
  buttonPlus: {
    borderColor: '#51cf66',
    backgroundColor: '#e7f5e4',
  },
  buttonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  valueDisplay: {
    minWidth: 60,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  valueText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  difficultyButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  difficultyButtonActive: {
    borderColor: '#4c6ef5',
    backgroundColor: '#e7f0ff',
  },
  difficultyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  difficultyButtonTextActive: {
    color: '#4c6ef5',
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
