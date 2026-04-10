// ─── Constants ────────────────────────────────────────────────────────────────

const FILES = ['a','b','c','d','e','f','g','h'];

const PIECE_ICONS = {
  rook:'♜', bishop:'♝', knight:'♞',
  queen:'♛', king:'♚', pawn:'♟',
  player:'♖'
};

const PLAYER_PIECES = ['rook','bishop','knight','queen'];

const PIECE_LIMITS = {
  pawn:8, rook:2, bishop:2, knight:2, queen:1, king:1
};

// ─── Coordinate helpers ───────────────────────────────────────────────────────

function toCoord(s)       { return {x: FILES.indexOf(s[0]), y: +s[1] - 1}; }
function toSquare(x, y)   { return FILES[x] + (y + 1); }
function inBounds(x, y)   { return x >= 0 && x < 8 && y >= 0 && y < 8; }

// ─── Debug logger ─────────────────────────────────────────────────────────────

const DEBUG = true;
function dbg(...args) { if (DEBUG) console.log('[Chess]', ...args); }

// ─── PieceEngine ──────────────────────────────────────────────────────────────

class PieceEngine {

  static directions = {
    rook:   [[1,0],[-1,0],[0,1],[0,-1]],
    bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
    queen:  [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    knight: [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],
    king:   [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
  };

  static getMoves(type, from, board) {
    let {x, y} = toCoord(from);
    let moves = [];

    if (type === 'pawn') {
      for (let [dx, dy] of [[-1,-1],[1,-1]]) {
        let nx = x+dx, ny = y+dy;
        if (inBounds(nx, ny)) moves.push(toSquare(nx, ny));
      }
      return moves;
    }

    if (type === 'knight' || type === 'king') {
      for (let [dx, dy] of this.directions[type]) {
        let nx = x+dx, ny = y+dy;
        if (inBounds(nx, ny)) moves.push(toSquare(nx, ny));
      }
      return moves;
    }

    // Sliding pieces
    for (let [dx, dy] of this.directions[type]) {
      let nx = x+dx, ny = y+dy;
      while (inBounds(nx, ny)) {
        let sq = toSquare(nx, ny);
        moves.push(sq);
        if (board[sq]) break;
        nx += dx; ny += dy;
      }
    }
    return moves;
  }

  static getAttackMap(pieces, board) {
    let set = new Set();
    for (let p of pieces) {
      for (let m of this.getMoves(p.type, p.square, board)) set.add(m);
      set.add(p.square);
    }
    return set;
  }

  static getAttackLines(target, pieces, board) {
    let lines = [];
    for (let p of pieces) {
      if (this.getMoves(p.type, p.square, board).includes(target))
        lines.push([p.square, target]);
    }
    return lines;
  }
}

// ─── Path safety ─────────────────────────────────────────────────────────────

function isPathSafe(from, to, attacked) {
  let a = toCoord(from), b = toCoord(to);
  let dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  let x = a.x + dx, y = a.y + dy;
  while (x !== b.x || y !== b.y) {
    if (attacked.has(toSquare(x, y))) return false;
    x += dx; y += dy;
  }
  return true;
}

function safeMoves(sq, board, attacked, pieceType) {
  let result = [];
  for (let m of PieceEngine.getMoves(pieceType, sq, board)) {
    if (!attacked.has(m) && isPathSafe(sq, m, attacked))
      result.push(m);
  }
  return result;
}

// ─── Bidirectional BFS ────────────────────────────────────────────────────────
//
// Expands level-by-level, alternating sides. Stops once the combined depth of
// both frontiers equals `best` (the shortest meeting distance found so far).
//
// After finding `best`, we ensure fwd covers the full path depth so that
// collectPaths can walk from start all the way to end.
//
// Returns { fwd, bwd, dist } or null.
//   fwd  = Map<sq, distFromStart>
//   bwd  = Map<sq, distFromEnd>
//   dist = path length in NODES (= moves + 1)

function biDirBFS(start, end, board, attacked, pieceType) {
  if (start === end) return null;

  let fwd = new Map([[start, 0]]);
  let bwd = new Map([[end,   0]]);

  let fFront = [start];
  let bFront = [end];

  function expandLevel(frontier, distMap) {
    let next = [];
    for (let sq of frontier) {
      let d = distMap.get(sq);
      for (let m of safeMoves(sq, board, attacked, pieceType)) {
        if (!distMap.has(m)) {
          distMap.set(m, d + 1);
          next.push(m);
        }
      }
    }
    return next;
  }

  // Scan a frontier for overlaps with the other map; return min combined dist.
  function scanMeeting(frontier, myMap, otherMap) {
    let best = Infinity;
    for (let sq of frontier) {
      if (otherMap.has(sq)) {
        let d = myMap.get(sq) + otherMap.get(sq);
        if (d < best) best = d;
      }
    }
    return best;
  }

  let best = Infinity;

  while (fFront.length > 0 || bFront.length > 0) {
    // Current frontier depths
    let fDepth = fFront.length > 0 ? fwd.get(fFront[0]) : Infinity;
    let bDepth = bFront.length > 0 ? bwd.get(bFront[0]) : Infinity;

    // Pruning: if the shallowest possible meeting from here >= best, stop
    if (best < Infinity && fDepth + bDepth >= best) break;

    // Expand whichever frontier is shallower (or fwd if tied)
    if (fDepth <= bDepth) {
      fFront = expandLevel(fFront, fwd);
      if (fFront.length > 0) {
        let m = scanMeeting(fFront, fwd, bwd);
        if (m < best) best = m;
      }
    } else {
      bFront = expandLevel(bFront, bwd);
      if (bFront.length > 0) {
        let m = scanMeeting(bFront, bwd, fwd);
        if (m < best) best = m;
      }
    }
  }

  if (best === Infinity) return null;

  // Ensure fwd is deep enough for collectPaths to reach `end`
  // (best is in moves; we need fwd to have depth `best`)
  while (fFront.length > 0 && fwd.get(fFront[0]) < best) {
    fFront = expandLevel(fFront, fwd);
  }
  // One final expansion if end still not in fwd
  if (!fwd.has(end) && fFront.length > 0) {
    expandLevel(fFront, fwd);
  }

  return { fwd, bwd, dist: best + 1 }; // dist in nodes
}

// ─── Collect all shortest paths ───────────────────────────────────────────────
//
// DFS over the DAG defined by: sq -> m where
//   fwd[m] == fwd[sq] + 1   AND   fwd[m] + bwd[m] == totalMoves

function collectPaths(start, end, board, attacked, pieceType, fwd, bwd, totalDist) {
  const totalMoves = totalDist - 1;

  let results = [];
  const RESULT_CAP = 50;
  const NODE_CAP   = 10000;
  let nodeCount = 0;

  let stack = [[start, [start]]];

  while (stack.length > 0) {
    if (++nodeCount > NODE_CAP || results.length >= RESULT_CAP) break;

    let [sq, path] = stack.pop();
    let d = fwd.get(sq);

    if (sq === end) {
      results.push(path);
      continue;
    }

    for (let m of safeMoves(sq, board, attacked, pieceType)) {
      let md = fwd.get(m);
      if (md !== d + 1) continue;          // not one step forward

      let bd = bwd.get(m);
      if (bd === undefined) continue;       // not on any optimal path
      if (md + bd !== totalMoves) continue; // not on THIS optimal length

      stack.push([m, [...path, m]]);
    }
  }

  return results;
}

// ─── Public BFS API ───────────────────────────────────────────────────────────

function bfsAll(start, end, board, attacked, pieceType) {
  let r = biDirBFS(start, end, board, attacked, pieceType);
  if (!r || r.dist < 3) return [];
  let paths = collectPaths(start, end, board, attacked, pieceType, r.fwd, r.bwd, r.dist);
  dbg(`bfsAll(${start}->${end}, ${pieceType}): dist=${r.dist}, paths=${paths.length}`);
  return paths;
}

function cheapReachable(start, end, board, attacked, pieceType) {
  let r = biDirBFS(start, end, board, attacked, pieceType);
  if (!r || r.dist < 3) return 0;
  return r.dist;
}

// ─── Puzzle Generator ─────────────────────────────────────────────────────────

class Generator {

  constructor(level) { this.level = level; }

  rand() {
    return toSquare(
      Math.floor(Math.random() * 8),
      Math.floor(Math.random() * 8)
    );
  }

  generate() {
    const t0 = performance.now();
    // Hard attempt cap instead of time limit — keeps worst-case runtime bounded.
    // 300 outer attempts * cheap cheapReachable calls = well under 100ms typical.
    const MAX_ATTEMPTS = 300;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {

      let s = this.rand(), e = this.rand();
      if (s === e) continue;

      let playerPiece = PLAYER_PIECES[Math.floor(Math.random() * PLAYER_PIECES.length)];

      if (!cheapReachable(s, e, {}, new Set(), playerPiece)) continue;

      let board  = {}, pieces = [];
      let counts = {pawn:0, rook:0, bishop:0, knight:0, queen:0, king:0};
      const target = this.level - 1;
      let failed = false;

      for (let i = 0; i < target; i++) {
        let placed = false;

        for (let tries = 0; tries < 40; tries++) {
          let type = Object.keys(PIECE_LIMITS)[Math.floor(Math.random() * 6)];
          if (counts[type] >= PIECE_LIMITS[type]) continue;

          let sq = this.rand();
          if (sq === s || sq === e || board[sq]) continue;

          pieces.push({type, square: sq});
          board[sq] = type;
          counts[type]++;

          let atk = PieceEngine.getAttackMap(pieces, board);

          if (atk.has(s) || atk.has(e) || !cheapReachable(s, e, board, atk, playerPiece)) {
            pieces.pop();
            delete board[sq];
            counts[type]--;
            continue;
          }

          placed = true;
          break;
        }

        if (!placed) { failed = true; break; }
      }

      if (failed) continue;

      let atk = PieceEngine.getAttackMap(pieces, board);
      let sol = bfsAll(s, e, board, atk, playerPiece);

      if (sol.length > 0 && sol[0].length >= 3) {
        dbg(`Puzzle OK: ${(performance.now()-t0).toFixed(0)}ms, attempt=${attempt+1}/${MAX_ATTEMPTS}, level=${this.level}, ${playerPiece}, path=${sol[0].length}, opponents=${pieces.length}`);
        return { s, e, pieces, sol, playerPiece, complexity: sol[0].length * pieces.length };
      }
    }

    dbg(`Generator gave up after ${MAX_ATTEMPTS} attempts, ${(performance.now()-t0).toFixed(0)}ms`);
    return {
      s:'a1', e:'h8',
      pieces:[],
      sol:[['a1','a8','h8']],
      playerPiece:'rook',
      complexity:2,
      timeout:true
    };
  }
}

// ─── Board DOM ────────────────────────────────────────────────────────────────

function createBoard() {
  let b = document.getElementById('board');
  b.innerHTML = '';

  for (let r = 7; r >= 0; r--) {
    for (let c = 0; c < 8; c++) {
      let d = document.createElement('div');
      d.className = 'cell ' + ((r + c) % 2 ? 'dark' : 'light');
      d.dataset.sq = toSquare(c, r);
      b.appendChild(d);
    }
  }

  let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', 480);
  svg.setAttribute('height', 480);
  svg.innerHTML = `<defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="blue"/>
    </marker>
  </defs>`;
  svg.id = 'arrows';
  b.appendChild(svg);
}

// ─── Game ─────────────────────────────────────────────────────────────────────

class Game {

  constructor() {
    this.level   = 1;
    this.history = [];
    this.curr    = null;
  }

  // Wraps synchronous generate() in a setTimeout so the browser can paint
  // the "Generating…" status before the JS blocks.
  generateAsync(level) {
    return new Promise(resolve => {
      setTimeout(() => resolve(new Generator(level).generate()), 0);
    });
  }

  async nextLevel() {
    if (this.curr) {
      this.history.push({time: this.lastTime, invalid: this.invalid});
      this.renderHistory();
    }

    this.setStatus('Generating puzzle…');
    document.getElementById('nextBtn').disabled = true;
    document.getElementById('redoBtn').disabled = true;

    const puzzle = await this.generateAsync(this.level);

    this.curr  = puzzle;
    this.level++;
    document.getElementById('nextBtn').disabled = false;
    document.getElementById('redoBtn').disabled = false;
    this.reset();
  }

  redo() {
    if (this.curr) this.reset();
  }

  reset() {
    this.pos       = this.curr.s;
    this.selected  = false;
    this.invalid   = 0;
    this.startTime = performance.now();

    let msg = `Piece: ${this.curr.playerPiece} | Complexity: ${this.curr.complexity}`;
    if (this.curr.timeout) msg = '⚠ fallback puzzle | ' + msg;
    this.setStatus(msg);
    this.render();
  }

  setStatus(m) {
    document.getElementById('status').textContent = m;
  }

  render() {
    document.querySelectorAll('.cell').forEach(c => {
      c.textContent = '';
      c.classList.remove('selected', 'blink');
    });

    let {s, e, pieces, playerPiece} = this.curr;

    document.querySelector(`[data-sq="${s}"]`).textContent = 'S';
    document.querySelector(`[data-sq="${e}"]`).textContent = 'X';

    pieces.forEach(p => {
      document.querySelector(`[data-sq="${p.square}"]`).textContent = PIECE_ICONS[p.type];
    });

    let me = document.querySelector(`[data-sq="${this.pos}"]`);
    me.textContent = PIECE_ICONS[playerPiece] || PIECE_ICONS.player;
    if (this.selected) me.classList.add('selected');

    this.drawArrows();
  }

  drawArrows() {
    let svg = document.getElementById('arrows');
    svg.innerHTML = svg.innerHTML.split('</defs>')[0] + '</defs>';
    if (!document.getElementById('toggleHints').checked) return;

    let size = 60;
    this.curr.sol.forEach(path => {
      for (let i = 0; i < path.length - 1; i++) {
        let a = toCoord(path[i]), b = toCoord(path[i+1]);
        let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.x*size+30);
        line.setAttribute('y1', (7-a.y)*size+30);
        line.setAttribute('x2', b.x*size+30);
        line.setAttribute('y2', (7-b.y)*size+30);
        line.setAttribute('stroke', 'blue');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('opacity', '0.4');
        line.setAttribute('marker-end', 'url(#arrow)');
        svg.appendChild(line);
      }
    });
  }

  drawAttackLines(lines) {
    let svg = document.getElementById('arrows');
    let size = 60;
    lines.forEach(([from, to]) => {
      let a = toCoord(from), b = toCoord(to);
      let line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x*size+30);
      line.setAttribute('y1', (7-a.y)*size+30);
      line.setAttribute('x2', b.x*size+30);
      line.setAttribute('y2', (7-b.y)*size+30);
      line.setAttribute('stroke', 'red');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('opacity', '0.6');
      svg.appendChild(line);
      setTimeout(() => line.remove(), 600);
    });
  }

  renderHistory() {
    let ul = document.getElementById('list');
    ul.innerHTML = '';
    this.history.forEach((h, i) => {
      let li = document.createElement('li');
      li.textContent = `#${i+1} - ${h.time?.toFixed(2)||'-'}s, ${h.invalid} mistakes`;
      ul.appendChild(li);
    });
  }

  blinkAttackers(square) {
    let {pieces} = this.curr;
    let board = {};
    pieces.forEach(p => board[p.square] = p.type);
    let lines = PieceEngine.getAttackLines(square, pieces, board);
    lines.forEach(([from]) => {
      let el = document.querySelector(`[data-sq="${from}"]`);
      if (el) el.classList.add('blink');
    });
    this.drawAttackLines(lines);
  }

  handleClick(sq) {
    if (!this.curr) return;
    let {pieces, playerPiece} = this.curr;
    let board = {};
    pieces.forEach(p => board[p.square] = p.type);
    let atk = PieceEngine.getAttackMap(pieces, board);

    if (!this.selected) {
      if (sq === this.pos) {
        this.selected = true;
        this.setStatus('Move piece');
        this.render();
      }
      return;
    }

    let moves = PieceEngine.getMoves(playerPiece, this.pos, board);

    if (moves.includes(sq) && !atk.has(sq) && isPathSafe(this.pos, sq, atk)) {
      this.pos = sq;

      if (sq === this.curr.e) {
        let t = (performance.now() - this.startTime) / 1000;
        this.lastTime = t;
        this.setStatus('Solved in ' + t.toFixed(2) + 's! Loading next…');
        setTimeout(() => this.nextLevel(), 1000);
      } else {
        this.setStatus('Move piece');
      }

      this.render();
    } else {
      this.invalid++;
      this.setStatus('Invalid move');
      this.blinkAttackers(sq);
    }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const game = new Game();
createBoard();
game.nextLevel();

document.getElementById('toggleHints')
  .addEventListener('change', () => { if (game.curr) game.render(); });

document.getElementById('board').addEventListener('click', e => {
  if (!e.target.dataset.sq || !game.curr) return;
  game.handleClick(e.target.dataset.sq);
});
