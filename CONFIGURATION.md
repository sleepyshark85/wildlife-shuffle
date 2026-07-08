# Wildlife Shuffle - Configuration System

## Overview

The game is now fully configurable before starting. Players can customize:
1. **Grid Dimensions** (Width × Height)
2. **Difficulty Level** (Easy, Normal, Hard)

## Settings Menu

### Grid Width
- **Range**: 5 - 15 columns
- **Default**: 10
- **Impact**: Wider grids give more room to maneuver but are harder to fill rows

### Grid Height
- **Range**: 10 - 25 rows
- **Default**: 20
- **Impact**: Taller grids give more time before game over but take longer to fill rows

### Difficulty Levels

#### Easy
- **Animals per Turn**: 1
- **Gameplay**: Slower, more manageable pace
- **Best For**: Learning the game mechanics

#### Normal (Default)
- **Animals per Turn**: 1-2 (averages 1.5)
- **Gameplay**: Balanced challenge
- **Best For**: Standard gameplay

#### Hard
- **Animals per Turn**: 2
- **Gameplay**: Fast-paced, challenging
- **Best For**: Experienced players

## How It Works

### Multiple Animals Per Turn

When difficulty is set to Normal or Hard, **multiple animals can spawn in the same turn**:

1. Each animal is generated independently
2. Animals in the same batch are checked for collisions with each other
3. If overlap detected, that animal is regenerated
4. All animals spawn together at Row 0

**Example (Hard difficulty)**:
```
Turn 5: 2 animals spawn at Row 0
Turn 6: Player moves, 2 animals advance to Row 1
Turn 7: 2 new animals spawn, advancing creates Row 2
```

### Configuration Flow

1. **Game Start** → Settings Menu appears
2. **Customize Settings** → Adjust grid size and difficulty
3. **Start Game** → Game begins with your custom configuration
4. **During Game** → ⚙️ Settings button returns to settings menu
5. **New Game** → Configure different settings

## Configuration Data Structure

```javascript
{
  gridWidth: number (5-15),
  gridHeight: number (10-25),
  difficulty: string ('easy' | 'normal' | 'hard')
}
```

## Implementation Details

### Game Logic (`gameLogic.js`)
- `setGridDimensions(width, height)` - Sets global grid dimensions
- `generateAnimalsForTurn(turn, animalsPerTurn)` - Generates multiple animals
- Collision detection prevents overlapping animals in the same batch

### Game State (`gameStore.js`)
- Accepts `config` parameter in `useGameStore(config)`
- Validates config using `validateConfig()`
- Updates grid dimensions based on config
- Generates correct number of animals per turn

### UI Components
- **SettingsMenu** - Configuration interface with sliders and buttons
- **GameScreen** - Accepts config and displays game with "Settings" button
- **GameGrid** - Dynamically sized based on config
- **GamePreview** - Shows multiple incoming animals

## Constraints & Validation

- Grid dimensions are clamped to valid ranges
- Difficulty levels are validated against available types
- Multiple animals in same turn check for self-collisions
- Grid size affects rendering but not core game logic

## Auto-Turn Feature

When a player clears the entire grid (removes all animals), the game automatically executes the next turn to spawn new animals:
- **Trigger**: Grid becomes completely empty (0 animals remaining)
- **Delay**: 300ms to allow row clearing animations to complete
- **Action**: Automatically spawns the next batch of animals and executes turn sequence
- **Benefit**: Seamless gameplay without requiring player input after clearing entire grid

## Buffalo Mechanics (Game Rules)

### Spawning
- **When**: Every 10 turns starting at Turn 10 (turns 10, 20, 30, etc.)
- **Never at Turn 0**: First animal is always random (never buffalo)
- **Once per batch**: Only one buffalo can spawn in a single turn, even in Hard difficulty

### Row Clearing Interaction
When a buffalo is in a cleared (filled) row:
1. Buffalo size is reduced by 1
2. All other animals in that row disappear
3. Buffalo object is completely replaced with new resized instance
4. When buffalo size reaches 0, it disappears entirely
5. Gravity is applied once after clearing for smooth movement

**Example sequence:**
- Turn 10: Buffalo (size 5) spawns
- Turn X: Row with buffalo becomes completely filled
  - Clearing: Animation shows 1200ms flash
  - After animation: Buffalo shrinks to size 4, gravity applied
- Turn Y: Another row with buffalo becomes completely filled
  - Buffalo shrinks to size 3
- ... (repeats until buffalo reaches size 0)
- Final clearing: Buffalo disappears when shrunk from size 1 to 0

## Visual Feedback Features

### Drag Interactions
- **Drag Preview**: Shows where the animal will land (destination)
- **Original Position Ghost**: Bright orange dashed outline clearly marks the original position
- **Visual Clarity**: High-contrast orange dashed border makes it immediately obvious where the animal came from
- **Purpose**: Players can easily see both current and original positions, making it simple to:
  - Cancel moves by dragging back to original position
  - Fine-tune animal placement
  - Make confident positioning decisions with clear visual reference

## Future Enhancements

- Save/load preferences
- Custom difficulty creation
- Leaderboards per configuration
- Advanced settings (spawn rate, animation speed, etc.)
- Buffalo special abilities based on remaining size
