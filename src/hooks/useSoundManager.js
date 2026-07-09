import { useCallback } from 'react';

let Haptics = null;
try {
  Haptics = require('expo-haptics');
} catch (e) {
  // expo-haptics not installed yet
}

// Use Haptic feedback for iOS - provides tactile feedback for game events
export function useSoundManager() {
  const playSound = useCallback((type = 'clear') => {
    if (!Haptics) return; // Silently skip if not available

    try {
      if (type === 'clear') {
        // Light haptic for row clear
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (type === 'highscore') {
        // Heavy haptic for high score celebration
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        // Double tap for extra celebration
        setTimeout(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 100);
      } else if (type === 'spawn') {
        // Subtle haptic for new animals
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else if (type === 'gameover') {
        // Medium haptic pattern for game over
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      console.error('Haptic feedback error:', error);
      // Silently fail - haptics not available on all devices
    }
  }, []);

  return { playSound };
}
