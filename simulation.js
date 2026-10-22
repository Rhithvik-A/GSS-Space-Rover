// ============================================================
//  GSS ENCELADUS ROVER – 2D SIMULATION ENGINE
//  Fog-of-war mapping with craters, boulders, hills, bumps,
//  ice ridges, plume vents, dock, and smart rover avoidance
//  Colors: Enceladus-accurate icy whites, pale blues, cyans
// ============================================================

const SimEngine = (() => {

  // ---- Constants ----
  const TILE = 16;
  const MAP_COLS = 64;
  const MAP_ROWS = 48;
  const W = MAP_COLS * TILE;
  const H = MAP_ROWS * TILE;

  const FOG_HIDDEN = 0;
  const FOG_PARTIAL = 1;
  const FOG_REVEALED = 2;
  const REVEAL_RADIUS = 5;
  const PARTIAL_RADIUS = 8;

  // Tile types
  const T_EMPTY = 0;
  const T_CRATER = 1;
  const T_BOULDER = 2;     // impassable
  const T_ICE_CRACK = 3;
  const T_PLUME_VENT = 4;
  const T_DOCK = 5;
  const T_HILL = 6;        // impassable — elevated terrain
  const T_BUMP = 7;        // passable but rough — slows rover
  const T_ICE_RIDGE = 8;   // impassable — sharp raised ice
  const T_DEEP_CRATER = 9; // impassable — too deep

  // ---- State ----
  let canvas, ctx;
  let map = [];
  let fog = [];
  let rover = { col: 3, row: 3, dir: 0, trail: [] };
  let dockPos = { col: 2, row: 2 };
  let autoMode = false;
  let autoTimer = null;
  let speed = 120;
  let exploredCount = 0;
  let totalTiles = MAP_COLS * MAP_ROWS;
  let distanceTraveled = 0;
  let obstaclesDetected = 0;
  let bumpsHit = 0;
  let callbacks = {};

  // Direction deltas: right, down, left, up
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const DIR_ARROWS = ['→', '↓', '←', '↑'];

  const IMPASSABLE = new Set([T_BOULDER, T_HILL, T_ICE_RIDGE, T_DEEP_CRATER]);

  const COLORS = {
    fog:            '#04060c',
    fogPartial:     'rgba(4, 6, 12, 0.65)',
    ground:         '#c8d8e8',
    groundAlt:      '#bfd0e2',
    groundDark:     '#a8bcd4',
    crater:         '#8a9cb8',
    craterRim:      '#d4e0ee',
    craterShadow:   '#6a7e9a',
    deepCrater:     '#4a5c78',
    deepCraterRim:  '#7a90aa',
    boulder:        '#6e7f98',
    boulderHi:      '#8e9fb8',
    boulderShadow:  '#4e5f78',

    // Hills — elevated bright ice mounds
    hill:           '#dce8f4',
    hillShadow:     '#a0b4cc',
    hillTop:        '#eef4fa',

    // Bumps — small rough terrain patches
    bump:           '#b0c4dc',
    bumpDot:        '#90a8c4',

    // Ice ridges — sharp raised features
    iceRidge:       '#d0ddef',
    iceRidgeShadow: '#7a90a8',
    iceRidgeEdge:   '#e8f0fa',

    // Ice cracks — tiger-stripe fractures
    iceCrack:       '#5a8aaa',
    iceCrackGlow:   'rgba(80, 160, 210, 0.25)',
    iceCrackDeep:   '#3a6a8a',

    // Plume vents — active geysers
    plumeVent:      '#7ab0d0',
    plumeGlow:      'rgba(140, 210, 240, 0.3)',
    plumeParticle:  'rgba(200, 230, 255, 0.5)',

    // Dock
    dock:           '#a0c8a0',
    dockBorder:     '#60b880',

    // Rover
    rover:          '#00aadd',
    roverBody:      '#1a3050',
    roverGlow:      'rgba(0, 170, 220, 0.2)',

    // Trail
    trail:          'rgba(0, 150, 200, 0.12)',
    trailDot:       'rgba(0, 150, 200, 0.3)',

    // Grid
    gridLine:       'rgba(0, 0, 0, 0.04)',
  };

  // ---- Init ----
  function init(canvasEl, cbs = {}) {
    canvas = canvasEl;
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    callbacks = cbs;
    generateMap();
    resetRover();
    render();
    updateTelemetry();
  }

  function generateMap() {
    map = [];
    fog = [];
    for (let r = 0; r < MAP_ROWS; r++) {
      map[r] = [];
      fog[r] = [];
      for (let c = 0; c < MAP_COLS; c++) {
        map[r][c] = T_EMPTY;
        fog[r][c] = FOG_HIDDEN;
      }
    }

    // === CRATERS (circular depressions) ===
    const craterCount = 25 + Math.floor(Math.random() * 15);
    for (let i = 0; i < craterCount; i++) {
      const cx = 5 + Math.floor(Math.random() * (MAP_COLS - 10));
      const cy = 5 + Math.floor(Math.random() * (MAP_ROWS - 10));
      const radius = 1 + Math.floor(Math.random() * 3);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const nr = cy + dy, nc = cx + dx;
            if (inBounds(nr, nc)) map[nr][nc] = T_CRATER;
          }
        }
      }
    }

    // === DEEP CRATERS (impassable, larger) ===
    const deepCraterCount = 8 + Math.floor(Math.random() * 7);
    for (let i = 0; i < deepCraterCount; i++) {
      const cx = 6 + Math.floor(Math.random() * (MAP_COLS - 12));
      const cy = 6 + Math.floor(Math.random() * (MAP_ROWS - 12));
      const radius = 2 + Math.floor(Math.random() * 2);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const nr = cy + dy, nc = cx + dx;
            if (inBounds(nr, nc)) map[nr][nc] = T_DEEP_CRATER;
          }
        }
      }
    }

    // === HILLS (elevated terrain, impassable) ===
    const hillCount = 12 + Math.floor(Math.random() * 10);
    for (let i = 0; i < hillCount; i++) {
      const cx = 4 + Math.floor(Math.random() * (MAP_COLS - 8));
      const cy = 4 + Math.floor(Math.random() * (MAP_ROWS - 8));
      const radius = 1 + Math.floor(Math.random() * 3);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          // Elliptical shape for natural look
          if ((dx * dx) / (radius * radius) + (dy * dy) / ((radius * 0.7) * (radius * 0.7)) <= 1) {
            const nr = cy + dy, nc = cx + dx;
            if (inBounds(nr, nc)) map[nr][nc] = T_HILL;
          }
        }
      }
    }

    // === BOULDERS (scattered rocks, impassable) ===
    const boulderCount = 50 + Math.floor(Math.random() * 30);
    for (let i = 0; i < boulderCount; i++) {
      const bx = Math.floor(Math.random() * MAP_COLS);
      const by = Math.floor(Math.random() * MAP_ROWS);
      if (map[by][bx] === T_EMPTY) {
        map[by][bx] = T_BOULDER;
        // Cluster: sometimes 2-3 together
        if (Math.random() < 0.4) {
          const dx = Math.random() < 0.5 ? 1 : 0;
          const dy = dx === 0 ? 1 : 0;
          if (inBounds(by + dy, bx + dx) && map[by + dy][bx + dx] === T_EMPTY) {
            map[by + dy][bx + dx] = T_BOULDER;
          }
        }
        if (Math.random() < 0.15) {
          const dx2 = Math.random() < 0.5 ? -1 : 1;
          if (inBounds(by, bx + dx2) && map[by][bx + dx2] === T_EMPTY) {
            map[by][bx + dx2] = T_BOULDER;
          }
        }
      }
    }

    // === BUMPS (rough terrain, passable but noted) ===
    const bumpCount = 60 + Math.floor(Math.random() * 40);
    for (let i = 0; i < bumpCount; i++) {
      const bx = Math.floor(Math.random() * MAP_COLS);
      const by = Math.floor(Math.random() * MAP_ROWS);
      if (map[by][bx] === T_EMPTY) {
        map[by][bx] = T_BUMP;
        // Small clusters
        for (let d = 0; d < 2; d++) {
          const nx = bx + Math.floor(Math.random() * 3) - 1;
          const ny = by + Math.floor(Math.random() * 3) - 1;
          if (inBounds(ny, nx) && map[ny][nx] === T_EMPTY) {
            map[ny][nx] = T_BUMP;
          }
        }
      }
    }

    // === ICE RIDGES (linear impassable features) ===
    const ridgeCount = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < ridgeCount; i++) {
      let cx = Math.floor(Math.random() * MAP_COLS);
      let cy = Math.floor(Math.random() * MAP_ROWS);
      const len = 6 + Math.floor(Math.random() * 12);
      const angle = Math.random() * Math.PI;
      for (let s = 0; s < len; s++) {
        const nc = Math.round(cx + Math.cos(angle) * s);
        const nr = Math.round(cy + Math.sin(angle) * s);
        if (inBounds(nr, nc)) {
          map[nr][nc] = T_ICE_RIDGE;
          // Width of 1-2 tiles
          if (Math.random() < 0.5) {
            const perpX = Math.round(nc + Math.sin(angle));
            const perpY = Math.round(nr - Math.cos(angle));
            if (inBounds(perpY, perpX)) map[perpY][perpX] = T_ICE_RIDGE;
          }
        }
      }
    }

    // === ICE CRACKS (tiger stripes) ===
    const crackCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < crackCount; i++) {
      let cx = Math.floor(Math.random() * MAP_COLS);
      let cy = Math.floor(Math.random() * MAP_ROWS);
      const len = 10 + Math.floor(Math.random() * 18);
      const angle = Math.random() * Math.PI;
      for (let s = 0; s < len; s++) {
        const nc = Math.round(cx + Math.cos(angle) * s);
        const nr = Math.round(cy + Math.sin(angle) * s + (Math.sin(s * 0.5) * 1.5));
        if (inBounds(nr, nc)) map[nr][nc] = T_ICE_CRACK;
      }
    }

    // === PLUME VENTS (south region, like Enceladus south pole) ===
    const ventCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < ventCount; i++) {
      const vx = 8 + Math.floor(Math.random() * (MAP_COLS - 16));
      const vy = MAP_ROWS - 12 + Math.floor(Math.random() * 10);
      if (inBounds(vy, vx)) map[vy][vx] = T_PLUME_VENT;
    }

    // === DOCK ===
    dockPos = { col: 2, row: 2 };
    // Clear safe zone around dock (3x3)
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nr = dockPos.row + dy, nc = dockPos.col + dx;
        if (inBounds(nr, nc)) map[nr][nc] = T_EMPTY;
      }
    }
    map[dockPos.row][dockPos.col] = T_DOCK;
  }

  function inBounds(r, c) {
    return r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS;
  }

  function resetRover() {
    rover = { col: dockPos.col + 1, row: dockPos.row, dir: 0, trail: [] };
    exploredCount = 0;
    distanceTraveled = 0;
    obstaclesDetected = 0;
    bumpsHit = 0;
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        fog[r][c] = FOG_HIDDEN;
      }
    }
    revealAround(rover.col, rover.row);
    updateTelemetry();
  }

  // ---- Fog of War ----
  function revealAround(cx, cy) {
    for (let dy = -PARTIAL_RADIUS; dy <= PARTIAL_RADIUS; dy++) {
      for (let dx = -PARTIAL_RADIUS; dx <= PARTIAL_RADIUS; dx++) {
        const r = cy + dy, c = cx + dx;
        if (!inBounds(r, c)) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= REVEAL_RADIUS) {
          if (fog[r][c] !== FOG_REVEALED) exploredCount++;
          fog[r][c] = FOG_REVEALED;
        } else if (dist <= PARTIAL_RADIUS && fog[r][c] === FOG_HIDDEN) {
          fog[r][c] = FOG_PARTIAL;
        }
      }
    }
  }

  // ---- Movement ----
  function moveRover(direction) {
    rover.dir = direction;
    const nc = rover.col + DX[direction];
    const nr = rover.row + DY[direction];

    if (!inBounds(nr, nc)) return false;

    if (IMPASSABLE.has(map[nr][nc])) {
      obstaclesDetected++;
      updateTelemetry();
      return false;
    }

    // Track bumps
    if (map[nr][nc] === T_BUMP) bumpsHit++;

    rover.trail.push({ col: rover.col, row: rover.row });
    if (rover.trail.length > 600) rover.trail.shift();

    rover.col = nc;
    rover.row = nr;
    distanceTraveled++;

    revealAround(nc, nr);
    updateTelemetry();
    render();
    return true;
  }

  function moveUp()    { return moveRover(3); }
  function moveDown()  { return moveRover(1); }
  function moveLeft()  { return moveRover(2); }
  function moveRight() { return moveRover(0); }

  // ---- Smart Autonomous Exploration ----
  // Uses BFS to find nearest unexplored tile, then A* to navigate there
  // with full obstacle avoidance

  function startAuto() {
    if (autoMode) return;
    autoMode = true;
    autoStep();
  }

  function stopAuto() {
    autoMode = false;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  let currentPath = [];

  function autoStep() {
    if (!autoMode) return;

    // If we have a path, follow it
    if (currentPath.length > 0) {
      const next = currentPath.shift();
      const dx = next.col - rover.col;
      const dy = next.row - rover.row;
      let dir = 0;
      if (dx === 1) dir = 0;
      else if (dx === -1) dir = 2;
      else if (dy === 1) dir = 1;
      else if (dy === -1) dir = 3;

      const moved = moveRover(dir);
      if (!moved) currentPath = []; // Path blocked, recalculate
      autoTimer = setTimeout(autoStep, speed);
      return;
    }

    // Find nearest unexplored tile via BFS from rover
    const target = findNearestUnexplored();
    if (!target) {
      stopAuto();
      if (callbacks.onAutoComplete) callbacks.onAutoComplete();
      return;
    }

    // Find path to target using BFS (guaranteed shortest path with avoidance)
    currentPath = findPath(rover.col, rover.row, target.col, target.row);

    if (currentPath.length === 0) {
      // Can't reach target, try another
      // Mark nearby area as explored to avoid getting stuck
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const r = target.row + dy, c = target.col + dx;
          if (inBounds(r, c) && fog[r][c] === FOG_HIDDEN) {
            fog[r][c] = FOG_REVEALED;
            exploredCount++;
          }
        }
      }
    }

    autoTimer = setTimeout(autoStep, speed);
  }

  function findNearestUnexplored() {
    // BFS from rover position to find nearest hidden tile
    const visited = new Set();
    const queue = [{ col: rover.col, row: rover.row, dist: 0 }];
    visited.add(rover.row * MAP_COLS + rover.col);

    while (queue.length > 0) {
      const curr = queue.shift();

      // Check if any neighbor is unexplored
      for (let d = 0; d < 4; d++) {
        const nc = curr.col + DX[d];
        const nr = curr.row + DY[d];
        if (!inBounds(nr, nc)) continue;
        const key = nr * MAP_COLS + nc;
        if (visited.has(key)) continue;
        visited.add(key);

        if (fog[nr][nc] === FOG_HIDDEN) {
          // Found unexplored — return a passable tile near it
          return { col: curr.col, row: curr.row };
        }

        if (!IMPASSABLE.has(map[nr][nc])) {
          queue.push({ col: nc, row: nr, dist: curr.dist + 1 });
        }
      }
    }
    return null;
  }

  function findPath(sx, sy, tx, ty) {
    // BFS pathfinding with obstacle avoidance
    const visited = new Set();
    const parent = new Map();
    const queue = [{ col: sx, row: sy }];
    const startKey = sy * MAP_COLS + sx;
    visited.add(startKey);

    while (queue.length > 0) {
      const curr = queue.shift();
      const currKey = curr.row * MAP_COLS + curr.col;

      if (curr.col === tx && curr.row === ty) {
        // Reconstruct path
        const path = [];
        let key = currKey;
        while (parent.has(key)) {
          const node = parent.get(key);
          path.unshift({ col: curr.col, row: curr.row });
          // Actually we need coords from key
          break;
        }
        // Better reconstruction
        const pathResult = [];
        let k = ty * MAP_COLS + tx;
        while (k !== startKey) {
          const r = Math.floor(k / MAP_COLS);
          const c = k % MAP_COLS;
          pathResult.unshift({ col: c, row: r });
          k = parent.get(k);
          if (k === undefined) break;
        }
        return pathResult;
      }

      for (let d = 0; d < 4; d++) {
        const nc = curr.col + DX[d];
        const nr = curr.row + DY[d];
        if (!inBounds(nr, nc)) continue;
        const nk = nr * MAP_COLS + nc;
        if (visited.has(nk)) continue;
        if (IMPASSABLE.has(map[nr][nc])) continue;

        visited.add(nk);
        parent.set(nk, currKey);
        queue.push({ col: nc, row: nr });
      }

      // Limit search depth
      if (visited.size > 3000) break;
    }
    return [];
  }

  // ---- Rendering ----
  function render() {
    ctx.fillStyle = COLORS.fog;
    ctx.fillRect(0, 0, W, H);

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const fogState = fog[r][c];

        if (fogState === FOG_HIDDEN) continue;

        const tile = map[r][c];
        const alpha = fogState === FOG_PARTIAL ? 0.3 : 1;
        ctx.globalAlpha = alpha;

        // Base ground
        ctx.fillStyle = (c + r) % 2 === 0 ? COLORS.ground : COLORS.groundAlt;
        ctx.fillRect(x, y, TILE, TILE);

        // Subtle grid
        ctx.strokeStyle = COLORS.gridLine;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE, TILE);

        // Draw terrain features
        switch (tile) {
          case T_CRATER:      drawCrater(x, y); break;
          case T_DEEP_CRATER: drawDeepCrater(x, y); break;
          case T_BOULDER:     drawBoulder(x, y); break;
          case T_HILL:        drawHill(x, y); break;
          case T_BUMP:        drawBump(x, y); break;
          case T_ICE_RIDGE:   drawIceRidge(x, y); break;
          case T_ICE_CRACK:   drawIceCrack(x, y); break;
          case T_PLUME_VENT:  drawPlumeVent(x, y); break;
          case T_DOCK:        drawDock(x, y); break;
        }

        ctx.globalAlpha = 1;
      }
    }

    // Trail
    ctx.globalAlpha = 1;
    if (rover.trail.length > 1) {
      ctx.strokeStyle = COLORS.trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rover.trail[0].col * TILE + TILE / 2, rover.trail[0].row * TILE + TILE / 2);
      for (let i = 1; i < rover.trail.length; i++) {
        ctx.lineTo(rover.trail[i].col * TILE + TILE / 2, rover.trail[i].row * TILE + TILE / 2);
      }
      ctx.lineTo(rover.col * TILE + TILE / 2, rover.row * TILE + TILE / 2);
      ctx.stroke();
    }
    for (const t of rover.trail) {
      ctx.fillStyle = COLORS.trailDot;
      ctx.beginPath();
      ctx.arc(t.col * TILE + TILE / 2, t.row * TILE + TILE / 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fog overlay for partial tiles
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        if (fog[r][c] === FOG_PARTIAL) {
          ctx.fillStyle = COLORS.fogPartial;
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
    }

    // Rover last (on top)
    drawRover();
  }

  // ---- Terrain Renderers ----

  function drawCrater(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    // Shadow
    ctx.fillStyle = COLORS.craterShadow;
    ctx.beginPath();
    ctx.arc(cx + 1, cy + 1, TILE * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // Main
    ctx.fillStyle = COLORS.crater;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // Rim highlight
    ctx.strokeStyle = COLORS.craterRim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, TILE * 0.38, -0.5, 1.5);
    ctx.stroke();
  }

  function drawDeepCrater(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.fillStyle = COLORS.deepCrater;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.44, 0, Math.PI * 2);
    ctx.fill();
    // Dark center
    ctx.fillStyle = '#3a4a64';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.25, 0, Math.PI * 2);
    ctx.fill();
    // Rim
    ctx.strokeStyle = COLORS.deepCraterRim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.44, 0, Math.PI * 2);
    ctx.stroke();
    // Danger marker
    ctx.fillStyle = 'rgba(200, 60, 60, 0.3)';
    ctx.fillRect(x + TILE / 2 - 1.5, y + TILE / 2 - 1.5, 3, 3);
  }

  function drawBoulder(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    // Shadow
    ctx.fillStyle = COLORS.boulderShadow;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 5);
    ctx.lineTo(cx - 3, cy - 4);
    ctx.lineTo(cx + 3, cy - 5);
    ctx.lineTo(cx + 6, cy - 1);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.closePath();
    ctx.fill();
    // Main body
    ctx.fillStyle = COLORS.boulder;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy + 4);
    ctx.lineTo(cx - 4, cy - 4);
    ctx.lineTo(cx + 2, cy - 5);
    ctx.lineTo(cx + 5, cy - 2);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();
    // Highlight
    ctx.fillStyle = COLORS.boulderHi;
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 3);
    ctx.lineTo(cx + 1, cy - 4);
    ctx.lineTo(cx + 3, cy - 1);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
  }

  function drawHill(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    // Base shadow
    ctx.fillStyle = COLORS.hillShadow;
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 2, TILE * 0.42, TILE * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // Main mound
    ctx.fillStyle = COLORS.hill;
    ctx.beginPath();
    ctx.ellipse(cx, cy, TILE * 0.42, TILE * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bright top
    ctx.fillStyle = COLORS.hillTop;
    ctx.beginPath();
    ctx.ellipse(cx - 1, cy - 1, TILE * 0.2, TILE * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // Contour lines
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, TILE * 0.32, TILE * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawBump(x, y) {
    // Small rough dots pattern
    ctx.fillStyle = COLORS.bump;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = COLORS.bumpDot;
    // Scattered dots
    const seed = (x * 7 + y * 13) % 17;
    ctx.beginPath();
    ctx.arc(x + 4 + (seed % 5), y + 4 + (seed % 4), 1.5, 0, Math.PI * 2);
    ctx.arc(x + 10 + (seed % 3), y + 8 + (seed % 3), 1, 0, Math.PI * 2);
    ctx.arc(x + 7 + (seed % 4), y + 12 + (seed % 3), 1.2, 0, Math.PI * 2);
    ctx.fill();
    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
  }

  function drawIceRidge(x, y) {
    // Sharp raised ice
    ctx.fillStyle = COLORS.iceRidge;
    ctx.fillRect(x, y, TILE, TILE);
    // Shadow side
    ctx.fillStyle = COLORS.iceRidgeShadow;
    ctx.fillRect(x + TILE - 4, y, 4, TILE);
    // Bright edge
    ctx.fillStyle = COLORS.iceRidgeEdge;
    ctx.fillRect(x, y, 3, TILE);
    // Top highlight
    ctx.fillStyle = '#f0f6ff';
    ctx.fillRect(x + 1, y + 1, 2, TILE - 2);
  }

  function drawIceCrack(x, y) {
    // Glow behind
    ctx.fillStyle = COLORS.iceCrackGlow;
    ctx.fillRect(x + 2, y, TILE - 4, TILE);
    // Deep crack line
    ctx.fillStyle = COLORS.iceCrackDeep;
    ctx.fillRect(x + 6, y, 3, TILE);
    // Bright edges
    ctx.fillStyle = COLORS.iceCrack;
    ctx.fillRect(x + 5, y, 1, TILE);
    ctx.fillRect(x + 9, y, 1, TILE);
  }

  function drawPlumeVent(x, y) {
    const cx = x + TILE / 2, cy = y + TILE / 2;
    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 12);
    glow.addColorStop(0, COLORS.plumeGlow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    // Vent hole
    ctx.fillStyle = COLORS.plumeVent;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#90d0f0';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Particles shooting up
    for (let i = 0; i < 4; i++) {
      const offset = (Date.now() / 150 + i * 8) % 30;
      const py = cy - 6 - offset;
      const px = cx + Math.sin(Date.now() / 400 + i * 1.5) * 4;
      if (py > y - 15) {
        const alpha = Math.max(0, 0.5 - offset / 30);
        ctx.fillStyle = `rgba(180, 220, 250, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 - offset / 40, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawDock(x, y) {
    ctx.fillStyle = COLORS.dock;
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    // Pulsing border
    const pulse = 0.5 + 0.3 * Math.sin(Date.now() / 600);
    ctx.strokeStyle = `rgba(96, 184, 128, ${pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    // Cross
    ctx.strokeStyle = 'rgba(96, 184, 128, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + TILE / 2, y + 4);
    ctx.lineTo(x + TILE / 2, y + TILE - 4);
    ctx.moveTo(x + 4, y + TILE / 2);
    ctx.lineTo(x + TILE - 4, y + TILE / 2);
    ctx.stroke();
  }

  function drawRover() {
    const cx = rover.col * TILE + TILE / 2;
    const cy = rover.row * TILE + TILE / 2;

    // Scan range circle
    const scanGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, REVEAL_RADIUS * TILE);
    scanGrad.addColorStop(0, 'rgba(0, 170, 220, 0.04)');
    scanGrad.addColorStop(0.7, 'rgba(0, 170, 220, 0.02)');
    scanGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = scanGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, REVEAL_RADIUS * TILE, 0, Math.PI * 2);
    ctx.fill();

    // Scan ring
    ctx.strokeStyle = 'rgba(0, 170, 220, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, REVEAL_RADIUS * TILE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rover body
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rover.dir * Math.PI / 2);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-5, -4, 12, 10);

    // Body
    ctx.fillStyle = COLORS.roverBody;
    ctx.fillRect(-6, -5, 12, 10);
    ctx.strokeStyle = COLORS.rover;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-6, -5, 12, 10);

    // Direction arrow
    ctx.fillStyle = COLORS.rover;
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#2a4060';
    ctx.fillRect(-7, -6, 3, 2);
    ctx.fillRect(-7, 4, 3, 2);
    ctx.fillRect(4, -6, 3, 2);
    ctx.fillRect(4, 4, 3, 2);

    // Antenna
    ctx.strokeStyle = COLORS.rover;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -5);
    ctx.lineTo(-4, -9);
    ctx.stroke();
    ctx.fillStyle = COLORS.rover;
    ctx.beginPath();
    ctx.arc(-4, -9, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
    glow.addColorStop(0, COLORS.roverGlow);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Animation Loop ----
  let animFrame;
  function startAnimLoop() {
    function loop() {
      render();
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }
  function stopAnimLoop() {
    if (animFrame) cancelAnimationFrame(animFrame);
  }

  // ---- Telemetry ----
  function updateTelemetry() {
    if (callbacks.onTelemetry) {
      callbacks.onTelemetry({
        position:  `(${rover.col}, ${rover.row})`,
        direction: DIR_ARROWS[rover.dir],
        explored:  `${Math.round((exploredCount / totalTiles) * 100)}%`,
        distance:  distanceTraveled,
        obstacles: obstaclesDetected,
        bumps:     bumpsHit,
        tiles:     `${exploredCount} / ${totalTiles}`,
      });
    }
  }

  // ---- Public API ----
  return {
    init,
    moveUp, moveDown, moveLeft, moveRight,
    startAuto, stopAuto,
    get isAuto() { return autoMode; },
    setSpeed(ms) { speed = ms; },
    regenerate() { stopAuto(); currentPath = []; generateMap(); resetRover(); render(); },
    reset()      { stopAuto(); currentPath = []; resetRover(); render(); },
    startAnimLoop, stopAnimLoop,
  };
})();
