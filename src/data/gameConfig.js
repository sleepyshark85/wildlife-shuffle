// Game configuration defaults
export const DIFFICULTY_LEVELS = {
  easy: { label: 'Easy', animalsPerTurn: 1 },
  normal: { label: 'Normal', animalsPerTurn: 1.5 },
  hard: { label: 'Hard', animalsPerTurn: 2 },
};

export const DEFAULT_CONFIG = {
  gridWidth: 10,
  gridHeight: 20,
  difficulty: 'normal',
};

export const GRID_CONSTRAINTS = {
  minWidth: 5,
  maxWidth: 15,
  minHeight: 10,
  maxHeight: 25,
};

export function validateConfig(config) {
  return {
    gridWidth: Math.max(
      GRID_CONSTRAINTS.minWidth,
      Math.min(GRID_CONSTRAINTS.maxWidth, config.gridWidth || DEFAULT_CONFIG.gridWidth)
    ),
    gridHeight: Math.max(
      GRID_CONSTRAINTS.minHeight,
      Math.min(GRID_CONSTRAINTS.maxHeight, config.gridHeight || DEFAULT_CONFIG.gridHeight)
    ),
    difficulty: DIFFICULTY_LEVELS[config.difficulty] ? config.difficulty : DEFAULT_CONFIG.difficulty,
  };
}
