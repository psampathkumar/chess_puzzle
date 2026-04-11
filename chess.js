// ─── Constants ────────────────────────────────────────────────────────────────

const FILES = ['a','b','c','d','e','f','g','h'];

// Unicode chess pieces.
// Opponent pieces use the filled black set; player uses the white (outline) set.
const PIECE_ICONS_OPP = {
  rook:'♜', bishop:'♝', knight:'♞', queen:'♛', king:'♚', pawn:'♟'
};
const PIECE_ICONS_PLAYER = {
  rook:'♖', bishop:'♗', knight:'♘', queen:'♕', king:'♔'
};

function pieceHTML(type, player = false) {
  const icon = player
    ? (PIECE_ICONS_PLAYER[type] || '♙')
    : (PIECE_ICONS_OPP[type]    || '♟');
  const cls = player ? 'piece-badge piece-badge--player' : 'piece-badge piece-badge--opponent';
  return `<span class="${cls}">${icon}</span>`;
}

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

// ─── Integer helpers ─────────────────────────────────────────────────────────
// sq index = x + y*8  (0..63).  All hot BFS code works on ints; strings only
// appear at the public API boundary.

function sqToInt(s)       { return FILES.indexOf(s[0]) + (+s[1] - 1) * 8; }
function intToSq(n)       { return FILES[n & 7] + ((n >> 3) + 1); }
function inBoundsXY(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8; }

// ─── Move generation (int) ────────────────────────────────────────────────────

const DIRS = {
  rook:   [[1,0],[-1,0],[0,1],[0,-1]],
  bishop: [[1,1],[1,-1],[-1,1],[-1,-1]],
  queen:  [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
  knight: [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],
  king:   [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
  pawn:   [[-1,-1],[1,-1]]
};

function getMovesInt(type, fromInt, boardInt) {
  const x = fromInt & 7, y = fromInt >> 3;
  const moves = [];
  const dirs  = DIRS[type];
  if (type === 'knight' || type === 'king' || type === 'pawn') {
    for (const [dx, dy] of dirs) {
      const nx = x+dx, ny = y+dy;
      if (inBoundsXY(nx, ny)) moves.push(nx + ny*8);
    }
    return moves;
  }
  for (const [dx, dy] of dirs) {
    let nx = x+dx, ny = y+dy;
    while (inBoundsXY(nx, ny)) {
      const sq = nx + ny*8;
      moves.push(sq);
      if (boardInt.has(sq)) break;
      nx += dx; ny += dy;
    }
  }
  return moves;
}

function isPathSafeInt(fromInt, toInt, atkInt) {
  const ax = fromInt & 7, ay = fromInt >> 3;
  const bx = toInt   & 7, by = toInt   >> 3;
  const adx = Math.abs(bx - ax), ady = Math.abs(by - ay);
  // Knights jump: the only non-collinear move is (1,2) or (2,1).
  // All other moves are rays (straight or diagonal) and need intermediate checks.
  if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) return true;
  // Step along the ray and check every intermediate square.
  const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
  let x = ax + dx, y = ay + dy;
  while (x !== bx || y !== by) {
    if (atkInt.has(x + y * 8)) return false;
    x += dx; y += dy;
  }
  return true;
}

function safeMovesInt(fromInt, boardInt, atkInt, pieceType) {
  const result = [];
  for (const m of getMovesInt(pieceType, fromInt, boardInt)) {
    if (!atkInt.has(m) && isPathSafeInt(fromInt, m, atkInt))
      result.push(m);
  }
  return result;
}

// ─── isPathSafe (string API, used by click-handler only) ─────────────────────

function isPathSafe(from, to, attacked) {
  const a = toCoord(from), b = toCoord(to);
  const adx = Math.abs(b.x - a.x), ady = Math.abs(b.y - a.y);
  if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) return true; // knight jump
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  let x = a.x + dx, y = a.y + dy;
  while (x !== b.x || y !== b.y) {
    if (attacked.has(toSquare(x, y))) return false;
    x += dx; y += dy;
  }
  return true;
}

// ─── Forward BFS — distance map only ─────────────────────────────────────────
// Simple, correct, guaranteed to terminate (64-square board).
// Returns Map<intSq, distance> from start, or null if end unreachable.
// `dist` on the returned object is path-length in NODES (moves + 1).

function forwardBFS(start, end, board, attacked, pieceType) {
  const startInt = sqToInt(start);
  const endInt   = sqToInt(end);

  const boardInt = new Set();
  for (const sq in board) boardInt.add(sqToInt(sq));
  const atkInt = new Set();
  for (const sq of attacked) atkInt.add(sqToInt(sq));

  // Standard BFS — queue holds int squares, dist map records distance from start
  const dist = new Map([[startInt, 0]]);
  const queue = [startInt];
  let qi = 0; // index into queue (avoids O(n) shift)

  while (qi < queue.length) {
    const sq = queue[qi++];
    const d  = dist.get(sq);

    if (sq === endInt) break; // found — no need to explore further

    for (const m of safeMovesInt(sq, boardInt, atkInt, pieceType)) {
      if (!dist.has(m)) {
        dist.set(m, d + 1);
        queue.push(m);
      }
    }
  }

  if (!dist.has(endInt)) return null;

  return { dist, startInt, endInt, boardInt, atkInt,
           pathDist: dist.get(endInt) + 1 }; // pathDist = nodes
}

// ─── Collect all shortest paths ───────────────────────────────────────────────
// DFS using the dist map: only step to m where dist[m] == dist[sq]+1.
// This is O(paths * pathLen) — bounded by RESULT_CAP.

function collectPaths(fwdResult, pieceType, startStr, endStr) {
  const { dist, startInt, endInt, boardInt, atkInt, pathDist } = fwdResult;
  const totalMoves = pathDist - 1;

  const results  = [];
  const RESULT_CAP = 50;
  const NODE_CAP   = 10000;
  let   nodeCount  = 0;

  // stack: [intSq, stringPath]
  const stack = [[startInt, [startStr]]];

  while (stack.length > 0) {
    if (++nodeCount > NODE_CAP || results.length >= RESULT_CAP) break;

    const [sq, path] = stack.pop();
    const d = dist.get(sq);

    if (sq === endInt) {
      results.push(path);
      continue;
    }

    if (d >= totalMoves) continue; // pruning: can't reach end in remaining moves

    for (const m of safeMovesInt(sq, boardInt, atkInt, pieceType)) {
      const md = dist.get(m);
      if (md === d + 1) { // one step closer to end
        stack.push([m, [...path, intToSq(m)]]);
      }
    }
  }

  return results;
}

// ─── Public BFS API ───────────────────────────────────────────────────────────

function bfsAll(start, end, board, attacked, pieceType) {
  const r = forwardBFS(start, end, board, attacked, pieceType);
  if (!r || r.pathDist < 3) return [];
  const paths = collectPaths(r, pieceType, start, end);
  dbg(`bfsAll(${start}->${end}, ${pieceType}): dist=${r.pathDist}, paths=${paths.length}`);
  return paths;
}

function cheapReachable(start, end, board, attacked, pieceType) {
  const r = forwardBFS(start, end, board, attacked, pieceType);
  if (!r || r.pathDist < 3) return 0;
  return r.pathDist;
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
          // Pawns cannot legally stand on rank 1 or rank 8
          if (type === 'pawn' && (sq[1] === '1' || sq[1] === '8')) continue;

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
        return { s, e, pieces, sol, playerPiece, complexity: sol[0].length - 1 };
      }
    }

    dbg(`Generator gave up after ${MAX_ATTEMPTS} attempts, ${(performance.now()-t0).toFixed(0)}ms`);
    return {
      s:'a1', e:'h8',
      pieces:[],
      sol:[['a1','a8','h8']],
      playerPiece:'rook',
      complexity:2, // 2 moves
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
  const PATH_COLORS = ['#4a9eff','#ff6b35','#3ddc84','#f5c518','#c77dff'];
  const markerDefs = PATH_COLORS.map((c, i) =>
    `<marker id="arrow${i}" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="${c}"/>
    </marker>`
  ).join('');
  svg.innerHTML = `<defs>${markerDefs}</defs>`;
  svg.dataset.pathColors = JSON.stringify(PATH_COLORS);
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
    this.pos        = this.curr.s;
    this.selected   = false;
    this.invalid    = 0;
    this.moveCount  = 0; // moves made so far this puzzle
    this.startTime  = performance.now();

    const optMoves = this.curr.complexity; // moves in optimal solution
    const pieceLabel = this.curr.playerPiece.charAt(0).toUpperCase() + this.curr.playerPiece.slice(1);
    const oppCount = this.curr.pieces.length;
    const oppDesc = oppCount === 0 ? 'no opponent pieces'
                  : oppCount === 1 ? '1 opponent piece'
                  : `${oppCount} opponent pieces`;

    document.getElementById('description').textContent =
      `Move the ${pieceLabel} from S to 🏁 in exactly ${optMoves} move${optMoves !== 1 ? 's' : ''}. `
      + `Avoid all squares attacked by ${oppDesc}. `
      + (this.curr.timeout ? '⚠ fallback puzzle.' : '');

    let msg = `${pieceLabel} · ${optMoves} move${optMoves !== 1 ? 's' : ''} · Complexity ${optMoves}`;
    if (this.curr.timeout) msg = '⚠ fallback | ' + msg;
    this.setStatus(msg);
    this.render();
  }

  setStatus(m) {
    document.getElementById('status').textContent = m;
  }

  render() {
    document.querySelectorAll('.cell').forEach(c => {
      c.innerHTML = '';
      c.classList.remove('selected', 'blink', 'player-piece', 'end-square');
    });

    let {s, e, pieces, playerPiece} = this.curr;

    const startCell = document.querySelector(`[data-sq="${s}"]`);
    startCell.innerHTML = '<span class="start-marker">S</span>';

    // End square: checkered flag
    let endCell = document.querySelector(`[data-sq="${e}"]`);
    endCell.textContent = '🏁';
    endCell.classList.add('end-square');

    pieces.forEach(p => {
      const cell = document.querySelector(`[data-sq="${p.square}"]`);
      cell.innerHTML = pieceHTML(p.type, false);
    });

    let me = document.querySelector(`[data-sq="${this.pos}"]`);
    me.innerHTML = pieceHTML(playerPiece, true);
    me.classList.add('player-piece');
    if (this.selected) me.classList.add('selected');

    this.drawArrows();
  }

  drawArrows() {
    let svg = document.getElementById('arrows');
    svg.innerHTML = svg.innerHTML.split('</defs>')[0] + '</defs>';
    if (!document.getElementById('toggleHints').checked) return;

    const colors = JSON.parse(svg.dataset.pathColors || '["#4a9eff","#ff6b35","#3ddc84","#f5c518","#c77dff"]');
    const size = 60;

    this.curr.sol.forEach((path, pi) => {
      const color = colors[pi % colors.length];
      for (let i = 0; i < path.length - 1; i++) {
        let a = toCoord(path[i]), b = toCoord(path[i+1]);
        // Slightly offset parallel paths so they don't overlap
        const offset = (pi - (this.curr.sol.length - 1) / 2) * 4;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.x*size + 30 + offset);
        line.setAttribute('y1', (7-a.y)*size + 30 + offset);
        line.setAttribute('x2', b.x*size + 30 + offset);
        line.setAttribute('y2', (7-b.y)*size + 30 + offset);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('opacity', '0.75');
        line.setAttribute('marker-end', `url(#arrow${pi % colors.length})`);
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

  blinkAttackers(from, to) {
    // `from` = player's current position, `to` = attempted destination
    let {pieces, playerPiece} = this.curr;
    let board = {};
    pieces.forEach(p => board[p.square] = p.type);

    // Collect all (attacker, attacked-square) pairs that explain this invalid move.
    // Two cases:
    //   1. The destination itself is attacked.
    //   2. An intermediate square on the player's ray is attacked (sliding pieces).
    const lines = [];
    const seen  = new Set(); // avoid duplicate arrows

    // Helper: add all pieces attacking `sq`, drawing arrow from attacker to sq
    const addAttackersOf = (sq) => {
      for (const [attSq, target] of PieceEngine.getAttackLines(sq, pieces, board)) {
        const key = attSq + '>' + target;
        if (!seen.has(key)) {
          seen.add(key);
          lines.push([attSq, target]);
          const el = document.querySelector(`[data-sq="${attSq}"]`);
          if (el) el.classList.add('blink');
        }
      }
    };

    // Case 1: destination attacked
    addAttackersOf(to);

    // Case 2: walk the ray from `from` toward `to`; check each intermediate square.
    // Knights jump so they have no intermediate squares.
    const a = toCoord(from), b = toCoord(to);
    const adx = Math.abs(b.x - a.x), ady = Math.abs(b.y - a.y);
    const isKnight = (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
    if (!isKnight) {
      const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
      let x = a.x + dx, y = a.y + dy;
      while (x !== b.x || y !== b.y) {
        const mid = toSquare(x, y);
        if (PieceEngine.getAttackMap(pieces, board).has(mid)) {
          addAttackersOf(mid);
        }
        x += dx; y += dy;
      }
    }

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
      this.moveCount++;

      if (sq === this.curr.e) {
        const optMoves = this.curr.complexity;
        if (this.moveCount === optMoves) {
          // Optimal solution reached
          let t = (performance.now() - this.startTime) / 1000;
          this.lastTime = t;
          this.setStatus('✓ Solved in ' + t.toFixed(2) + 's!');
          setTimeout(() => this.nextLevel(), 1200);
        } else {
          // Reached end but not in optimal number of moves
          this.invalid++;
          const extra = this.moveCount - optMoves;
          this.setStatus(`You reached the flag in ${this.moveCount} moves — optimal is ${optMoves}. Try again!`);
          // Reset to start but keep move count visible; redo the puzzle
          setTimeout(() => this.reset(), 1800);
        }
      } else {
        this.setStatus(`Move piece · ${this.moveCount} move${this.moveCount !== 1 ? 's' : ''} so far`);
      }

      this.render();
    } else {
      this.invalid++;
      this.setStatus('Invalid move');
      this.blinkAttackers(this.pos, sq);
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
  // Clicks may land on a child span (piece badge) rather than the cell itself.
  // Walk up to the nearest ancestor that carries data-sq.
  const cell = e.target.closest('[data-sq]');
  if (!cell || !game.curr) return;
  game.handleClick(cell.dataset.sq);
});
