import type { Settings } from './types';
import { Field, NumberField } from './Controls';
import { centreLongitude } from './world';

type Change = (values: Partial<Settings>) => void;
export function coordinatesText(s: Settings) {
  const lat = (s.bounds.north + s.bounds.south) / 2, lon = centreLongitude(s.bounds);
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
}
const fontFamily = (font?: string) => font === 'serif' ? 'Georgia, "DejaVu Serif", serif' : '"DejaVu Sans", Verdana, sans-serif';
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div className="text-choice"><span>{label}</span><div className="segmented" role="group" aria-label={label}>{options.map(([option, text]) => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{text}</button>)}</div></div>;
}

/** Lettering on the front face of the frame. */
export function CaptionEditor({ settings: s, onChange }: { settings: Settings; onChange: Change }) {
  const automatic = `${(s.name || 'Your artwork name').toUpperCase()} · ${coordinatesText(s)}`;
  const text = s.caption_text?.trim() || automatic;
  const flat = s.frame_width - s.inner_bevel - s.outer_bevel, size = Math.min(s.caption_size ?? 3, flat * .72);
  const contoured = s.frame_contour !== 'flat';
  return <div className="control-block text-editor">
    <label className="toggle-row"><input type="checkbox" checked={s.front_caption} onChange={event => onChange({ front_caption: event.target.checked })}/> Lettering on the frame</label>
    {s.front_caption && <>
      <Field label="Your words"><input value={s.caption_text ?? ''} maxLength={80} placeholder={automatic} onChange={event => onChange({ caption_text: event.target.value })}/></Field>
      <div className="text-quick"><button type="button" onClick={() => onChange({ caption_text: '' })}>Name & coordinates</button><button type="button" onClick={() => onChange({ caption_text: s.name })}>Name only</button><button type="button" onClick={() => onChange({ caption_text: `${s.caption_text?.trim() || s.name} · ${new Date().getFullYear()}` })}>Add the year</button></div>
      <div className={`caption-rail ${s.caption_style ?? 'raised'}`} style={{ justifyContent: s.caption_align === 'left' ? 'flex-start' : s.caption_align === 'right' ? 'flex-end' : 'center', background: s.colour_frame }} aria-label="Frame lettering preview"><span style={{ fontFamily: fontFamily(s.caption_font), color: s.caption_style === 'engraved' ? 'rgba(0,0,0,.45)' : s.multicolour && s.frame_mode === 'separate' ? s.colour_markers : 'rgba(255,255,255,.82)' }}>{text}</span></div>
      <Choice label="Where" value={s.caption_position ?? 'bottom'} options={[['bottom', 'Bottom edge'], ['top', 'Top edge']]} onChange={caption_position => onChange({ caption_position })}/>
      <Choice label="Line up" value={s.caption_align ?? 'centre'} options={[['left', 'Left'], ['centre', 'Centre'], ['right', 'Right']]} onChange={caption_align => onChange({ caption_align })}/>
      <Choice label="Finish" value={contoured ? 'raised' : s.caption_style ?? 'raised'} options={[['raised', 'Raised'], ['engraved', 'Engraved']]} onChange={caption_style => onChange({ caption_style })}/>
      <Choice label="Lettering" value={s.caption_font ?? 'sans'} options={[['sans', 'Clean sans'], ['serif', 'Classic serif']]} onChange={caption_font => onChange({ caption_font })}/>
      <NumberField label="Letter size · mm" value={s.caption_size ?? 3} min={2} max={12} step={.5} onChange={caption_size => onChange({ caption_size })}/>
      <p className="hint">Lettering stays on the flat face of the frame, so it prints about {size.toFixed(1)} mm tall on this {s.frame_width} mm border{size < (s.caption_size ?? 3) ? '. Widen the border for larger letters' : ''}. Long lines shrink to fit the width.{contoured ? ' Frames that follow the land use raised lettering.' : ''}{s.multicolour ? s.frame_mode === 'separate' && (s.caption_style ?? 'raised') === 'raised' ? ' Raised letters print in your special-places colour.' : ' For letters in a second colour, use a separate frame with raised lettering.' : ''}</p>
    </>}
  </div>;
}

const plaqueShapes: [NonNullable<Settings['plaque_shape']>, string][] = [['ticket', 'Scooped'], ['rounded', 'Rounded'], ['rectangle', 'Square'], ['oval', 'Oval']];
function plaquePath(shape: string, w: number, h: number) {
  const r = Math.min(h * .2, 6);
  if (shape === 'oval') return `M0,${h / 2} a${w / 2},${h / 2} 0 1 0 ${w},0 a${w / 2},${h / 2} 0 1 0 ${-w},0 Z`;
  if (shape === 'rounded') return `M${r},0 H${w - r} a${r},${r} 0 0 1 ${r},${r} V${h - r} a${r},${r} 0 0 1 ${-r},${r} H${r} a${r},${r} 0 0 1 ${-r},${-r} V${r} a${r},${r} 0 0 1 ${r},${-r} Z`;
  if (shape === 'ticket') return `M${r},0 H${w - r} a${r},${r} 0 0 0 ${r},${r} V${h - r} a${r},${r} 0 0 0 ${-r},${r} H${r} a${r},${r} 0 0 0 ${-r},${-r} V${r} a${r},${r} 0 0 0 ${r},${-r} Z`;
  return `M0,0 H${w} V${h} H0 Z`;
}

/** A separate nameplate printed with the artwork. */
export function PlaqueEditor({ settings: s, onChange }: { settings: Settings; onChange: Change }) {
  const shape = s.plaque_shape ?? 'ticket', width = s.plaque_width ?? 90, engraved = s.plaque_style === 'engraved';
  const title = s.plaque_title?.trim() || s.name || 'Your place', detail = s.plaque_detail?.trim() || ((s.plaque_coordinates ?? true) ? coordinatesText(s) : '');
  const lines = [{ text: (s.plaque_capitals ?? true) ? title.toUpperCase() : title, size: width * .115 }, ...(s.plaque_subtitle?.trim() ? [{ text: s.plaque_subtitle.trim(), size: width * .058 }] : []), ...(detail ? [{ text: detail, size: width * .046 }] : [])];
  // Approximate the engine's fit-to-width so the sketch keeps the printed proportions.
  const inner = width * (shape === 'oval' ? .74 : 1) - 2 * Math.max(4, width * .07) - ((s.plaque_border ?? true) ? 4.4 : 0);
  const fitted = lines.map((line, index) => ({ ...line, size: Math.min(line.size, inner / Math.max(1, line.text.length) / .62) })).map((line, index, all) => index ? { ...line, size: Math.min(line.size, all[0].size * (all.length === 3 ? [.66, .56][index - 1] : .62) / .72) } : line);
  const gap = Math.max(1.6, fitted[0].size * .3), total = fitted.reduce((sum, line) => sum + line.size * .74, 0) + gap * (fitted.length - 1);
  const height = (total + 2 * (Math.max(4, width * .07) + ((s.plaque_border ?? true) ? 2.7 : 0))) * (shape === 'oval' ? 1.3 : 1);
  const ink = engraved ? 'rgba(0,0,0,.42)' : s.multicolour ? s.colour_markers : 'rgba(255,255,255,.85)';
  let y = (height - total) / 2;
  return <div className="control-block text-editor">
    <label className="toggle-row"><input type="checkbox" checked={!!s.plaque} onChange={event => onChange({ plaque: event.target.checked })}/> Add a matching plaque</label>
    {s.plaque && <>
      <svg className="plaque-preview" viewBox={`-4 -4 ${width + 8} ${height + 8}`} role="img" aria-label={`Plaque preview: ${lines.map(line => line.text).join(', ')}`}>
        <path d={plaquePath(shape, width, height)} fill={s.colour_frame}/>
        {(s.plaque_border ?? true) && <path d={plaquePath(shape, width - 4.2, height - 4.2)} transform="translate(2.1 2.1)" fill="none" stroke={ink} strokeWidth={1.2}/>}
        {fitted.map((line, index) => { const baseline = y + line.size * .74; y = baseline + gap; return <text key={index} x={width / 2} y={baseline} textAnchor="middle" fontSize={line.size} fontWeight={700} fontFamily={fontFamily(s.plaque_font ?? 'serif')} fill={ink}>{line.text}</text>; })}
      </svg>
      <p className="hint" role="status">About {width} × {height.toFixed(0)} mm · {engraved ? '2.4' : '3.2'} mm thick · prints flat, lettering up. The 3D preview shows the exact printed lettering after you make the model.</p>
      <Field label="Title"><input value={s.plaque_title ?? ''} maxLength={40} placeholder={s.name} onChange={event => onChange({ plaque_title: event.target.value })}/></Field>
      <Field label="Second line"><input value={s.plaque_subtitle ?? ''} maxLength={60} placeholder="A date, a dedication, a memory" onChange={event => onChange({ plaque_subtitle: event.target.value })}/></Field>
      <Field label="Small print"><input value={s.plaque_detail ?? ''} maxLength={60} placeholder={(s.plaque_coordinates ?? true) ? coordinatesText(s) : 'Leave empty for none'} onChange={event => onChange({ plaque_detail: event.target.value })}/></Field>
      <label className="toggle-row"><input type="checkbox" checked={s.plaque_coordinates ?? true} onChange={event => onChange({ plaque_coordinates: event.target.checked })}/> Use the coordinates when small print is empty</label>
      <label className="toggle-row"><input type="checkbox" checked={s.plaque_capitals ?? true} onChange={event => onChange({ plaque_capitals: event.target.checked })}/> Title in capitals</label>
      <Choice label="Shape" value={shape} options={plaqueShapes} onChange={plaque_shape => onChange({ plaque_shape })}/>
      <Choice label="Finish" value={s.plaque_style ?? 'raised'} options={[['raised', 'Raised'], ['engraved', 'Engraved']]} onChange={plaque_style => onChange({ plaque_style })}/>
      <Choice label="Lettering" value={s.plaque_font ?? 'serif'} options={[['serif', 'Classic serif'], ['sans', 'Clean sans']]} onChange={plaque_font => onChange({ plaque_font })}/>
      <label className="toggle-row"><input type="checkbox" checked={s.plaque_border ?? true} onChange={event => onChange({ plaque_border: event.target.checked })}/> Border line</label>
      <NumberField label="Plaque width · mm" value={width} min={40} max={250} step={5} onChange={plaque_width => onChange({ plaque_width })}/>
      <p className="hint">{engraved ? 'Engraved letters are cut 0.8 mm into the plate.' : s.multicolour ? 'Raised letters and border print in your special-places colour on a frame-coloured plate.' : 'Raised letters stand 0.8 mm proud. For a second colour without an AMS, add a filament change at 2.4 mm in your slicer.'} The back is flat for adhesive or foam tape. It prints with every project type.</p>
    </>}
  </div>;
}
