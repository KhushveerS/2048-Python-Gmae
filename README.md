## 2048 — Optimized Vanilla JS

Fast 2048 with precomputed move tables and minimal DOM updates.

### Features
- Precomputed row move tables (65,536 rows) for O(1) row/column moves
- Compact board: 4×4 exponents in a Uint8Array
- Minimal DOM updates using a single tiles layer
- rAF-batched rendering and short animations
- Keyboard + touch/swipe input
- Best score persisted in localStorage

### Run
Open `index.html` in any modern browser.

### Controls
- Arrow keys: move tiles
- Touch: swipe to move
- New Game button: reset

### Implementation Notes
- Rows are packed as 16-bit values; UP/DOWN reuse LEFT/RIGHT tables via column read/write.
- Score gain is computed during table lookup.
- Input is locked during the brief animation window to avoid double-processing.

Files: `index.html`, `styles.css`, `main.js`.


