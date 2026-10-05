import type { Settings } from './types';
type Point = [number, number];
// Kept in step with backend.formats: shared boundaries, sampled at 12 points per cubic.
const ROUND_TAB=.14, ROUND_SHIFT=.8, CORNER_JITTER=.05;
export function puzzleEdge(length:number,size:number,axis:number,row:number,col:number,seed:number):Point[] {
  const value=(seed*97+(row+1)*193+(col+1)*389+axis*769)%65521;
  const centre=length*(.42+(value%17)/100), scale=size*(.125+(Math.floor(value/17)%4)*.005), sign=Math.floor(value/68)%2?1:-1;
  const curves:Point[][]=[[[ -1.5,0],[-.9,0],[-.35,.08],[-.45,.3]],[[-.45,.3],[-.55,.55],[-.9,.7],[-.85,1.05]],[[-.85,1.05],[-.8,1.85],[.8,1.85],[.85,1.05]],[[.85,1.05],[.9,.7],[.55,.55],[.45,.3]],[[.45,.3],[.35,.08],[.9,0],[1.5,0]]];
  const points:Point[]=[[0,0],[centre-1.5*scale,0]];
  for(const [a,b,c,d] of curves) for(let i=1;i<=12;i++) {
    const t=i/12,u=1-t;
    const at=(k:number)=>u**3*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t**3*d[k];
    points.push([centre+at(0)*scale,sign*at(1)*scale]);
  }
  return [...points,[length,0]];
}
// Interior grid crossings wander by up to 5% of a piece; the outer edge stays straight.
export function puzzleCorner(row:number,col:number,columns:number,rows:number,tw:number,th:number,seed:number):Point {
  let x=col*tw,y=row*th;
  if(col>0&&col<columns&&row>0&&row<rows) {
    const value=(seed*131+(row+1)*557+(col+1)*811)%65521,size=Math.min(tw,th);
    x+=((value%41)/20-1)*CORNER_JITTER*size;
    y+=((Math.floor(value/41)%41)/20-1)*CORNER_JITTER*size;
  }
  return [x,y];
}
function boundary(a:Point,b:Point,edge:Point[],length:number):Point[] {
  const dx=b[0]-a[0],dy=b[1]-a[1],actual=Math.hypot(dx,dy),ux=dx/actual,uy=dy/actual;
  return edge.map(([u,v])=>[a[0]+ux*u*actual/length-uy*v,a[1]+uy*u*actual/length+ux*v]);
}
export function puzzleReach(tw:number,th:number,style:Settings['puzzle_style']) {
  return Math.min(tw,th)*((style??'rounded')==='rounded'?ROUND_TAB*(1+ROUND_SHIFT):.14*1.5+CORNER_JITTER);
}
export function puzzlePaths(s:Settings):string[] {
  const inset=s.frame_mode==='none'?0:s.frame_width,w=s.width-2*inset,h=s.height-2*inset,columns=s.puzzle_columns,rows=s.puzzle_rows,tw=w/columns,th=h/rows,size=Math.min(tw,th),r=size*ROUND_TAB,chord=r*Math.sqrt(1-ROUND_SHIFT*ROUND_SHIFT),seed=s.puzzle_seed??1;
  const paths:string[]=[];
  const line=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${inset+x},${inset+y}`).join(' ');
  const corner=(row:number,col:number)=>puzzleCorner(row,col,columns,rows,tw,th,seed);
  for(let row=0;row<rows;row++)for(let col=1;col<columns;col++) {
    const x=inset+col*tw,y=inset+(row+.5)*th;
    paths.push(s.puzzle_style==='classic'?line(boundary(corner(row,col),corner(row+1,col),puzzleEdge(th,size,1,row,col,seed).map(([u,v])=>[u,-v]),th)):`M${x},${inset+row*th} L${x},${y-chord} A${r},${r} 0 1 ${(row+col-1)%2===0?0:1} ${x},${y+chord} L${x},${inset+(row+1)*th}`);
  }
  for(let row=1;row<rows;row++)for(let col=0;col<columns;col++) {
    const x=inset+(col+.5)*tw,y=inset+row*th;
    paths.push(s.puzzle_style==='classic'?line(boundary(corner(row,col),corner(row,col+1),puzzleEdge(tw,size,0,row,col,seed),tw)):`M${inset+col*tw},${y} L${x-chord},${y} A${r},${r} 0 1 ${(row+col-1)%2===0?1:0} ${x+chord},${y} L${inset+(col+1)*tw},${y}`);
  }
  return paths;
}
export function puzzlePresets(s:Settings) {
  const border=s.frame_mode==='none'?0:2*s.frame_width,w=s.width-border,h=s.height-border;
  return [{label:'Easy',target:9},{label:'Balanced',target:25},{label:'Challenging',target:64},{label:'Expert',target:144}].map(({label,target})=>{
    const columns=Math.max(2,Math.min(20,Math.round(Math.sqrt(target*w/h)),Math.floor(w/30)));
    const rows=Math.max(1,Math.min(20,Math.round(target/columns),Math.floor(h/30)));
    return {label,columns,rows,count:columns*rows};
  });
}
