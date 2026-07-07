import React, { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import GameScreen from './src/components/GameScreen';
import SettingsMenu from './src/components/SettingsMenu';

export default function App() {
  const [gameConfig, setGameConfig] = useState(null);

  const handleStartGame = (config) => {
    setGameConfig(config);
  };

  const handleBackToSettings = () => {
    setGameConfig(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {gameConfig ? (
        <GameScreen config={gameConfig} onBackToSettings={handleBackToSettings} />
      ) : (
        <SettingsMenu onStartGame={handleStartGame} />
      )}
    </GestureHandlerRootView>
  );
}
