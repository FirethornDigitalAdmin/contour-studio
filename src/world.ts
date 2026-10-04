import type { Bounds, Settings } from './types';

export const wrapLongitude = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180;
export const longitudeSpan = (b: Bounds) => b.east >= b.west ? b.east-b.west : b.east-b.west+360;
export const centreLongitude = (b: Bounds) => wrapLongitude(b.west+longitudeSpan(b)/2);
export const longitudeOffset = (lon: number, b: Bounds) => ((lon-b.west+180)%360+360)%360-180;
export const polarArea = (b: Bounds) => b.south < -85 || b.north > 85;
export function validBounds(b: Bounds) {
  const span=longitudeSpan(b);
  return Object.values(b).every(Number.isFinite) && span>0 && span<=2 && b.north>b.south && b.north-b.south<=2 &&
    b.west>=-180 && b.west<=180 && b.east>=-180 && b.east<=180 && b.south>=-90 && b.north<=90;
}
export const insideBounds = (lon: number, lat: number, b: Bounds) => longitudeOffset(lon,b)>0 && longitudeOffset(lon,b)<longitudeSpan(b) && lat>b.south && lat<b.north;

export function artworkRatio(s: Settings) {
  if(s.map_format==='mini_tiles')return 1;
  if(s.map_format==='hexagons')return 2/Math.sqrt(3);
  const frame = s.frame_mode === 'none' ? 0 : s.frame_width;
  return Math.max(0.05, (s.width - 2 * frame) / Math.max(1, s.height - 2 * frame));
}

// Match the opening in the street map's Mercator projection, keeping its centre
// and width. Only shrink the width if the new shape would exceed selectable bounds.
export function fitArtworkBounds(b: Bounds, ratio: number): Bounds {
  if (!validBounds(b) || polarArea(b) || !Number.isFinite(ratio) || ratio <= 0) return b;
  const radians = Math.PI / 180;
  const project = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * radians / 2));
  const unproject = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / radians;
  const centreY = (project(b.north) + project(b.south)) / 2;
  const requestedHalf = longitudeSpan(b) * radians / ratio / 2;
  let half = Math.min(requestedHalf, project(85) - centreY, centreY - project(-85));
  if (unproject(centreY + half) - unproject(centreY - half) > 2) {
    let low = 0, high = half;
    for (let i = 0; i < 40; i++) {
      const middle = (low + high) / 2;
      if (unproject(centreY + middle) - unproject(centreY - middle) <= 2) low = middle;
      else high = middle;
    }
    half = low;
  }
  const width = half * 2 * ratio / radians;
  const centre = centreLongitude(b);
  const next = {
    west: half === requestedHalf ? b.west : wrapLongitude(centre - width / 2),
    east: half === requestedHalf ? b.east : wrapLongitude(centre + width / 2),
    south: unproject(centreY - half),
    north: unproject(centreY + half),
  };
  return validBounds(next) ? next : b;
}

export function placeBounds(lon: number, lat: number, ratio: number): Bounds {
  const dh=.032;
  const dw=Math.min(1.9,dh*ratio/Math.max(.001,Math.cos(lat*Math.PI/180)));
  const south=Math.max(-90,Math.min(90-dh,lat-dh/2));
  return {west:wrapLongitude(lon-dw/2), east:wrapLongitude(lon+dw/2), south, north:south+dh};
}

export const MAX_BUILDING_AREA_KM2 = 100;
// Spherical area also handles selections crossing the date line.
export function selectionAreaKm2(b: Bounds) {
  const radians = Math.PI / 180;
  return 6371.0088 ** 2 * longitudeSpan(b) * radians *
    (Math.sin(b.north * radians) - Math.sin(b.south * radians));
}
