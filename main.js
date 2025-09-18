"use strict";

// Optimized 2048 implementation
// - Precomputed row move tables for all 4 moves using 16-bit rows
// - Bitboard-like 4x4 grid stored as Uint16 array of exponents (value = 1<<exp, 0 for empty)
// - Minimal DOM updates (diffing tiles container)
// - rAF batching and input lock during animations

(function(){
  const BOARD_SIZE = 4;
  const NUM_CELLS = BOARD_SIZE * BOARD_SIZE;
  const ANIM_MS = 120;

  // Game state
  let grid = new Uint8Array(NUM_CELLS); // stores exponents (0 means empty, 1->2, 2->4, ...)
  let score = 0;
  let best = Number(localStorage.getItem("best-2048-opt")) || 0;
  let isProcessing = false;

  // DOM refs
  const tilesEl = document.getElementById("tiles");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const newGameBtn = document.getElementById("newGame");

  // Precompute row moves for all possible 4-nibble rows (0..15 exponents each nibble)
  // Represent a row as 16-bit number with 4 nibbles (4 bits each) => 0..0xFFFF
  // moveTables[dir][row] = { row: newRow16, gained: scoreGained }
  const DIR = { LEFT:0, RIGHT:1, UP:2, DOWN:3 };
  /** @type {Array<Array<{row:number,gained:number}>>} */
  const moveTables = [new Array(65536), new Array(65536), new Array(65536), new Array(65536)];

  function buildRowTable(){
    for(let row=0; row<65536; row++){
      const a = (row >>> 12) & 0xF;
      const b = (row >>> 8) & 0xF;
      const c = (row >>> 4) & 0xF;
      const d = row & 0xF;
      const left = slideAndMerge([a,b,c,d]);
      const right = slideAndMerge([d,c,b,a]);
      moveTables[DIR.LEFT][row] = { row: packRow(left.cells), gained: left.gained };
      moveTables[DIR.RIGHT][row] = { row: packRow(right.cells.slice().reverse()), gained: right.gained };
    }
  }

  function slideAndMerge(exps){
    // Remove zeros
    const nonZero = exps.filter(x => x !== 0);
    let gained = 0;
    const merged = [];
    for(let i=0; i<nonZero.length; i++){
      if(i+1 < nonZero.length && nonZero[i] !== 0 && nonZero[i] === nonZero[i+1]){
        const newExp = nonZero[i] + 1;
        merged.push(newExp);
        gained += 1 << newExp; // 2^newExp
        i++; // skip next
      } else {
        merged.push(nonZero[i]);
      }
    }
    while(merged.length < 4) merged.push(0);
    return { cells: merged, gained };
  }

  function packRow(arr){ return (arr[0]<<12) | (arr[1]<<8) | (arr[2]<<4) | arr[3]; }
  function unpackRow(row){ return [(row>>>12)&0xF, (row>>>8)&0xF, (row>>>4)&0xF, row&0xF]; }

  function getRow(r){
    return packRow([grid[r*4], grid[r*4+1], grid[r*4+2], grid[r*4+3]]);
  }
  function setRow(r, packed){
    grid[r*4] = (packed>>>12)&0xF;
    grid[r*4+1] = (packed>>>8)&0xF;
    grid[r*4+2] = (packed>>>4)&0xF;
    grid[r*4+3] = packed & 0xF;
  }
  function getCol(c){
    return (grid[c]<<12) | (grid[4+c]<<8) | (grid[8+c]<<4) | grid[12+c];
  }
  function setCol(c, packed){
    grid[c] = (packed>>>12)&0xF;
    grid[4+c] = (packed>>>8)&0xF;
    grid[8+c] = (packed>>>4)&0xF;
    grid[12+c] = packed & 0xF;
  }

  function randomEmptyCellIndex(){
    const empties = [];
    for(let i=0;i<NUM_CELLS;i++) if(grid[i]===0) empties.push(i);
    if(empties.length===0) return -1;
    const idx = empties[(Math.random()*empties.length)|0];
    return idx;
  }

  function addRandomTile(){
    const idx = randomEmptyCellIndex();
    if(idx<0) return false;
    grid[idx] = Math.random() < 0.9 ? 1 : 2; // 2 or 4
    return true;
  }

  function canMove(){
    // If any empty cell exists
    for(let i=0;i<NUM_CELLS;i++) if(grid[i]===0) return true;
    // Check rows for merges
    for(let r=0;r<4;r++){
      const row = unpackRow(getRow(r));
      for(let i=0;i<3;i++) if(row[i]!==0 && row[i]===row[i+1]) return true;
    }
    // Check cols for merges
    for(let c=0;c<4;c++){
      const col = unpackRow(getCol(c));
      for(let i=0;i<3;i++) if(col[i]!==0 && col[i]===col[i+1]) return true;
    }
    return false;
  }

  function move(dir){
    let moved = false;
    let gained = 0;
    if(dir===DIR.LEFT){
      for(let r=0;r<4;r++){
        const row = getRow(r);
        const res = moveTables[DIR.LEFT][row];
        if(row!==res.row){ moved = true; setRow(r, res.row); }
        gained += res.gained;
      }
    } else if(dir===DIR.RIGHT){
      for(let r=0;r<4;r++){
        const row = getRow(r);
        const res = moveTables[DIR.RIGHT][row];
        if(row!==res.row){ moved = true; setRow(r, res.row); }
        gained += res.gained;
      }
    } else if(dir===DIR.UP){
      for(let c=0;c<4;c++){
        const col = getCol(c);
        const res = moveTables[DIR.LEFT][col];
        if(col!==res.row){ moved = true; setCol(c, res.row); }
        gained += res.gained;
      }
    } else if(dir===DIR.DOWN){
      for(let c=0;c<4;c++){
        const col = getCol(c);
        const res = moveTables[DIR.RIGHT][col];
        if(col!==res.row){ moved = true; setCol(c, res.row); }
        gained += res.gained;
      }
    }
    if(moved){
      score += gained;
      if(score>best){ best=score; localStorage.setItem("best-2048-opt", String(best)); }
      addRandomTile();
    }
    return moved;
  }

  // Rendering
  function render(){
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);

    // Build desired DOM structure
    const frag = document.createDocumentFragment();
    for(let i=0;i<NUM_CELLS;i++){
      const exp = grid[i];
      if(exp===0) continue;
      const tile = document.createElement("div");
      tile.className = "tile new x" + (1<<exp);
      tile.textContent = String(1<<exp);
      tile.style.gridArea = `${Math.floor(i/4)+1} / ${i%4+1}`;
      frag.appendChild(tile);
    }
    // Diff replace: replace children in one go for simplicity and speed
    tilesEl.replaceChildren(frag);
  }

  function reset(){
    grid.fill(0);
    score = 0;
    addRandomTile();
    addRandomTile();
    render();
  }

  // Input handling
  function onKey(e){
    if(isProcessing) return;
    let dir = -1;
    switch(e.key){
      case "ArrowLeft": dir = DIR.LEFT; break;
      case "ArrowRight": dir = DIR.RIGHT; break;
      case "ArrowUp": dir = DIR.UP; break;
      case "ArrowDown": dir = DIR.DOWN; break;
      default: return;
    }
    e.preventDefault();
    queueMove(dir);
  }

  let touchStartX=0, touchStartY=0, touchId=null;
  function onTouchStart(e){
    if(isProcessing) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchStartX = t.clientX; touchStartY = t.clientY;
  }
  function onTouchEnd(e){
    if(isProcessing) return;
    let t=null;
    for(const tt of e.changedTouches){ if(tt.identifier===touchId){ t=tt; break; } }
    if(!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absx = Math.abs(dx), absy = Math.abs(dy);
    if(Math.max(absx,absy) < 24) return;
    let dir;
    if(absx>absy) dir = dx>0 ? DIR.RIGHT : DIR.LEFT;
    else dir = dy>0 ? DIR.DOWN : DIR.UP;
    queueMove(dir);
  }

  function queueMove(dir){
    if(isProcessing) return;
    isProcessing = true;
    let moved = false;
    // Compute immediately, render in rAF for smoothness
    moved = move(dir);
    window.requestAnimationFrame(() => {
      render();
      window.setTimeout(() => {
        isProcessing = false;
        if(!canMove()){
          // Simple game over: restart
          alert("Game Over! Starting a new game.");
          reset();
        }
      }, ANIM_MS);
    });
  }

  // Init
  buildRowTable();
  reset();
  document.addEventListener("keydown", onKey, { passive:false });
  document.addEventListener("touchstart", onTouchStart, { passive:true });
  document.addEventListener("touchend", onTouchEnd, { passive:true });
  newGameBtn.addEventListener("click", () => { if(!isProcessing){ reset(); } });
})();


