# Wildlife Shuffle Game - Specification

## Overview
Wildlife Shuffle is a turn-based puzzle game where animals scroll upward on a grid. Players drag animals horizontally to reposition them, and complete rows disappear when filled. The game ends when any animal reaches the top row.

---

## Game Architecture

### Grid System
- **Dimensions**: 10 columns × 20 rows
- **Row Numbering**: Row 0 (bottom) to Row 19 (top)
- **Column Numbering**: Column 0 (left) to Column 9 (right)
- **New Row Spawn**: Row 0 (bottom)
- **Grid Advancement**: Each turn, all rows advance upward by 1 (Row 0→1, Row 1→2, etc.)

### Animal Types & Sizes
Animals take up multiple consecutive columns based on their size:
- **Elephant**: Size 5 columns
- **Buffalo**: Size 4 columns
- **Elk**: Size 3 columns
- **Fox**: Size 2 columns
- **Rat**: Size 1 column

---

## Game Mechanics

### Turn Structure
Each turn follows this sequence:

**Automated Steps (1-5): Initial Setup**
1. Grid advancement - all rows shift upward by 1 (every animal's y increases by 1)
   - **Animation timing**: Completes immediately, then 300ms delay before next step
2. New animals added at Row 0 (bottom) based on spawning rules
   - **Spawn Row Collision Detection**: New animals are checked against existing animals at y=0
   - If a new animal would overlap with an existing animal at y=0, that animal is filtered out and not added
   - Only non-overlapping animals from the generated batch are added to the grid
3. Gravity applied - animals fall to lowest non-colliding positions
4. Row clearing with chain clearing support - completely filled rows are checked and processed:
   - Rows without buffalo: completely removed, empty rows added at top
   - Rows with buffalo: all non-buffalo animals removed, buffalo size reduced by 1 (min size 1)
   - Animation: filled rows flash for 1200ms
   - **Chain clearing**: After gravity is applied, system checks if new rows are now filled
   - If more rows are filled, repeat steps 4-5 until no more rows can be cleared
5. Gravity applied again if any rows were cleared in step 4

**Player Action (Step 6)**
6. Player drags an animal horizontally to a new position within the same row

**Automated Steps (7-10): After Player Move**
7. Gravity applied - animals fall after move
8. Row clearing - same as step 4:
   - Rows without buffalo: removed with empty rows added at top
   - Rows with buffalo: non-buffalo animals removed, buffalo size reduced by 1
9. Game over check - if any animal is at Row 19, game ends
10. Turn counter increments, prepare for next turn

### Animal Spawning Rules
- **Random Animals**: Each turn (except every 10th), a random animal spawns in a random column
- **Buffalo**: 
  - Appears every 10 turns (turns 10, 20, 30, etc.; does NOT appear at turn 0)
  - **Only one buffalo can spawn per batch** (even if multiple animals spawn that turn)
  - If a buffalo would be generated and one was already added to the batch, regenerate to get a different animal
- **Bounds Checking**: Animals cannot spawn outside the grid bounds (accounting for their size)
- **Batch Collision Prevention**: Multiple animals in same batch cannot overlap with each other at generation time
- **Spawn Row Collision Filtering**: If a generated animal would overlap with an existing animal at y=0, it is filtered out and not added to the grid

### Movement Mechanics
- **Drag and Drop**: Players click and hold on an animal, then drag left/right and release
- **Horizontal Movement**: Animals can only move horizontally within the same row during a drag
- **Bounds Enforcement**: Animals cannot move beyond grid boundaries
- **Collision Detection**: Animals cannot overlap with other animals
- **No Movement Case**: If drag distance is 0, animal stays in place and no turn is triggered

### Gravity System
- **Timing**: Gravity is applied at 3 points each turn:
  1. After new row is added (step 3)
  2. After player moves an animal (step 7)
  3. After row clearing if it occurs (steps 5 and 8)
- **Direction**: Downward only (toward Row 0)
- **Behavior**: Each animal falls to the lowest available row where it doesn't collide with other animals
- **No Horizontal Movement**: Gravity only moves animals downward, never left or right
- **Processing Order**: Animals are processed bottom-to-top (low y to high y) so lower animals settle first

### Row Clearing System
- **Trigger**: When a row is completely filled (all columns occupied)
- **Animation**: Filled rows flash yellow/orange for 1200ms
- **Clearing Process**:
  1. Identify all filled rows
  2. Display flashing animation for 1200ms
  3. Remove non-buffalo animals from cleared rows
  4. Shrink any buffalo in cleared rows (size reduced by 1, minimum 1)
  5. Apply gravity once to handle all movement
  6. **Chain Clearing Check**: Check if new rows are now filled after gravity
  7. If more filled rows exist, repeat process from step 2 for those rows
  8. Continue until no more rows can be filled (prevents cascading rows from being missed)
- **Buffalo Mechanic** (Special Rule):
  - If a buffalo exists in a cleared row: **buffalo shrinks by 1**
  - All other animals in that row disappear
  - Buffalo continues shrinking with each row clearing: 4 → 3 → 2 → 1 → 0 (disappears)
  - Example: Buffalo (size 4) → Buffalo (size 3) → ... → Buffalo (size 1) → disappears
- **Multiple Rows**: Multiple rows can be cleared simultaneously in initial check
- **Cascade Effect**: Clearing rows and applying gravity can cause new rows to become filled
- **Timing**: Each clearing animation takes 1200ms, chain clears repeat this timing

### Auto-Turn When Grid Clears
- **Trigger**: All animals are removed from the grid (grid becomes completely empty)
- **Action**: Automatically execute the next turn to spawn new animals
- **Delay**: 300ms delay to allow animations to complete
- **Result**: Player continues playing seamlessly without manual input needed

### Game Over Condition
- **Trigger**: Any animal occupies Row 19 (top) at the end of a turn
- **Result**: Game ends, player can restart

---

## Data Model

### Animal Object
```
{
  id: number (unique identifier),
  type: string (elephant|buffalo|elk|fox|rat),
  x: number (column position, 0-9),
  y: number (row position, 0-19),
  size: number (how many cells of the row the animal occupies)
}
```
- **Position**: Each animal maintains its own x (column) and y (row) coordinates
- **Occupancy**: An animal occupies cells from x to (x + size - 1) in row y

### Grid Structure
```
grid: Array of Animal objects
Each animal object contains its position (x, y) and properties
```
- **Storage**: Animals are tracked as a collection with their own position properties
- **Occupancy**: Cells occupied by an animal are calculated from x, y, and size properties

---

## UI/UX Requirements

### Game Screen Layout
- **Header**: Game title and current turn counter
- **Game Grid**: Visual representation of the 20×10 grid with Row 0 at bottom, Row 19 at top
- **Preview Row**: Next incoming animal shown aligned below grid, indicating Row 0 (where it will spawn)
- **Footer**: Game instructions and controls

### Visual Feedback
- **Selected Animal**: Highlighted with blue border and increased opacity during drag
- **Drag Preview**: Shows where animal will land when released
- **Original Position Ghost**: Bright orange dashed outline shows original position while dragging, making it easy to cancel or adjust moves
- **Drop Animation**: Animals animate smoothly (scale + shadow effect) when falling due to gravity
- **Row Clearing**: Rows flash yellow/gray for 1200ms before disappearing
- **Grid Layout**: Background cells clearly visible to show column/row positions
- **Smooth Transitions**: All movement is animated for visual continuity

### Interaction States
- **Default**: All animals clickable, grid visible
- **Dragging**: Animal shows grab cursor, preview position shown
- **Clearing**: Rows flash, no input accepted
- **Game Over**: Display game over screen with turn count and restart button

---

## Game Flow

### Initialization
1. Create 20×10 empty grid
2. Generate first animals and place at Row 0
3. **Auto-Clear Check**: If initial animals form any filled rows:
   - Display clearing animation (1200ms)
   - Clear the rows and apply chain clearing
   - Automatically advance to Turn 1 (player cannot interact with immediately-cleared animals)
4. Generate preview for next row
5. Display Turn 0 (or Turn 1 if initial clear occurred)

See **Turn Structure** under Game Mechanics for the step-by-step sequence of each turn.

---

## Collision & Validation Rules

### Movement Validation
- Animal cannot move beyond left edge (x < 0)
- Animal cannot move beyond right edge (x + size > 10)
- Animal cannot overlap with other animals in same row
- If collision detected, move is rejected (animal stays in original position)

### New Row Validation
- All animals in new row must fit within bounds (accounting for animal size)
- Cannot spawn outside grid boundaries
- **Spawn Row Collision Detection**: New animals are checked against existing animals already at Row 0
  - If a new animal would overlap with an existing animal at y=0, it is filtered out and not added
  - Only non-overlapping animals are allowed to spawn

### Gravity Validation
- Animals cannot fall through other animals
- Animals stop at their lowest non-colliding position
- Bottom-most animals stay at their current position

---

## Version Tracking

### V1 (Initial Implementation - Archived)
- First working version with 2D grid array storage
- Basic drag-and-drop mechanics
- Core game loop implementation

### V2 (Current Implementation - Feature Complete)

**Core Mechanics**
- ✅ Direct x/y coordinate model for animals (cleaner, more flexible data structure)
- ✅ Proper turn sequence implementation (all 10 steps)
- ✅ Full specification implementation with all rules enforced

**Configuration System**
- ✅ Settings menu to customize game before starting
- ✅ Grid width (5-15 columns, default 10)
- ✅ Grid height (10-25 rows, default 20)
- ✅ Difficulty levels (Easy, Normal, Hard)
- ✅ Multiple animals per turn based on difficulty
  - Easy: 1 animal/turn
  - Normal: ~1.5 animals/turn (1-2)
  - Hard: 2 animals/turn
- ✅ Settings button in-game to return and reconfigure

**Collision & Bounds System**
- ✅ Strict bounds checking for all animals (prevents overflow)
- ✅ Collision detection between animals in same row
- ✅ Collision detection within animal batches (multiple animals per turn)
- ✅ Animals regenerated if they violate bounds or collide

**Gravity System**
- ✅ Bottom-to-top processing (prevents blocking)
- ✅ Applied at 3 points: after new row add, after player move, after row clear
- ✅ Proper position updates with grid dimension awareness

**Animations & Visual Feedback**
- ✅ Drop animation (scale + shadow) when animals fall
- ✅ Row clearing flash animation (1200ms with 8 cycles)
- ✅ Drag preview showing destination
- ✅ Blue highlight when animal selected
- ✅ Smooth transitions without artificial delays

**Game Flow**
- ✅ Initialize with one animal at Row 0
- ✅ Wait for player input (no auto-sequence at start)
- ✅ Player makes first move, then turn sequence begins
- ✅ All rows checked and cleared if filled
- ✅ Proper game over detection at Row 19

### V2.1 (Gameplay & Visual Polish - Current)

**Gameplay Enhancements**
- ✅ Sequential turn effects: Grid advancement, animal spawning, and gravity now happen with 300ms delays between steps for better visual feedback
- ✅ Collision-based filtering: Generated animals are checked against existing animals at y=0; overlapping animals are filtered out rather than repositioned
- ✅ Chain clearing system: Row clearing loops until no more rows can be cleared after gravity is applied
  - Prevents missed rows when clearing causes cascading fills
  - Each chain iteration shows clearing animation (1200ms)
- ✅ Auto-clear initial spawn: If turn 0 animals immediately form filled rows, they are automatically cleared and game advances to turn 1

**Animal Balance Changes**
- ✅ Elephant: Increased from size 4 to size 5 (larger, harder to place)
- ✅ Buffalo: Decreased from size 5 to size 4 (more manageable, appears less threatening)

**Visual Design Updates**
- ✅ Flat design aesthetic: Removed all shadows and elevation effects for cleaner look
- ✅ Minimal grid lines: Reduced opacity and thickness of cell dividers for less visual clutter
- ✅ Solid animal colors: Changed from semi-transparent to solid blue backgrounds for animals
- ✅ Unified container: Grid and preview row styled as single flat element without visual separation
- ✅ Removed footer instructions: Footer text removed to prevent blocking game view

**UI/UX Improvements**
- ✅ Better space utilization: More vertical space available for gameplay with compact header/controls
- ✅ Cleaner aesthetic: Flat design matches modern mobile game UI patterns
- ✅ Reduced visual noise: Minimal borders and shadows improve focus on gameplay

### V3 (Planned Enhancements)
- Sound effects and background music
- Score system and high scores
- Game statistics and progress tracking
- Mobile touch controls optimization
- Visual effects for special events
- Save game settings preferences
- Leaderboards per configuration
