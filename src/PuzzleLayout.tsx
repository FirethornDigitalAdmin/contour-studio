import { useState } from 'react';
import type { Settings } from './types';
import { puzzlePaths } from './puzzle';
export default function PuzzleLayout({settings:s}:{settings:Settings}) {
  const [numbers,setNumbers]=useState(false);
  const inset=s.frame_mode==='none'?0:s.frame_width,w=s.width-2*inset,h=s.height-2*inset,tw=w/s.puzzle_columns,th=h/s.puzzle_rows;
  const paths=puzzlePaths(s);
  return <div className="collection-layout puzzle-layout"><div><span className="eyebrow">YOUR MAP JIGSAW</span><h3>{s.puzzle_columns*s.puzzle_rows} pieces of {s.name || 'your world'}</h3><p>{s.width} × {s.height} mm · {s.puzzle_style==='classic'?'Classic hand-cut pattern':'Round knobs'} · {s.puzzle_clearance} mm seams</p></div>
    <svg viewBox={`-8 -8 ${s.width+16} ${s.height+16}`} role="img" aria-label={`${s.puzzle_columns} columns and ${s.puzzle_rows} rows of interlocking puzzle pieces`}>
      <rect width={s.width} height={s.height} rx="2" fill={s.frame_mode==='none'?s.colour_ground:s.colour_frame}/><rect x={inset} y={inset} width={w} height={h} fill={s.colour_ground}/>
      <g transform={`translate(0 ${s.height}) scale(1 -1)`}>{paths.map((d,i)=><path key={i} d={d} stroke="#20372c" strokeWidth={Math.max(.35,s.puzzle_clearance)} fill="none"/>)}</g>
      {numbers&&Array.from({length:s.puzzle_columns*s.puzzle_rows},(_,i)=>{const row=Math.floor(i/s.puzzle_columns),col=i%s.puzzle_columns;return <text key={i} x={inset+(col+.5)*tw} y={s.height-inset-(row+.5)*th} fontSize={Math.min(tw,th)/8} textAnchor="middle" fill="#20372c">{row+1} · {col+1}</text>;})}
    </svg><button type="button" className="puzzle-number-toggle" aria-pressed={numbers} onClick={()=>setNumbers(!numbers)}>{numbers?'Hide piece numbers':'Show piece numbers'}</button><p className="hint">North at the top · Layout preview; map detail appears after generation. The export includes a numbered assembly guide and a matching fit-test pair.</p></div>;
}
