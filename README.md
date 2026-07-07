# Animal Run - V2 (Complete Implementation)

A fully-featured, production-ready implementation of Animal Run with a complete configuration system and robust game mechanics.

## Key Features

### 🎮 Configurable Gameplay
- **Grid Customization**: Choose your grid size (5-15 width × 10-25 height)
- **Difficulty Levels**: Easy (1 animal/turn), Normal (~1.5), Hard (2 animals/turn)
- **Settings Menu**: Beautiful UI to configure before each game
- **In-Game Settings**: Change settings anytime via the ⚙️ button

### 🎯 Robust Game Logic
- **Strict Bounds Checking**: Animals always fit within grid
- **Collision Detection**: Animals never overlap with each other
- **Multi-Animal Batches**: Multiple animals can spawn together without collision
- **Full Turn Sequence**: All 10 steps of the spec implemented correctly
- **Smart Row Clearing**: Rows detected and cleared properly after any action
- **Auto-Turn on Clear**: Automatically spawns new animals when grid becomes completely empty

### ✨ Polish & Animation
- **Drop Animation**: Smooth scale + shadow effect when animals fall
- **Row Clearing**: 1200ms flash animation (8 cycles) before removal
- **Drag Preview**: Shows exactly where animal will land
- **Original Position Ghost**: Bright orange dashed outline shows starting position while dragging
- **Visual Feedback**: Selected animals highlighted in blue with grab cursor
- **No Artificial Delays**: Responsive game without waiting for animations

### 🔧 Technical Excellence
- **Dynamic Grid System**: All components respect configured dimensions
- **Grid-Aware Logic**: Game logic accepts and uses grid width/height
- **Collision Resolution**: Regenerates animals until valid position found
- **Gravity Processing**: Bottom-to-top order prevents blocking issues

## Coordinate System

- **Row 0** = Bottom of grid (where new animals spawn)
- **Row 19** = Top of grid (game ends if animal reaches here)
- **Animals naturally move upward** as each turn progresses
- **Columns 0-9** = Left to right

## Complete Feature List

### Configuration
✅ Grid width selection (5-15 columns)
✅ Grid height selection (10-25 rows)
✅ Difficulty level selection (Easy, Normal, Hard)
✅ Settings menu with intuitive controls
✅ In-game settings button to reconfigure

### Core Game Mechanics
✅ Full 10-step turn sequence per specification
✅ Proper grid advancement (rows shift up)
✅ Multiple animal spawning based on difficulty
✅ Strict bounds checking (animals fit in grid)
✅ Collision detection (animals don't overlap)
✅ Gravity system (bottom-to-top processing)
✅ Row clearing with animation
✅ Game over at Row 19

### Animal Management
✅ Direct x/y coordinate tracking
✅ Animal batch collision prevention
✅ Size-aware positioning
✅ Proper bounds validation on generation
✅ No overlapping animals at any time

### Buffalo Special Mechanic
✅ Buffalo only appears at turns 10, 20, 30 (never turn 0)
✅ Only one buffalo can spawn per batch (even in Hard difficulty with 2 animals)
✅ When buffalo is in a cleared row:
  - All other animals in that row disappear
  - Buffalo shrinks by 1 (continues until reaching size 0 and disappears)
  - Example: Buffalo (size 5) → Buffalo (size 4) → ... → disappears
✅ Creates strategic gameplay around buffalo placement
✅ Gravity applied once after clearing completes (smooth animation)

### Seamless Gameplay
✅ Auto-turn when entire grid is cleared
✅ Automatically spawns new animals after 300ms delay
✅ Allows continuous play without manual input between full clears
✅ Perfect for clearing out and restarting the puzzle

### User Interface
✅ Settings menu with visual sliders
✅ Game difficulty indicators
✅ Grid-aligned preview row
✅ Turn counter display
✅ Settings button in-game
✅ Game over screen with restart
✅ Responsive controls for all grid sizes

### Animations & Visual Feedback
✅ Drop animation (scale + shadow effect)
✅ Row clearing flash (8 cycles, 1200ms)
✅ Drag preview with destination indicator
✅ Original position ghost outline while dragging (bright orange dashed)
✅ Selected animal highlighting (blue border)
✅ Grab cursor on draggable animals
✅ Smooth transitions without artificial delays

## How to Run

```bash
# Install dependencies (if not already installed)
npm install

# Start Expo dev server
npm start

# Press 'w' for web or scan QR code for mobile
```

## Architecture

### Configuration (`src/data/gameConfig.js`)
- `DIFFICULTY_LEVELS` - Maps difficulty to animals-per-turn
- `DEFAULT_CONFIG` - Default settings (10×20 grid, normal difficulty)
- `GRID_CONSTRAINTS` - Min/max values for grid dimensions
- `validateConfig(config)` - Ensures config is within bounds

### Core Logic (`src/data/gameLogic.js`)
Pure game mechanics functions:
- `setGridDimensions(width, height)` - Update global grid size
- `generateAnimal(turn)` - Create animal with valid bounds and position
- `generateAnimalsForTurn(turn, count, width)` - Create multiple animals with collision prevention
- `advanceGrid(animals)` - Increment y for all animals (shift upward)
- `applyGravity(animals)` - Process bottom-to-top, fall animals to lowest safe row
- `getFilledRows(animals, width, height)` - Identify completely filled rows with bounds checking
- `clearFilledRows(animals, width, height)` - Remove filled rows with proper dimension handling
- `canMoveAnimal(animals, animalId, newX)` - Validate move (bounds, collision)
- `moveAnimal(animals, animalId, newX)` - Execute move
- `checkGameOver(animals)` - Check if any animal at Row 19

### Game State (`src/data/gameStore.js`)
React hook managing game state and turn logic:
- `useGameStore(config)` - Accept configuration and initialize game
- `executeTurnSequence()` - Runs steps 1-5 (advance, add, gravity, clear)
- `moveSelectedAnimal(animalId, newX, callback)` - Runs steps 6-10 (move, gravity, clear, game over, increment)
- State: animals, turn, gameOver, nextAnimals, clearingRows, config
- Dimension-aware logic respects grid configuration

### Components
- **SettingsMenu.js** - Configuration UI with sliders and difficulty buttons
- **GameScreen.js** - Game coordinator with settings button
- **GameGrid.js** - Dynamic grid rendering with configurable dimensions
- **Animal.js** - Individual animal with drop animation
- **GamePreview.js** - Preview row showing next incoming animals

## Complete Turn Sequence

**Steps 1-5** (executeTurnSequence - Automated Setup)
1. Grid advancement - all rows shift upward by 1
2. New animal added at Row 0
3. Gravity applied
4. Row clearing (if any)
5. Gravity applied again (if clearing happened)

**Step 6** (Player Input)
6. Player drags animal horizontally

**Steps 7-10** (moveSelectedAnimal - Post-Move)
7. Gravity applied after move
8. Row clearing (if any)
9. Game over check
10. Turn counter increments, next animal generated

## File Structure

```
v2/
├── src/
│   ├── components/
│   │   ├── GameScreen.js
│   │   ├── GameGrid.js
│   │   ├── Animal.js
│   │   ├── AnimalCell.js
│   │   └── GamePreview.js
│   └── data/
│       ├── gameLogic.js
│       └── gameStore.js
├── App.js
├── index.js
├── package.json
└── app.json
```

## How to Play

1. **Drag Animals**: Click and hold an animal, then drag left or right to move it horizontally
2. **Release**: Release the mouse to place the animal at the new position
3. **Turn Progression**: After moving, the turn automatically advances:
   - Grid shifts upward
   - New animal spawns at bottom (Row 0)
   - Gravity pulls animals down
   - Filled rows clear
4. **Objective**: Fill complete rows (all 10 columns) to clear them
5. **Game Over**: When any animal reaches the top (Row 19), the game ends

## Visual Layout

```
Row 19 ━━━━━━━━━━━━ (TOP - Game Over if animal reaches here)
  ⋮
  ⋮
Row 1  ━━━━━━━━━━━━
Row 0  ━━━━━━━━━━━━ (BOTTOM - Where new animals spawn)
```

## How to Play

1. **Start**: Game launches with Settings Menu
2. **Configure**: Choose grid size and difficulty
3. **Play**: 
   - Drag animals left/right to reposition
   - Animals fall due to gravity after moves
   - Complete rows automatically clear
4. **Settings**: Use ⚙️ button to reconfigure anytime
5. **Game Over**: Triggered when animal reaches top row

## Validation Checklist

✅ **Configuration System**
- Settings menu displays properly
- Grid width can be set (5-15)
- Grid height can be set (10-25)
- Difficulty levels work (Easy/Normal/Hard)
- Settings button works in-game

✅ **Game Logic**
- Animals spawn correctly with bounds checking
- Multiple animals per turn based on difficulty
- No overlapping animals in batches
- Collisions detected and prevented
- Gravity processes bottom-to-top correctly
- Rows detected and cleared when filled
- Game over triggers at Row 19

✅ **Visual Feedback**
- Drop animation visible when animals fall
- Row clearing flash animation (1200ms, 8 cycles)
- Drag preview shows destination
- Selected animals highlighted
- No artificial delays between actions

## Performance

- Smooth gameplay with no artificial delays except:
  - 1200ms row clearing animation (intentional for visibility)
  - Minimal delay for state updates
- Responsive drag-and-drop with real-time preview
- Configurable grid sizes don't impact performance
