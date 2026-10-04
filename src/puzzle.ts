import type { Settings } from './types';
type Point = [number, number];
// Kept in step with backend.formats.puzzle_edge: shared boundaries, sampled at 12 points per cubic.
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
export function puzzlePaths(s:Settings):string[] {
  const inset=s.frame_mode==='none'?0:s.frame_width,w=s.width-2*inset,h=s.height-2*inset,tw=w/s.puzzle_columns,th=h/s.puzzle_rows,size=Math.min(tw,th),r=size*.18,chord=r*Math.sqrt(1-.35*.35);
  const paths:string[]=[];
  const line=(points:Point[])=>points.map(([x,y],i)=>`${i?'L':'M'}${x},${y}`).join(' ');
  for(let row=0;row<s.puzzle_rows;row++)for(let col=1;col<s.puzzle_columns;col++) {
    const x=inset+col*tw,y=inset+(row+.5)*th;
    paths.push(s.puzzle_style==='classic'?line(puzzleEdge(th,size,1,row,col,s.puzzle_seed??1).map(([u,v])=>[x+v,inset+row*th+u])):`M${x},${inset+row*th} L${x},${y-chord} A${r},${r} 0 1 ${(row+col-1)%2===0?0:1} ${x},${y+chord} L${x},${inset+(row+1)*th}`);
  }
  for(let row=1;row<s.puzzle_rows;row++)for(let col=0;col<s.puzzle_columns;col++) {
    const x=inset+(col+.5)*tw,y=inset+row*th;
    paths.push(s.puzzle_style==='classic'?line(puzzleEdge(tw,size,0,row,col,s.puzzle_seed??1).map(([u,v])=>[inset+col*tw+u,y+v])):`M${inset+col*tw},${y} L${x-chord},${y} A${r},${r} 0 1 ${(row+col-1)%2===0?1:0} ${x+chord},${y} L${inset+(col+1)*tw},${y}`);
  }
  return paths;
}
export function puzzlePresets(s:Settings) {
  const border=s.frame_mode==='none'?0:2*s.frame_width,w=s.width-border,h=s.height-border;
  return [{label:'Easy',target:9},{label:'Balanced',target:25},{label:'Challenging',target:64}].map(({label,target})=>{
    const columns=Math.max(2,Math.min(10,Math.round(Math.sqrt(target*w/h)),Math.floor(w/30)));
    const rows=Math.max(1,Math.min(10,Math.round(target/columns),Math.floor(h/30)));
    return {label,columns,rows,count:columns*rows};
  });
}
