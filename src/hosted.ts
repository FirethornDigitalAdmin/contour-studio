import { api as localApi, type Settings } from "./types";
import { restoreDraft, validateDesign } from "./validation";
import preset from "./preset.json";

declare const __HOSTED_WORKSPACE__: boolean;
declare const __GEOCODER_URL__: string;
export const hostedWorkspace = typeof __HOSTED_WORKSPACE__ !== "undefined" && __HOSTED_WORKSPACE__;
export const starterPlaces = [
  { name: "Keswick", lat: 54.59, lon: -3.125 },
  { name: "Edinburgh", lat: 55.953, lon: -3.189 },
  { name: "Chamonix", lat: 45.9237, lon: 6.8694 },
];
const defaults = preset as Settings;
let lastSearch = 0;
const searchCache = new Map<string, unknown>();

async function search(query: string) {
  const coordinates = /^\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(query);
  if (coordinates) {
    const lat = Number(coordinates[1]), lon = Number(coordinates[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error("Enter latitude −90…90 and longitude −180…180.");
    return [{ lat: String(lat), lon: String(lon), display_name: `${lat}°, ${lon}°` }];
  }
  if (query.length < 2 || query.length > 160) throw new Error("Enter a place between 2 and 160 characters.");
  const key = "contour-studio.search.v1:" + query.toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key);
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached?.at > Date.now() - 7 * 86400000 && Array.isArray(cached.results)) return cached.results;
  } catch { /* Search works without browser storage. */ }
  // Explicit submitted searches only; never autocomplete or prefetch.
  const wait = Math.max(0, 1100 - (Date.now() - lastSearch));
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastSearch = Date.now();
  const url = new URL(__GEOCODER_URL__);
  url.search = new URLSearchParams({ q: query, format: "jsonv2", limit: "5" }).toString();
  let results;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("Location provider is busy.");
    results = await response.json();
    if (!Array.isArray(results)) throw new Error("Invalid location response.");
  } catch { throw new Error("Place search is unavailable. Try a suggested place, enter coordinates, or choose directly on the map."); }
  searchCache.set(key, results);
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), results })); } catch { /* Memory caching remains available. */ }
  return results;
}

/** Static hosting supports the design journey; printable geometry stays local. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!hostedWorkspace) return localApi<T>(path, body);
  if (path === "/preset") return structuredClone(defaults) as T;
  if (path === "/active-job") return null as T;
  if (path === "/projects") return [] as T;
  if (path.startsWith("/search?")) return await search(new URLSearchParams(path.split("?")[1]).get("q")?.trim() || "") as T;
  if (path === "/validate") {
    const settings = restoreDraft(body, defaults);
    if (!settings) throw new Error("This file does not contain valid artwork settings.");
    const issues = validateDesign(settings);
    if (issues.length) throw new Error(issues[0]);
    return settings as T;
  }
  throw new Error("Open the local workspace to generate models and access print files.");
}
