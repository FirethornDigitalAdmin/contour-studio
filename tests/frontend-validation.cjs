// Focused regressions for schema boundaries and model freshness, without a browser.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const source = fs.readFileSync(path.join(__dirname, "..", "src", name + ".ts"), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "require", output)(exports, (request) => load(request.replace("./", "")));
  modules.set(name, exports);
  return exports;
}
const { markerFitsMap, restoreDraft, sameDesign, validSettingValue, validateDesign } = load("validation");
const defaults = {
  name: "reference landscape", bounds: { west: -1.352, south: 53.498586, east: -1.278, north: 53.527414 },
  width: 600, height: 400, printer_width: 220, printer_height: 220, printer_z: 250, margin: 5, layout: "auto", columns: 3, rows: 2,
  base: 4, exaggeration: 3, smoothing: 0.8, terrain_style: "smooth", contour_height: 1.2, facet_size: 12, resolution: 640,
  seam: 0, joints: true, tolerance: 0.2, labels: true, frame_mode: "integrated", frame_width: 10, frame_depth: 5, frame_height: 12,
  corner_radius: 2, inner_bevel: 1, outer_bevel: 0.8, roads: "raised", road_width: 1.2, road_height: 0.6,
  water: true, water_width: 1.8, water_depth: 0.8, water_style: "carved", water_bank: 0,
  forests: false, forest_style: "canopy", tree_size: 2.4, tree_height: 1.8, tree_spacing: 4,
  fields: false, field_style: "furrows", field_spacing: 2.5, field_height: 0.35, field_angle: 25,
  multicolour: false, colour_depth: 0.8, colour_ground: "#80A768", colour_water: "#397CA7", colour_forest: "#80A768", colour_fields: "#E9DECA",
  colour_roads: "#E9DECA", colour_buildings: "#E9DECA", colour_frame: "#2B4045", colour_markers: "#2B4045", buildings: true, building_source: "combined", building_height: 8,
  building_exaggeration: 1.5, small_buildings: "enhance", building_min_width: 0.8, building_min_height: 1.2,
  building_style: "realistic", markers: [], landmarks: false, marker: false, marker_lon: -1.313, marker_lat: 53.516, front_caption: false, nozzle: 0.4,
};
assert.deepEqual(validateDesign(defaults), []);
const orderedDifferently = { ...defaults, bounds: { east: -1.278, west: -1.352, north: 53.527414, south: 53.498586 } };
assert(sameDesign(defaults, orderedDifferently), "object field order must never make a generated model stale");
assert(!sameDesign(defaults, { ...defaults, resolution: 128 }), "actual changes must make the model stale");
for (const invalid of [
  { water_style: "invalid" }, { colour_water: "blue" }, { tree_height: 99 }, { field_angle: -1 }, { colour_depth: 0.1 }, { resolution: 128.5 }, { terrain_style: "broken" }, { width: Infinity }, { name: "   " },
  { frame_width: 4, inner_bevel: 2, outer_bevel: 2 }, { frame_mode: "separate", frame_width: 4 },
  { printer_z: 20, frame_depth: 5, frame_height: 15, front_caption: true },
  { printer_z: 20, frame_mode: "none", base: 20, water: true },
]) assert(validateDesign({ ...defaults, ...invalid }).length, JSON.stringify(invalid));
assert.deepEqual(validateDesign({ ...defaults, frame_mode: "none", frame_width: 4, corner_radius: 15, inner_bevel: 4, outer_bevel: 4 }), [], "inactive frame relationships must not block generation");
const marker = { id: "home", label: "Home", symbol: "heart", lon: -1.315, lat: 53.513, size: 8, rise: 3 };
assert.deepEqual(validateDesign({ ...defaults, markers: [marker] }), []);
for (const invalid of [{ id: "" }, { id: "x".repeat(65) }, { label: "" }, { label: "x".repeat(65) }, { size: -1 }, { rise: 999 }, { lat: 85 }, { symbol: "broken" }])
  assert(validateDesign({ ...defaults, markers: [{ ...marker, ...invalid }] }).length, "invalid markers are blocked");
assert(markerFitsMap(marker, defaults));
assert(!markerFitsMap({ ...marker, lon: defaults.bounds.west + 0.00001 }, defaults), "the whole badge needs clearance from the edge");
assert(restoreDraft({ ...defaults, layout: "manual", columns: 1, rows: 1 }, defaults), "preserve invalid in-progress tile layouts for repair");
assert.equal(restoreDraft({ ...defaults, markers: [null] }, defaults), null);
assert.equal(restoreDraft({ ...defaults, terrain_style: "broken" }, defaults), null);
assert(!validSettingValue("terrain_style", "broken", defaults));
assert(!validSettingValue("resolution", 1025, defaults));
assert(!validSettingValue("resolution", 128.5, defaults));
assert(validSettingValue("terrain_style", "terraced", defaults));
assert(!validSettingValue("colour_water", "#bad", defaults));
assert(validSettingValue("colour_water", "#00Aaff", defaults));
assert.equal(restoreDraft({ ...defaults, colour_ground: "green" }, defaults), null);
const oldDraft = { ...defaults }; for (const key of ["water_style", "water_bank", "forests", "fields", "colour_water"]) delete oldDraft[key];
assert.equal(restoreDraft(oldDraft, defaults).water_style, "carved", "old drafts receive backward-compatible landscape defaults");
assert.equal(restoreDraft(oldDraft, defaults).colour_water, "#397CA7");
const { validBounds, placeBounds, centreLongitude, artworkRatio, fitArtworkBounds, longitudeSpan } = load("world");
const dateline={west:179.98,east:-179.98,south:-17.01,north:-16.99};
assert(validBounds(dateline)); assert(Math.abs(centreLongitude(dateline))===180);
assert.deepEqual(validateDesign({...defaults,bounds:dateline,markers:[{...marker,lon:-179.99,lat:-17,size:3}]}),[]);
for(const lat of [-90,-86,86,90]) {
  const bounds=placeBounds(179.999,lat,1.5);
  assert(validBounds(bounds),"polar and date-line searches stay selectable");
  assert.deepEqual(validateDesign({...defaults,bounds}),[]);
}
assert(markerFitsMap({...marker,lon:12.05,lat:86.01,size:3},{...defaults,bounds:{west:12,east:12.1,south:86,north:86.02}}));
const mercator = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
for (const bounds of [defaults.bounds, dateline, { west: 10, east: 11.9, south: -.5, north: .5 }, { west: 10, east: 11, south: 84, north: 85 }]) {
  for (const ratio of [1, 580 / 380, 380 / 580, .05, 30]) {
    const fitted = fitArtworkBounds(bounds, ratio);
    assert(validBounds(fitted), "artwork changes stay within selectable bounds");
    const projectedRatio = longitudeSpan(fitted) * Math.PI / 180 / (mercator(fitted.north) - mercator(fitted.south));
    assert(Math.abs(projectedRatio - ratio) < 1e-7, "selection matches the artwork opening even at the date line and latitude limits");
    assert(Math.abs(centreLongitude(fitted) - centreLongitude(bounds)) < 1e-8, "size changes preserve the geographic centre");
    assert(Math.abs(mercator(fitted.north) + mercator(fitted.south) - mercator(bounds.north) - mercator(bounds.south)) < 1e-10, "size changes preserve the projected vertical centre");
  }
}
assert.equal(artworkRatio(defaults), 580 / 380);
assert.equal(artworkRatio({ ...defaults, frame_mode: "none" }), 600 / 400);
assert.deepEqual(fitArtworkBounds(defaults.bounds, 1).west, defaults.bounds.west);
assert.deepEqual(fitArtworkBounds({ ...dateline, north: 86, south: 85.9 }, 1), { ...dateline, north: 86, south: 85.9 }, "polar coordinate selections are preserved");
console.log("PASS: model freshness, draft shape/recovery, enum/range/frame/marker validation and stored custom styles.");
