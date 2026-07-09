import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';

export default function StatsPanel({ stats, sessionHistory, onClose }) {
  const averageScore = stats.totalGames > 0 ? Math.round(stats.totalScore / stats.totalGames) : 0;
  const averageTurns = stats.totalGames > 0 ? Math.round(stats.totalTurns / stats.totalGames) : 0;

  return (
    <View style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>Statistics</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Games Played</Text>
              <Text style={styles.statValue}>{stats.totalGames}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Score</Text>
              <Text style={styles.statValue}>{stats.totalScore}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Avg Score/Game</Text>
              <Text style={styles.statValue}>{averageScore}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Best Turn Count</Text>
              <Text style={styles.statValue}>{stats.bestTurnCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Avg Turns/Game</Text>
              <Text style={styles.statValue}>{averageTurns}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Turns</Text>
              <Text style={styles.statValue}>{stats.totalTurns}</Text>
            </View>
          </View>

          {sessionHistory && sessionHistory.length > 0 && (
            <View style={styles.historySection}>
              <Text style={styles.historyTitle}>Recent Sessions</Text>
              {sessionHistory.slice(0, 10).map((session, idx) => (
                <View key={idx} style={styles.historyItem}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyDifficulty}>{session.config.difficulty}</Text>
                    <Text style={styles.historyDate}>
                      {new Date(session.timestamp).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.historyStats}>
                    <Text style={styles.historyScore}>{session.score} pts</Text>
                    <Text style={styles.historyTurns}>{session.turn} turns</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    backgroundColor: '#f0f4f8',
    borderRadius: 12,
    width: '85%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#0f3460',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f3460',
  },
  closeButton: {
    fontSize: 28,
    color: '#0f3460',
  },
  content: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4da6ff',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f3460',
  },
  historySection: {
    marginTop: 12,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f3460',
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4da6ff',
  },
  historyInfo: {
    flex: 1,
  },
  historyDifficulty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f3460',
    textTransform: 'capitalize',
  },
  historyDate: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  historyStats: {
    flexDirection: 'row',
    gap: 12,
  },
  historyScore: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4da6ff',
  },
  historyTurns: {
    fontSize: 12,
    color: '#888',
  },
});
