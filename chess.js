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

// bounded BFS
function bfsAll(start,end,board,attacked,pieceType){
  let q=[[start,[start]]];
  let res=[], min=1e9;
  let visited=new Map();
  visited.set(start,1);

  let steps = 0;
  const LIMIT = 5000;

  while(q.length){
    if(steps++ > LIMIT) return [];

    let [pos,path]=q.shift();

    if(path.length>min) continue;

    if(pos===end){
      min=path.length;
      res.push(path);
      continue;
    }

    for(let m of PieceEngine.getMoves(pieceType,pos,board)){
      if(attacked.has(m) || !isPathSafe(pos,m,attacked)) continue;

      let len = path.length+1;
      if(visited.has(m) && visited.get(m) < len) continue;

      visited.set(m,len);
      q.push([m,[...path,m]]);
    }
  }
  return res;
}

class Generator {

  constructor(level){ this.level=level; }

  rand(){ return toSquare(Math.floor(Math.random()*8),Math.floor(Math.random()*8)); }

  generate(){
    let startTime = performance.now();
    const LIMIT = 1500;

    while(performance.now()-startTime < LIMIT){

      let board={}, pieces=[];
      let counts={pawn:0,rook:0,bishop:0,knight:0,queen:0,king:0};

      let s=this.rand(), e=this.rand();
      if(s===e) continue;

      let playerPiece = PLAYER_PIECES[Math.floor(Math.random()*PLAYER_PIECES.length)];

      for(let i=0;i<this.level-1;i++){
        let tries=0;
        while(tries++<20){
          let type=Object.keys(PIECE_LIMITS)[Math.floor(Math.random()*6)];
          if(counts[type]>=PIECE_LIMITS[type]) continue;

          let sq=this.rand();
          if(sq===s||sq===e||board[sq]) continue;

          pieces.push({type,square:sq});
          board[sq]=type;
          counts[type]++;
          break;
        }
      }

      let atk = PieceEngine.getAttackMap(pieces,board);
      if(atk.has(s)||atk.has(e)) continue;

      let sol = bfsAll(s,e,board,atk,playerPiece);

      if(sol.length && sol[0].length>=3 && sol.length<=50){
        return {
          s,e,pieces,sol,
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
