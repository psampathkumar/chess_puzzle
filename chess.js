const FILES = ['a','b','c','d','e','f','g','h'];

const PIECE_ICONS = {
  rook:'♜', bishop:'♝', knight:'♞',
  queen:'♛', king:'♚', pawn:'♟',
  player:'♖'
};

// removed king + pawn (performance reasons)
const PLAYER_PIECES = ['rook','bishop','knight','queen'];

const PIECE_LIMITS = {
  pawn:8, rook:2, bishop:2,
  knight:2, queen:1, king:1
};

function toCoord(s){ return {x:FILES.indexOf(s[0]), y:+s[1]-1}; }
function toSquare(x,y){ return FILES[x]+(y+1); }
function inBounds(x,y){ return x>=0&&x<8&&y>=0&&y<8; }

class PieceEngine {

  static directions = {
    rook:[[1,0],[-1,0],[0,1],[0,-1]],
    bishop:[[1,1],[1,-1],[-1,1],[-1,-1]],
    queen:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],
    knight:[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]],
    king:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
  };

  static getMoves(type, from, board){
    let {x,y} = toCoord(from);
    let moves = [];

    if(type==='pawn'){
      [[-1,-1],[1,-1]].forEach(([dx,dy])=>{
        let nx=x+dx, ny=y+dy;
        if(inBounds(nx,ny)) moves.push(toSquare(nx,ny));
      });
      return moves;
    }

    if(type==='knight' || type==='king'){
      this.directions[type].forEach(([dx,dy])=>{
        let nx=x+dx, ny=y+dy;
        if(inBounds(nx,ny)) moves.push(toSquare(nx,ny));
      });
      return moves;
    }

    for(let [dx,dy] of this.directions[type]){
      let nx=x+dx, ny=y+dy;
      while(inBounds(nx,ny)){
        let sq = toSquare(nx,ny);
        moves.push(sq);
        if(board[sq]) break;
        nx+=dx; ny+=dy;
      }
    }
    return moves;
  }

  static getAttackMap(pieces,board){
    let set = new Set();
    pieces.forEach(p=>{
      this.getMoves(p.type,p.square,board).forEach(m=>set.add(m));
      set.add(p.square);
    });
    return set;
  }

  static getAttackLines(target,pieces,board){
    let lines=[];
    pieces.forEach(p=>{
      let moves=this.getMoves(p.type,p.square,board);
      if(moves.includes(target)){
        lines.push([p.square,target]);
      }
    });
    return lines;
  }
}

function isPathSafe(from,to,attacked){
  let a=toCoord(from), b=toCoord(to);
  let dx=Math.sign(b.x-a.x), dy=Math.sign(b.y-a.y);
  let x=a.x+dx, y=a.y+dy;

  while(x!==b.x || y!==b.y){
    if(attacked.has(toSquare(x,y))) return false;
    x+=dx; y+=dy;
  }
  return true;
}

// Returns the set of squares reachable in one safe move from `sq`
function safeMoves(sq, board, attacked, pieceType){
  let moves = [];
  for(let m of PieceEngine.getMoves(pieceType, sq, board)){
    if(!attacked.has(m) && isPathSafe(sq, m, attacked)) moves.push(m);
  }
  return moves;
}

// Bidirectional BFS — returns {fwd, bwd, dist} or null if unreachable.
// fwd[sq] = distance from start, bwd[sq] = distance from end.
// dist = total shortest path length (in nodes, so moves = dist-1).
function biDirBFS(start, end, board, attacked, pieceType){
  if(start === end) return null;

  // Each frontier is a Map: square -> distance
  let fwd = new Map([[start, 0]]);
  let bwd = new Map([[end,   0]]);

  let fQueue = [start];
  let bQueue = [end];

  let best = Infinity;

  // Expand one level of a frontier, return true if we found a meeting point
  function expand(queue, myDist, otherDist){
    let next = [];
    let found = false;
    for(let sq of queue){
      let d = myDist.get(sq);
      for(let m of safeMoves(sq, board, attacked, pieceType)){
        if(myDist.has(m)) continue;          // already seen from this side
        myDist.set(m, d + 1);
        next.push(m);
        if(otherDist.has(m)){
          let candidate = (d + 1) + otherDist.get(m);
          if(candidate < best) best = candidate;
          found = true;
        }
      }
    }
    return {next, found};
  }

  // Alternate expanding the smaller frontier
  while(fQueue.length && bQueue.length){
    if(fwd.size <= bwd.size){
      let {next, found} = expand(fQueue, fwd, bwd);
      fQueue = next;
      // Once we've found a meeting point, finish expanding this level fully
      // then stop — any path longer than best can be pruned
      if(found && fwd.get(fQueue[0] ?? '') > best) break;
    } else {
      let {next, found} = expand(bQueue, bwd, fwd);
      bQueue = next;
      if(found && bwd.get(bQueue[0] ?? '') > best) break;
    }
    if(best < Infinity){
      // Check if further expansion can possibly improve
      let fMin = fQueue.length ? fwd.get(fQueue[0]) : Infinity;
      let bMin = bQueue.length ? bwd.get(bQueue[0]) : Infinity;
      if(fMin + bMin >= best) break;
    }
  }

  if(best === Infinity) return null;
  return {fwd, bwd, dist: best + 1}; // dist in nodes
}

// Collect all shortest paths using the distance maps from biDirBFS.
// Walks a DAG forward from start: only step to squares where fwd[m] = fwd[sq]+1
// and fwd[m] + bwd[m] = best total dist-1 (i.e. the square is on a shortest path).
function collectPaths(start, end, board, attacked, pieceType, fwd, bwd, totalDist){
  const targetMoves = totalDist - 1; // number of edges

  let results = [];
  const RESULT_CAP = 50;
  const NODE_CAP   = 8000;
  let nodes = 0;

  // stack entries: [square, path_so_far]
  let stack = [[start, [start]]];

  while(stack.length){
    if(++nodes > NODE_CAP || results.length >= RESULT_CAP) break;

    let [sq, path] = stack.pop();
    let d = fwd.get(sq);

    if(sq === end){
      if(path.length === totalDist) results.push(path);
      continue;
    }

    for(let m of safeMoves(sq, board, attacked, pieceType)){
      let md = fwd.get(m);
      // m must be exactly one step further forward
      if(md !== d + 1) continue;
      // m must sit on a shortest path to end
      let bd = bwd.get(m);
      if(bd === undefined) continue;
      if(md + bd !== targetMoves) continue;

      stack.push([m, [...path, m]]);
    }
  }

  return results;
}

// Main entry: find all shortest paths from start to end.
// Returns [] if unreachable or path is too short.
function bfsAll(start, end, board, attacked, pieceType){
  let r = biDirBFS(start, end, board, attacked, pieceType);
  if(!r) return [];
  if(r.dist < 3) return []; // need at least 2 moves (3 nodes)

  return collectPaths(start, end, board, attacked, pieceType, r.fwd, r.bwd, r.dist);
}

// Cheap reachability check — just bidir BFS, no path collection.
// Returns minimum path length in nodes, or 0 if unreachable / too short.
function cheapReachable(start, end, board, attacked, pieceType){
  let r = biDirBFS(start, end, board, attacked, pieceType);
  if(!r || r.dist < 3) return 0;
  return r.dist;
}

class Generator {

  constructor(level){ this.level=level; }

  rand(){ return toSquare(Math.floor(Math.random()*8),Math.floor(Math.random()*8)); }

  generate(){
    const startTime = performance.now();
    const TIME_LIMIT = 1800;

    outer:
    while(performance.now() - startTime < TIME_LIMIT){

      // 1. Pick start, end, player piece
      let s = this.rand(), e = this.rand();
      if(s === e) continue;

      let playerPiece = PLAYER_PIECES[Math.floor(Math.random() * PLAYER_PIECES.length)];

      // 2. Confirm start→end is reachable on empty board (trivially fast)
      if(!cheapReachable(s, e, {}, new Set(), playerPiece)) continue;

      // 3. Incrementally add pieces one at a time.
      //    After each placement, cheapReachable validates the path still exists.
      //    If not, roll back that piece and try a different one.
      //    This means we never call the expensive full bfsAll until everything is settled.
      let board = {}, pieces = [];
      let counts = {pawn:0, rook:0, bishop:0, knight:0, queen:0, king:0};
      const target = this.level - 1;

      for(let i = 0; i < target; i++){
        let placed = false;

        for(let tries = 0; tries < 40; tries++){
          if(performance.now() - startTime > TIME_LIMIT) break outer;

          let type = Object.keys(PIECE_LIMITS)[Math.floor(Math.random() * 6)];
          if(counts[type] >= PIECE_LIMITS[type]) continue;

          let sq = this.rand();
          if(sq === s || sq === e || board[sq]) continue;

          // Tentatively place
          pieces.push({type, square: sq});
          board[sq] = type;
          counts[type]++;

          let atk = PieceEngine.getAttackMap(pieces, board);

          if(atk.has(s) || atk.has(e) || !cheapReachable(s, e, board, atk, playerPiece)){
            // Doesn't work — roll back
            pieces.pop();
            delete board[sq];
            counts[type]--;
            continue;
          }

          placed = true;
          break;
        }

        if(!placed) continue outer; // couldn't fill this slot — restart
      }

      // 4. All pieces placed and path confirmed cheap. Now get full solutions.
      let atk = PieceEngine.getAttackMap(pieces, board);
      let sol = bfsAll(s, e, board, atk, playerPiece);

      if(sol.length && sol[0].length >= 3){
        return {
          s, e, pieces, sol,
          playerPiece,
          complexity: sol[0].length * pieces.length
        };
      }
    }

    // fallback
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

function createBoard(){
  let b=document.getElementById('board');
  b.innerHTML='';

  for(let r=7;r>=0;r--){
    for(let c=0;c<8;c++){
      let d=document.createElement('div');
      d.className='cell '+((r+c)%2?'dark':'light');
      d.dataset.sq=toSquare(c,r);
      b.appendChild(d);
    }
  }

  let svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('width',480);
  svg.setAttribute('height',480);

  svg.innerHTML=`<defs>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M0,0 L6,3 L0,6 Z" fill="blue"/>
    </marker>
  </defs>`;

  svg.id='arrows';
  b.appendChild(svg);
}

class Game {

  constructor(){
    this.level=1;
    this.queue=[];
    this.history=[];
  }

  preload(){
    while(this.queue.length<2){
      this.queue.push(new Generator(this.level).generate());
    }
  }

  nextLevel(){
    if(this.curr){
      this.history.push({time:this.lastTime,invalid:this.invalid});
      this.renderHistory();
    }

    this.preload();
    this.curr=this.queue.shift();
    this.level++;
    this.reset();
  }

  redo(){
    this.reset();
  }

  reset(){
    this.pos=this.curr.s;
    this.selected=false;
    this.invalid=0;
    this.startTime=performance.now();

    let msg = `Piece: ${this.curr.playerPiece} | Complexity: ${this.curr.complexity}`;
    if(this.curr.timeout) msg = "⚠ fallback puzzle | " + msg;

    this.setStatus(msg);
    this.render();
  }

  setStatus(m){
    document.getElementById('status').textContent=m;
  }

  render(){
    document.querySelectorAll('.cell').forEach(c=>{
      c.textContent='';
      c.classList.remove('selected','blink');
    });

    let {s,e,pieces,playerPiece}=this.curr;

    document.querySelector(`[data-sq="${s}"]`).textContent='S';
    document.querySelector(`[data-sq="${e}"]`).textContent='X';

    pieces.forEach(p=>{
      document.querySelector(`[data-sq="${p.square}"]`).textContent=PIECE_ICONS[p.type];
    });

    let me=document.querySelector(`[data-sq="${this.pos}"]`);
    me.textContent=PIECE_ICONS[playerPiece] || PIECE_ICONS.player;

    if(this.selected) me.classList.add('selected');

    this.drawArrows();
  }

  drawArrows(){
    let svg=document.getElementById('arrows');
    svg.innerHTML=svg.innerHTML.split('</defs>')[0]+'</defs>';

    if(!document.getElementById('toggleHints').checked) return;

    let size=60;

    this.curr.sol.forEach(path=>{
      for(let i=0;i<path.length-1;i++){
        let a=toCoord(path[i]), b=toCoord(path[i+1]);

        let line=document.createElementNS('http://www.w3.org/2000/svg','line');

        line.setAttribute('x1',a.x*size+30);
        line.setAttribute('y1',(7-a.y)*size+30);
        line.setAttribute('x2',b.x*size+30);
        line.setAttribute('y2',(7-b.y)*size+30);

        line.setAttribute('stroke','blue');
        line.setAttribute('stroke-width','2');
        line.setAttribute('opacity','0.4');
        line.setAttribute('marker-end','url(#arrow)');

        svg.appendChild(line);
      }
    });
  }

  drawAttackLines(lines){
    let svg=document.getElementById('arrows');
    let size=60;

    lines.forEach(([from,to])=>{
      let a=toCoord(from), b=toCoord(to);

      let line=document.createElementNS('http://www.w3.org/2000/svg','line');

      line.setAttribute('x1',a.x*size+30);
      line.setAttribute('y1',(7-a.y)*size+30);
      line.setAttribute('x2',b.x*size+30);
      line.setAttribute('y2',(7-b.y)*size+30);

      line.setAttribute('stroke','red');
      line.setAttribute('stroke-width','3');
      line.setAttribute('opacity','0.6');

      svg.appendChild(line);

      setTimeout(()=>line.remove(),600);
    });
  }

  renderHistory(){
    let ul=document.getElementById('list');
    ul.innerHTML='';

    this.history.forEach((h,i)=>{
      let li=document.createElement('li');
      li.textContent=`#${i+1} - ${h.time?.toFixed(2)||'-'}s, ${h.invalid} mistakes`;
      ul.appendChild(li);
    });
  }

  blinkAttackers(square){
    let {pieces}=this.curr;
    let board={};
    pieces.forEach(p=>board[p.square]=p.type);

    let lines = PieceEngine.getAttackLines(square,pieces,board);

    lines.forEach(([from])=>{
      let el=document.querySelector(`[data-sq="${from}"]`);
      if(el) el.classList.add('blink');
    });

    this.drawAttackLines(lines);
  }
}

const game = new Game();
createBoard();
game.nextLevel();

document.getElementById('toggleHints')
  .addEventListener('change',()=>game.render());

document.getElementById('board').addEventListener('click',e=>{
  if(!e.target.dataset.sq) return;

  let sq=e.target.dataset.sq;
  let {pieces,playerPiece}=game.curr;

  let board={};
  pieces.forEach(p=>board[p.square]=p.type);

  let atk=PieceEngine.getAttackMap(pieces,board);

  if(!game.selected){
    if(sq===game.pos){
      game.selected=true;
      game.setStatus('Move piece');
      game.render();
    }
    return;
  }

  let moves=PieceEngine.getMoves(playerPiece,game.pos,board);

  if(moves.includes(sq) && !atk.has(sq) && isPathSafe(game.pos,sq,atk)){
    game.pos=sq;

    if(sq===game.curr.e){
      let t=(performance.now()-game.startTime)/1000;
      game.lastTime=t;
      game.setStatus('Solved in '+t.toFixed(2)+'s');
      setTimeout(()=>game.nextLevel(),1000);
    } else {
      game.setStatus('Move piece');
    }

    game.render();

  } else {
    game.invalid++;
    game.setStatus('Invalid move');
    game.blinkAttackers(sq);
  }
});
