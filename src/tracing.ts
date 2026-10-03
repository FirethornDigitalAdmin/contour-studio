import type { Bounds, CustomBuilding, Settings } from './types';
import { longitudeOffset, longitudeSpan, polarArea, wrapLongitude, validBounds } from './world';
export type Point = [
    number,
    number
];
const latitude = (lat: number, b: Bounds) => polarArea(b) ? lat * Math.PI / 180 : Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
export function tracingHeight(b: Bounds) {
    return Math.max(0.001, 1000 * (latitude(b.north, b) - latitude(b.south, b)) / (longitudeSpan(b) * Math.PI / 180));
}
export function toDrawing(p: Point, b: Bounds): Point {
    return [longitudeOffset(p[0], b) / longitudeSpan(b) * 1000, (latitude(b.north, b) - latitude(p[1], b)) / (latitude(b.north, b) - latitude(b.south, b)) * tracingHeight(b)];
}
export function toGeographic(p: Point, b: Bounds): Point {
    const y = latitude(b.north, b) - p[1] / tracingHeight(b) * (latitude(b.north, b) - latitude(b.south, b));
    return [wrapLongitude(b.west + p[0] / 1000 * longitudeSpan(b)), polarArea(b) ? y * 180 / Math.PI : (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI];
}
export function validOutline(points: Point[]) {
    if (points.length < 3 || points.length > 100 || points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))
        return false;
    const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8)
            return false;
        area += a[0] * b[1] - b[0] * a[1];
        for (let j = i + 1; j < points.length; j++) {
            if (j === i + 1 || (i === 0 && j === points.length - 1))
                continue;
            const c = points[j], d = points[(j + 1) % points.length];
            const ca = cross(a, b, c), da = cross(a, b, d), ac = cross(c, d, a), bc = cross(c, d, b);
            // Touching, collinear overlapping and crossing non-adjacent edges are invalid.
            const on = (p: Point, a: Point, b: Point) => p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;
            if ((ca * da < 0 && ac * bc < 0) || (Math.abs(ca) < 1e-9 && on(c, a, b)) || (Math.abs(da) < 1e-9 && on(d, a, b)) || (Math.abs(ac) < 1e-9 && on(a, c, d)) || (Math.abs(bc) < 1e-9 && on(b, c, d)))
                return false;
        }
    }
    return Math.abs(area) > 0.01;
}
export function validCustomBuildings(value: unknown): value is CustomBuilding[] {
    return Array.isArray(value) && value.length <= 500 && new Set(value.map(b => b?.id)).size === value.length && value.every(b => b && typeof b.id === 'string' && b.id.trim() && b.id.length <= 64 && typeof b.label === 'string' && b.label.trim() && b.label.length <= 64 && Number.isFinite(b.height) && b.height >= 2 && b.height <= 300 && Array.isArray(b.points) && b.points.every((p: Point) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90) && validOutline(b.points.map((p: Point) => [longitudeOffset(p[0], { west: b.points[0][0] } as Bounds) * 100000, p[1] * 100000])));
}
export function validReferenceImage(value: unknown): boolean {
    if (value == null)
        return true;
    const r = value as NonNullable<Settings['reference_image']>;
    return typeof r === 'object' && typeof r.data === 'string' && r.data.length <= 1500000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.data) && !!r.bounds && Object.values(r.bounds).length === 4 && validBounds(r.bounds) && [r.x, r.y, r.width, r.aspect, r.rotation, r.opacity].every(Number.isFinite) && Math.abs(r.x) <= 5000 && Math.abs(r.y) <= 1e9 && r.width >= 10 && r.width <= 10000 && r.aspect >= 0.05 && r.aspect <= 20 && Math.abs(r.rotation) <= 360 && r.opacity >= 0 && r.opacity <= 1;
}
