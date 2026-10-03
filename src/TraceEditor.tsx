import { useEffect, useRef, useState, useMemo, lazy, Suspense } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Upload, Square, Pentagon, Hand, MousePointer2, Copy, Trash2, Undo2, Redo2, Plus, Minus, Scan, X, Check, Crosshair, RotateCw } from 'lucide-react';
import type { Settings, CustomBuilding, ReferenceImage } from './types';
import { longitudeSpan, polarArea } from './world';
import { toDrawing, toGeographic, tracingHeight, validOutline, type Point } from './tracing';
import { hostedWorkspace } from './hosted';
import { downloadUrl } from './distribution';
import './tracing.css';
const TraceSketch = lazy(() => import('./TraceSketch'));
type Tool = 'select' | 'rectangle' | 'outline' | 'image' | 'pan' | 'align';
type Drag = {
    start: Point;
    tool: Tool;
    original?: CustomBuilding;
    vertex?: number;
    rotate?: boolean;
    image?: ReferenceImage;
    view: Box;
    matrix: DOMMatrix;
};
type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type Footprints = {
    features: {
        geometry: {
            type: string;
            coordinates: number[][][] | number[][][][];
        };
    }[];
    attribution: string;
};
const EMPTY: CustomBuilding[] = [];
export default function TraceEditor({ settings: s, onChange, disabled, onUndo, onRedo, canUndo, canRedo }: {
    settings: Settings;
    onChange: (p: Partial<Settings>) => void;
    disabled: boolean;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
}) {
    const H = tracingHeight(s.bounds), buildings = s.custom_buildings ?? EMPTY;
    const svg = useRef<SVGSVGElement>(null), mapHost = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null), drag = useRef<Drag | null>(null), fileInput = useRef<HTMLInputElement>(null);
    const [tool, setTool] = useState<Tool>('rectangle'), [selected, setSelected] = useState<string | null>(null), [draft, setDraft] = useState<Point[]>([]), [temporary, setTemporary] = useState<CustomBuilding | null>(null), [imageDraft, setImageDraft] = useState<ReferenceImage | null>(null);
    const [height, setHeight] = useState(8), [message, setMessage] = useState(''), [view, setView] = useState<Box>({ x: 0, y: 0, w: 1000, h: H }), [footprints, setFootprints] = useState<Footprints | null>(null), [footprintStatus, setFootprintStatus] = useState(''), [footprintLoading, setFootprintLoading] = useState(false), [loadVersion, setLoadVersion] = useState(0), [anchors, setAnchors] = useState<Point[]>([]), [compare, setCompare] = useState(false), [mapError, setMapError] = useState('');
    const boundsKey = JSON.stringify(s.bounds);
    const footprintSettings = useRef(s);
    footprintSettings.current = s;
    const image = imageDraft ?? s.reference_image;
    const imageMatches = !!image && ["west", "south", "east", "north"].every(k => image.bounds[k as keyof typeof image.bounds] === s.bounds[k as keyof typeof s.bounds]);
    const chosen = buildings.find(b => b.id === selected);
    const drawn = useMemo(() => temporary ? buildings.map(b => temporary.id === b.id ? temporary : b) : buildings, [buildings, temporary]);
    function changeTool(next: Tool) { setTool(next); setDraft([]); setAnchors([]); setMessage(''); drag.current = null; setTemporary(null); setImageDraft(null); }
    useEffect(() => { setView({ x: 0, y: 0, w: 1000, h: H }); setDraft([]); setSelected(null); setTemporary(null); setImageDraft(null); drag.current = null; }, [boundsKey, H]);
    useEffect(() => {
        if (!mapHost.current || polarArea(s.bounds))
            return;
        let m: maplibregl.Map;
        try {
            m = new maplibregl.Map({ container: mapHost.current, interactive: false, attributionControl: { compact: true }, style: { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' } }, layers: [{ id: 'base', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.65, 'raster-opacity': 0.7 } }] } });
        }
        catch {
            setMapError('Street map unavailable. You can still use your image.');
            return;
        }
        map.current = m;
        const resize = new ResizeObserver(() => m.resize());
        resize.observe(mapHost.current);
        m.on('error', () => setMapError('Some map tiles could not load. Your image and drawing tools are still available.'));
        return () => { resize.disconnect(); m.remove(); map.current = null; };
    }, [polarArea(s.bounds)]);
    useEffect(() => {
        const m = map.current;
        if (!m)
            return;
        const ne = toGeographic([view.x + view.w, view.y], s.bounds), sw = toGeographic([view.x, view.y + view.h], s.bounds);
        const west = s.bounds.west + view.x / 1000 * longitudeSpan(s.bounds), east = west + view.w / 1000 * longitudeSpan(s.bounds);
        const fit = () => m.fitBounds([[west, sw[1]], [east, ne[1]]], { padding: 0, duration: 0 });
        fit();
        m.on('resize', fit);
        return () => { m.off('resize', fit); };
    }, [boundsKey, view]);
    useEffect(() => {
        setFootprints(null);
        if (hostedWorkspace) {
            setFootprintStatus('Street map for context. Exact source outlines load in the desktop app.');
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort('timeout'), 90000);
        setFootprintLoading(true);
        setFootprintStatus('Loading existing building outlines…');
        fetch('/api/footprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...footprintSettings.current, reference_image: null, custom_buildings: [] }), signal: controller.signal })
            .then(async (r) => { if (!r.ok)
            throw Error('Could not load existing outlines. You can still draw over your image.'); return await r.json() as Footprints; })
            .then(data => { if (!controller.signal.aborted) {
            setFootprints(data);
            setFootprintStatus(`${data.features.length.toLocaleString()} existing outlines · ${data.attribution}`);
        } })
            .catch(e => { if (controller.signal.reason === 'timeout')
            setFootprintStatus('Existing outlines took too long to load. You can still trace over your image.');
        else if (!controller.signal.aborted)
            setFootprintStatus(e.message); })
            .finally(() => { clearTimeout(timeout); if (!controller.signal.aborted || controller.signal.reason === 'timeout')
            setFootprintLoading(false); });
        return () => { clearTimeout(timeout); controller.abort(); };
    }, [boundsKey, s.building_source, loadVersion]);
    function point(e: React.PointerEvent): Point {
        const matrix = svg.current?.getScreenCTM();
        if (!matrix)
            return [0, 0];
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        return [p.x, p.y];
    }
    function inside(p: Point) { return p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= H; }
    function commit(building: CustomBuilding) {
        if (!validOutline(building.points.map(p => toDrawing(p, s.bounds)))) {
            setMessage('That outline crosses itself or is too small. Adjust the corners and try again.');
            return false;
        }
        onChange({ custom_buildings: buildings.some(b => b.id === building.id) ? buildings.map(b => b.id === building.id ? building : b) : [...buildings, building], buildings: true });
        setSelected(building.id);
        setMessage('Building saved. The 3D sketch updates immediately.');
        return true;
    }
    function add(points: Point[]) {
        if (buildings.length >= 500) {
            setMessage('This design already has 500 added buildings.');
            return;
        }
        if (points.some(p => !inside(p)) || !validOutline(points)) {
            setMessage('Draw a non-crossing outline inside the selected area.');
            return;
        }
        if (commit({ id: crypto.randomUUID(), label: `Building ${buildings.length + 1}`, height, points: points.map(p => toGeographic(p, s.bounds)) })) {
            setDraft([]);
            setTool('select');
        }
    }
    function down(e: React.PointerEvent, id?: string, vertex?: number, rotate = false) {
        if (disabled || e.button !== 0)
            return;
        e.stopPropagation();
        const p = point(e);
        svg.current?.focus({ preventScroll: true });
        if (tool === 'align') {
            const next = [...anchors, p];
            setAnchors(next);
            if (next.length === 4 && image) {
                const [a, b, c, d] = next;
                const source = Math.hypot(c[0] - a[0], c[1] - a[1]), target = Math.hypot(d[0] - b[0], d[1] - b[1]);
                if (source < 10 || target < 10) {
                    setMessage('Choose two landmarks farther apart.');
                    setAnchors([]);
                    return;
                }
                const angle = Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(c[1] - a[1], c[0] - a[0]), scale = target / source, cos = Math.cos(angle), sin = Math.sin(angle);
                const dx = image.x - a[0], dy = image.y - a[1];
                const nextImage = { ...image, x: b[0] + scale * (dx * cos - dy * sin), y: b[1] + scale * (dx * sin + dy * cos), width: image.width * scale, rotation: ((image.rotation + angle * 180 / Math.PI + 540) % 360) - 180 };
                if (nextImage.width < 10 || nextImage.width > 10000 || Math.abs(nextImage.x) > 5000 || Math.abs(nextImage.y) > 1e9) {
                    setMessage('Those landmarks produce an unusable alignment. Try again.');
                    setAnchors([]);
                    return;
                }
                onChange({ reference_image: nextImage });
                setTool('image');
                setAnchors([]);
                setMessage('Image aligned. Check another landmark before tracing.');
            }
            return;
        }
        if (tool === 'outline') {
            if (!inside(p))
                return;
            if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < view.w * 0.02) {
                add(draft);
                return;
            }
            if (draft.length >= 100) {
                setMessage('Use at most 100 corners per outline.');
                return;
            }
            let next = p;
            if (e.shiftKey && draft.length) {
                const a = draft.at(-1)!;
                next = Math.abs(p[0] - a[0]) > Math.abs(p[1] - a[1]) ? [p[0], a[1]] : [a[0], p[1]];
            }
            setDraft([...draft, next]);
            return;
        }
        if (tool === 'rectangle' && !inside(p))
            return;
        if (tool === 'select' && !id) {
            setSelected(null);
            return;
        }
        const original = buildings.find(b => b.id === id);
        if (original)
            setSelected(original.id);
        if (tool === 'image' && !imageMatches)
            return;
        drag.current = { start: p, tool, original, vertex, rotate, image: image ?? undefined, view, matrix: svg.current!.getScreenCTM()!.inverse() };
        svg.current?.setPointerCapture(e.pointerId);
    }
    function move(e: React.PointerEvent) {
        const d = drag.current;
        if (!d)
            return;
        const dp = new DOMPoint(e.clientX, e.clientY).matrixTransform(d.matrix), p: Point = [dp.x, dp.y], dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        if (d.tool === 'rectangle') {
            setDraft([d.start, [Math.max(0, Math.min(1000, p[0])), d.start[1]], [Math.max(0, Math.min(1000, p[0])), Math.max(0, Math.min(H, p[1]))], [d.start[0], Math.max(0, Math.min(H, p[1]))]]);
        }
        if (d.tool === 'image' && d.image)
            setImageDraft({ ...d.image, x: Math.max(-5000, Math.min(5000, d.image.x + dx)), y: Math.max(-1e9, Math.min(1e9, d.image.y + dy)) });
        if (d.tool === 'pan')
            setView({ ...d.view, x: d.view.x - dx, y: d.view.y - dy });
        if (d.tool === 'select' && d.original) {
            const original = d.original.points.map(v => toDrawing(v, s.bounds));
            const cx = original.reduce((a, p) => a + p[0], 0) / original.length, cy = original.reduce((a, p) => a + p[1], 0) / original.length;
            let angle = Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(d.start[1] - cy, d.start[0] - cx);
            if (e.shiftKey)
                angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
            const pts = original.map((q, i) => d.rotate ? [cx + (q[0] - cx) * Math.cos(angle) - (q[1] - cy) * Math.sin(angle), cy + (q[0] - cx) * Math.sin(angle) + (q[1] - cy) * Math.cos(angle)] as Point : d.vertex === undefined || d.vertex === i ? [q[0] + dx, q[1] + dy] as Point : q);
            if (pts.every(inside))
                setTemporary({ ...d.original, points: pts.map(q => toGeographic(q, s.bounds)) });
        }
    }
    function up(e: React.PointerEvent) {
        const d = drag.current;
        drag.current = null;
        if (svg.current?.hasPointerCapture(e.pointerId))
            svg.current.releasePointerCapture(e.pointerId);
        if (d?.tool === 'rectangle' && draft.length === 4)
            add(draft);
        if (d?.tool === 'select' && temporary)
            commit(temporary);
        if (d?.tool === 'image' && imageDraft)
            onChange({ reference_image: imageDraft });
        setTemporary(null);
        setImageDraft(null);
        if (d?.tool === 'rectangle')
            setDraft([]);
    }
    function cancel() { drag.current = null; setTemporary(null); setImageDraft(null); setDraft([]); setAnchors([]); }
    async function upload(file: File) {
        setMessage('Preparing image…');
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 25 * 1024 * 1024) {
            setMessage('Choose a PNG, JPEG or WebP image smaller than 25 MB.');
            return;
        }
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.src = url;
            await img.decode();
            if (img.width / img.height < 0.05 || img.width / img.height > 20)
                throw Error('Choose an image with a less extreme aspect ratio.');
            const canvas = document.createElement('canvas'), scale = Math.min(1, 1600 / Math.max(img.width, img.height));
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            const data = canvas.toDataURL('image/jpeg', 0.8);
            if (data.length > 1500000)
                throw Error('This image is too detailed to save. Try a smaller crop.');
            onChange({ reference_image: { data, bounds: { ...s.bounds }, x: 500, y: H / 2, width: 1000, aspect: img.width / img.height, rotation: 0, opacity: 0.6 } });
            changeTool('image');
            setMessage('Image ready. Drag it into place, then adjust size and rotation or match two landmarks.');
        }
        catch (e) {
            setMessage((e as Error).message || 'Could not open that image.');
        }
        finally {
            URL.revokeObjectURL(url);
        }
    }
    function patchImage(values: Partial<ReferenceImage>) { if (image)
        onChange({ reference_image: { ...image, ...values } }); }
    function zoom(factor: number) { setView(v => { const w = Math.max(60, Math.min(1800, v.w * factor)); return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - w * H / 1000) / 2, w, h: w * H / 1000 }; }); }
    function rotate(degrees: number) { if (!chosen)
        return; const pts = chosen.points.map(p => toDrawing(p, s.bounds)), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, a = degrees * Math.PI / 180; const next = pts.map(p => [cx + (p[0] - cx) * Math.cos(a) - (p[1] - cy) * Math.sin(a), cy + (p[0] - cx) * Math.sin(a) + (p[1] - cy) * Math.cos(a)] as Point); if (next.every(inside))
        commit({ ...chosen, points: next.map(p => toGeographic(p, s.bounds)) });
    else
        setMessage('Rotation would move this building outside the selected area.'); }
    function duplicate() { if (!chosen)
        return; if (buildings.length >= 500) {
        setMessage('Maximum 500 added buildings.');
        return;
    } const pts = chosen.points.map(p => toDrawing(p, s.bounds)); for (const offset of [15, -15, 0]) {
        const next = pts.map(p => [p[0] + offset, p[1] + offset] as Point);
        if (next.every(inside)) {
            commit({ ...chosen, id: crypto.randomUUID(), label: (chosen.label + ' copy').slice(0, 64), points: next.map(p => toGeographic(p, s.bounds)) });
            return;
        }
    } }
    const hint = tool === 'rectangle' ? 'Drag across the building. Then select it to move or adjust its corners.' : tool === 'outline' ? 'Tap each corner, then Done or the first corner. Hold Shift for straight edges.' : tool === 'image' ? 'Drag your image into place. Adjust its size and rotation below.' : tool === 'align' ? ['Tap landmark 1 in your image.', 'Tap the same landmark on the street map.', 'Tap landmark 2 in your image.', 'Tap the same landmark on the street map.'][anchors.length] : tool === 'pan' ? 'Drag to move around. Use + and − to zoom.' : 'Select a building to move it. Drag a corner to reshape it.';
    const selectedPoints = chosen ? (temporary ?? chosen).points.map(p => toDrawing(p, s.bounds)) : [];
    const rotationX = selectedPoints.length ? selectedPoints.reduce((a, p) => a + p[0], 0) / selectedPoints.length : 0;
    const rotationY = selectedPoints.length ? Math.min(...selectedPoints.map(p => p[1])) - view.w * 0.05 : 0;
    const showImage = imageMatches && !compare && !(tool === 'align' && anchors.length % 2 === 1);
    const shapePaths = useMemo(() => footprints?.features.flatMap(f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates as number[][][][] : [f.geometry.coordinates as number[][][]]).map(poly => poly.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1] * H / 1000}`).join(' ') + ' Z').join(' ')), [footprints, H]);
    return <section className="trace-editor" aria-label="Add missing details" onKeyDown={e => { if ((e.target as HTMLElement).closest('input,select,textarea'))
        return; if (e.key === 'Escape')
        cancel(); if (e.key === 'Enter' && tool === 'outline') {
        e.preventDefault();
        add(draft);
    } if (e.key === 'Backspace' && tool === 'outline') {
        e.preventDefault();
        setDraft(draft.slice(0, -1));
    } }}>
    <div className="trace-heading"><div><span className="eyebrow">ADD MISSING DETAILS</span><h3>Your place, with every building.</h3><p>Overlay an image, trace a footprint, and give it a height.</p></div><label className="trace-upload"><Upload size={17}/>Upload image<input ref={fileInput} aria-label="Upload reference image" type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={e => { if (e.target.files?.[0])
        void upload(e.target.files[0]); e.target.value = ''; }}/></label></div>
    <fieldset disabled={disabled} className="trace-tools" aria-label="Drawing tools">
      {([['rectangle', Square, 'Rectangle'], ['outline', Pentagon, 'Outline'], ['select', MousePointer2, 'Select'], ['pan', Hand, 'Pan']] as const).map(([name, Icon, label]) => <button key={name} type="button" aria-pressed={tool === name} onClick={() => changeTool(name)}><Icon size={16}/>{label}</button>)}
      <span className="trace-tool-divider"/>
      <button aria-label="Undo tracing change" disabled={!canUndo} onClick={() => { cancel(); onUndo(); }}><Undo2 size={16}/></button><button aria-label="Redo tracing change" disabled={!canRedo} onClick={() => { cancel(); onRedo(); }}><Redo2 size={16}/></button>
      {tool === 'outline' && <><button disabled={draft.length < 3} onClick={() => add(draft)}><Check size={16}/>Done</button><button onClick={cancel}><X size={16}/>Cancel</button></>}
    </fieldset>
    <p className="trace-instruction" role="status">{hint}</p>
    {hostedWorkspace && <p className="trace-print-handoff">To print added buildings, save your design and import it into the <a href={downloadUrl("Contour-Studio-local.zip")}>current local workspace</a> (Python 3.12 required).</p>}
    <div className="trace-layout"><div className="trace-map-column">
      <div className={`trace-stage tool-${tool}`} style={{ aspectRatio: `1000 / ${H}` }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!disabled && e.dataTransfer.files[0])
        void upload(e.dataTransfer.files[0]); }}>
        <div className="trace-basemap" ref={mapHost}/>
        <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="trace-surface" aria-label="Building tracing canvas" role="application" tabIndex={0} onPointerDown={e => down(e)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
          <defs><clipPath id="trace-map-clip"><rect width="1000" height={H}/></clipPath></defs>
          <g clipPath="url(#trace-map-clip)">
            {showImage && image && <image href={image.data} x={-image.width / 2} y={-image.width / image.aspect / 2} width={image.width} height={image.width / image.aspect} transform={`translate(${image.x} ${image.y}) rotate(${image.rotation})`} opacity={image.opacity} pointerEvents="none"/>}
            <g className="trace-existing" pointerEvents="none">{shapePaths?.map((d, i) => <path key={i} d={d} fillRule="evenodd"/>)}</g>
            {drawn.map(b => <polygon key={b.id} aria-label={b.label} points={b.points.map(p => toDrawing(p, s.bounds).join(',')).join(' ')} className={b.id === selected ? 'trace-building selected' : 'trace-building'} onPointerDown={e => down(e, b.id)}/>)}
            {chosen && tool === 'select' && (temporary ?? chosen).points.map((p, i) => { const q = toDrawing(p, s.bounds); return <circle key={i} cx={q[0]} cy={q[1]} r={view.w * 0.011} className="trace-handle" aria-label={`Corner ${i + 1}`} onPointerDown={e => down(e, chosen.id, i)}/>; })}
            {chosen && tool === 'select' && <g><line x1={rotationX} y1={rotationY + view.w * 0.05} x2={rotationX} y2={rotationY} stroke="#29483c" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/><circle cx={rotationX} cy={rotationY} r={view.w * 0.012} className="trace-rotation-handle" aria-label="Rotate selected building" onPointerDown={e => down(e, chosen.id, undefined, true)}/></g>}
            {draft.length > 0 && <><polyline points={draft.map(p => p.join(',')).join(' ')} className="trace-draft" pointerEvents="none"/>{draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={view.w * 0.008} className="trace-handle" pointerEvents="none"/>)}</>}
            {anchors.map((p, i) => <g key={i} pointerEvents="none"><circle cx={p[0]} cy={p[1]} r={view.w * 0.014} fill="#eeae47"/><text x={p[0]} y={p[1] + view.w * 0.005} textAnchor="middle" fontSize={view.w * 0.015}>{Math.floor(i / 2) + 1}</text></g>)}
          </g><rect width="1000" height={H} className="trace-area-border" pointerEvents="none"/>
        </svg>
        <div className="trace-zoom"><button aria-label="Zoom in tracing view" onClick={() => zoom(0.7)}><Plus size={17}/></button><button aria-label="Zoom out tracing view" onClick={() => zoom(1.4)}><Minus size={17}/></button><button aria-label="Fit tracing area" onClick={() => setView({ x: 0, y: 0, w: 1000, h: H })}><Scan size={17}/></button></div>
      </div>
      <div className="trace-source"><small>{footprintStatus}</small>{!hostedWorkspace && !footprints && !footprintLoading && <button disabled={disabled} onClick={() => setLoadVersion(v => v + 1)}>Retry outlines</button>}</div>
      {mapError && <small className="trace-map-warning">{mapError}</small>}
      {image && !imageMatches && <p className="trace-warning">Your reference image belongs to a different selected area. Upload a new image here, or return to the original area. Your buildings keep their geographic positions.</p>}
      {imageMatches && image && <fieldset className="trace-image-controls" disabled={disabled}><div className="trace-image-title"><strong>Reference image</strong><button aria-label="Remove reference image" onClick={() => { onChange({ reference_image: null }); changeTool('rectangle'); }}><Trash2 size={15}/></button></div><div className="trace-image-actions"><button aria-pressed={tool === 'image'} onClick={() => changeTool('image')}><Hand size={15}/>Move image</button><button aria-pressed={tool === 'align'} onClick={() => changeTool('align')}><Crosshair size={15}/>Match two landmarks</button><button aria-label="Hold to compare map" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setCompare(true); }} onPointerUp={() => setCompare(false)} onPointerCancel={() => setCompare(false)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter')
        setCompare(true); }} onKeyUp={() => setCompare(false)} onBlur={() => setCompare(false)}>Hold to compare</button></div><div className="trace-image-sliders"><label>Opacity<input aria-label="Reference opacity" type="range" min="0" max="1" step="0.05" value={image.opacity} onChange={e => patchImage({ opacity: Number(e.target.value) })}/></label><label>Size<input aria-label="Reference size" type="range" min="50" max="3000" step="10" value={image.width} onChange={e => patchImage({ width: Number(e.target.value) })}/></label><label>Rotation<input aria-label="Reference rotation" type="range" min="-180" max="180" value={image.rotation} onChange={e => patchImage({ rotation: Number(e.target.value) })}/></label></div><small>Images stay in your design file. Upload a top-down image for the best alignment.</small></fieldset>}
      {message && <p className="trace-feedback" role="status">{message}</p>}
    </div><aside className="trace-sidebar"><div className="trace-card"><h4>{chosen ? 'Selected building' : 'Next building'}</h4><fieldset disabled={disabled}>
      {chosen && <label>Name<input aria-label="Added building name" maxLength={64} value={chosen.label} onChange={e => onChange({ custom_buildings: buildings.map(b => b.id === chosen.id ? { ...b, label: e.target.value } : b) })}/></label>}
      <div className="trace-height-presets">{([['House', 8], ['Tall building', 30]] as const).map(([label, value]) => <button key={label} aria-pressed={(chosen?.height ?? height) === value} onClick={() => { setHeight(value); if (chosen)
        commit({ ...chosen, height: value }); }}>{label}</button>)}</div>
      <label>Real-world height · metres<input aria-label="Added building height" type="number" min="2" max="300" step="1" value={chosen?.height ?? height} onChange={e => { const value = Number(e.target.value); if (value >= 2 && value <= 300) {
        setHeight(value);
        if (chosen)
            commit({ ...chosen, height: value });
    } }}/></label>
      {chosen && <><div className="trace-selection-actions"><button onClick={duplicate}><Copy size={15}/>Duplicate</button><button onClick={() => { onChange({ custom_buildings: buildings.filter(b => b.id !== chosen.id) }); setSelected(null); }}><Trash2 size={15}/>Delete</button></div><label>Rotate building<div className="trace-rotate"><button aria-label="Rotate building anticlockwise" onClick={() => rotate(-5)}>−5°</button><button aria-label="Rotate building clockwise" onClick={() => rotate(5)}><RotateCw size={14}/>5°</button><button aria-label="Rotate building 90 degrees" onClick={() => rotate(90)}>90°</button></div></label></>}
      <button className="trace-add-another" onClick={() => { setSelected(null); changeTool('rectangle'); }}><Plus size={16}/>Add another building</button>
    </fieldset></div><Suspense fallback={<p>Opening 3D sketch…</p>}><TraceSketch settings={{ ...s, custom_buildings: drawn }}/></Suspense>
      <div className="trace-card trace-building-list"><h4>{buildings.length} added {buildings.length === 1 ? 'building' : 'buildings'}</h4>{buildings.length === 0 ? <p>Start with a rectangle. You can adjust its corners afterwards.</p> : buildings.map(b => <button key={b.id} aria-pressed={b.id === selected} onClick={() => { setSelected(b.id); changeTool('select'); }}><span>{b.label || 'Unnamed building'}</span><small>{b.height} m</small></button>)}{buildings.length > 0 && !s.buildings && <p className="trace-warning">Buildings are hidden in Style. Enable buildings before generating to include your additions.</p>}</div>
    </aside></div>
  </section>;
}
