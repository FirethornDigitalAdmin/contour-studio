# Contour Studio

**Completely free. Completely open source. Yours to build on.**

[Download the app](https://firethorndigitaladmin.github.io/contour-studio/#downloads) · [Free web designer](https://firethorndigitaladmin.github.io/contour-studio/#workspace) · [Public releases](https://github.com/FirethornDigitalAdmin/contour-studio/releases) · [Buy me a coffee](https://www.buymeacoffee.com/LouisGoldsbrough)

Use, modify, share or sell the application under the MIT licence; retain its copyright and licence notice. There is no subscription, paid tier or generation fee. Buying a coffee is an entirely optional thank you and unlocks nothing. Geographic data and third-party dependencies retain their own licences.

Turn a real place into a framed, tiled, 3D-printable relief map. Design your artwork in a browser or the desktop app; your own computer generates the print files and stores your projects. No account or paid generation server is required. The geometry engine is Python; the interface is React, TypeScript, MapLibre and Three.js.

The download website includes an interactive example made from a generated Bolton upon Dearne map. Its four terrain tiles and four separate frame pieces assemble on arrival. Rotate, pan, zoom, separate the pieces or switch the terrain colours off; the assembly can be replayed. The introduction waits until the model is in view and respects reduced-motion preferences. A static image remains available when WebGL cannot run.

`public/showcase-v2.glb` preserves every triangle and float32 vertex position from the generated preview, with lossless mesh compression for downloading. Rebuild it using `pnpm build:showcase PATH/TO/preview.glb`. The builder verifies the decompressed vertices and oriented triangles against the source; `pnpm test` also checks every published surface is closed and consistently wound. The example uses OpenStreetMap vectors and Mapzen terrain; source attribution is linked below the viewer. Print files remain in the original print pack.

## Choose how to use it

| Version | What it does | Setup |
| --- | --- | --- |
| Desktop app | Design and generate in a native window on macOS or Windows. | Windows x64 and Apple Silicon release candidates; see [DESKTOP.md](DESKTOP.md). |
| Free web workspace | Select a place, customise the artwork and save design settings. | Static GitHub Pages hosting; see [HOSTING.md](HOSTING.md). Generate print files using a local copy. |
| Local browser app | Full design and generation on your computer. | Download **Contour-Studio-local.zip**, install Python 3.12, then follow [START-HERE.md](START-HERE.md). |

Installers bundle Python and the geometry engine, so users do not need Python, Node.js or a terminal. **Windows x64** has passed an automated installation, native UI, saved-draft, generation and uninstall trial. **Apple Silicon Mac** has passed native launch and packaged-engine checks. Intel Mac remains an untested build target. The public repository is [FirethornDigitalAdmin/contour-studio](https://github.com/FirethornDigitalAdmin/contour-studio). Download the first public preview from [Releases](https://github.com/FirethornDigitalAdmin/contour-studio/releases/tag/v1.0.0-rc.1). Internet is needed for uncached map data and the basemap. See [DESKTOP.md](DESKTOP.md) for download instructions and remaining manual checks.

For the local browser ZIP, extract it and open `start.command` on Mac, `start.bat` on Windows, or `bash start.sh` on Linux. It opens **http://127.0.0.1:8765**. First launch installs Python dependencies. Keep the terminal open while using the app; Ctrl+C stops it. The ZIP contains the compiled interface and does not require Node.js or Codex.

For a source installation, install Python 3.12 and Node.js 22.12+, then use the same launcher, or set it up manually:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm install --global pnpm@10
pnpm install --frozen-lockfile
pnpm build
python -m backend.launch
```

On Windows, activate the environment using `.venv\Scripts\activate`. `requirements.txt` is the portable installation list; `requirements.lock.txt` records the original Mac environment for reference.

## Public repository and releases

The application code is MIT licensed; geographic data and third-party dependencies retain their own licences. See [LICENSE](LICENSE) and the attribution below.

Run `pnpm build`, then `python scripts/build_release.py` to produce:

- **Contour-Studio-source.zip:** clean source, desktop packaging, workflows and documentation for a public repository.
- **Contour-Studio-local.zip:** the same source plus the compiled browser interface for local use.

Both exclude saved projects, map caches, installed dependencies and local development records. Desktop installers are built separately using the manual **Build desktop installers** GitHub Actions workflow; see [DESKTOP.md](DESKTOP.md). The **Check and package** workflow checks source setup on Mac, Windows and Linux and creates the source/local ZIPs. These workflows create downloadable artifacts; attaching them to a GitHub Release is a separate step.

A public repository can host the static design workspace with [GitHub Pages on GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages). Visitors generate on their own computers, avoiding a shared cloud geometry bill. See [HOSTING.md](HOSTING.md) for the publication steps and the distinction between web design and local generation.

## A simpler desktop workspace

Style presents Natural, Bold city and Minimal first. Open **More styles & saved presets** for Landscape, Contour art and your own saved styles. Five icon-labelled groups keep the rest organised: **Land contours**, **Map features**, **Print colours**, **Frame & caption** and **Special places**. Each group summarises the current design; one main Style group opens at a time. Forests and fields are inside Map features. Dimensions and specialist tuning are tucked into the relevant detail groups. **Design files** contains portable settings import and export.

The Make step reviews the landscape, mapped features, print colours, frame and special places before generation. Separate frames include an underside retaining lip and a matching supported insert seat. Multicolour exports contain validated material volumes and aligned STL parts. A failed generation keeps the design and offers **Use single-colour printing** to retry. See [UI-REVIEW.md](UI-REVIEW.md) for the desktop checks and remaining Windows release requirements.

## Make the first artwork

The workspace follows **Place & size → Style → Make**. Move between steps without losing your choices. The action at the bottom always shows what to do next.

Your current design is saved automatically in this browser, including unfinished tile layouts. Refreshing restores the current step, settings and completed preview; an active generation takes priority. Undo and redo keep up to 50 design changes during the session (Ctrl/⌘ Z and Ctrl/⌘ Shift Z). Generated projects are saved separately on disk, so clearing browser storage does not remove their print packs. Export settings for a portable copy of an unfinished design.

1. **Place & size:** search for a town, city or postcode anywhere in the world, or enter **latitude, longitude** (for example `35.68, 139.76`). Move the selection box or drag its corners; use Draw new area, Pan map and Fit selection to adjust it. Ratio locked follows the artwork opening. Hold Shift for free drawing, press Escape to cancel a drag, or focus Move area and use arrow keys to nudge. Artwork naming and precise coordinates are under **Name & exact coordinates**. In the same step, choose Small, Classic or Square, or enter custom outer dimensions including the frame. The labelled **Tile layout** shows the actual dimensions and division. Automatic layout chooses the fewest tiles that fit your printer. Open Change printer settings to adjust the build plate, height, nozzle and margins. Custom layouts and all existing tile presets remain available. Joining keys, rear labels and clearances are under Joining & print details.
2. **Style:** start with Natural, Bold city or Minimal. Adjust terrain and map features, frame and caption, then add special places. A marker opens its own editor; choose a heart, star or pin and click inside the map to position it. Size, rise and exact coordinates stay under Symbol size & position. Names label the editor; only symbols are printed. Styles and markers affect the exported geometry after generation.
3. **Make:** review the place, dimensions and personal touches, then **Generate model**. Progress appears while real data is fetched, geometry is built and each piece is validated. Settings are locked during generation. Refreshing or opening another tab reconnects to the active job and its settings. Errors keep your choices available for another attempt; an invalid print package is never published.
4. Inspect the generated 3D model. Make includes separated pieces, wireframe, seams, frame visibility and camera reset. Select a piece to inspect its neighbours or download its STL. Styling keeps the inspection tools tucked away. Changes clearly mark the preview and files as out of date until you **Update model**.
5. **Download print pack** gets the complete ZIP. Assembly guide, assembled 3MF and individual STL files are available below the preview. The 3MF represents the whole artwork, not a single build plate or a sliced print job. Completed artworks are saved automatically under **My projects**, including after a server restart. Settings can also be exported and imported independently.
6. Print the fit coupon and one key first when using joining keys. Check the fit and adjust clearance if needed before printing the artwork pieces.

Customisation includes five starting styles, five named printer build-volume presets plus **Custom build plate**, proportion locking and rotating the finished size, and four frame profiles. With the map's **Ratio locked**, choosing Small, Classic or Square, entering dimensions, rotating the size or changing the frame opening immediately updates the centred map selection. Undo/redo restores the dimensions and selection together. **Free shape** preserves your chosen bounds when the artwork size changes. Printer choices update the automatic tile layout immediately; custom dimensions, nozzle size and margins stay adjustable and save with the design. These presets set actual generation settings; every detail remains adjustable. Save your own terrain, map-layer and frame combinations under **Style → More styles & saved presets → Your style presets**. Styles are stored in this browser and can be applied to another place without moving its markers. Marker duplication and **Move to map centre** help position repeated symbols; the complete badge must fit inside the artwork opening before generation starts. Settings imports are validated and normalised, with invalid files leaving the current design intact.

The map offers Calm, Full colour and High contrast. The 3D preview has perspective, top, front and side cameras; separate terrain and frame colours; matte, satin and metal finishes; backgrounds and lighting; shadows; and display quality. Appearance choices persist in the browser and affect the preview and **Save image** PNG. For a generated multicolour model, Print colours shows the actual material regions and live palette edits. Display override is an optional visual-only finish; update the model to include print-colour edits in exported files. Select a terrain or frame piece to focus on it or inspect it alone. Tile layout includes a build-plate comparison with margins. Print files can be searched and filtered by piece type, while **My projects** supports search, date/name sorting and starting a new artwork.

Desktop keeps the current controls beside the canvas and a persistent action bar below. Mobile puts the current step and location search first, with a fixed action bar and controls available by scrolling. Changing viewport size refits the map selection. Advanced terrain resolution, building treatment, frame profile and printing settings remain available in their relevant sections.

## Rivers, forests, fields and colour printing

In **Style → Map features → Water detail**, choose **Smooth flowing water** for a softer channel bed, adjust the minimum river width and depth, and add a soft bank transition. Water follows the broad terrain slopes; it is an artistic printable relief rather than a simulated water level. **Follow land contours** with zero bank width preserves the original carving treatment.

**Style → Map features → Forests & fields → Add landscape detail** enables smooth rivers, individual tree shapes and field crop rows together. Forests use mapped OpenStreetMap woodland boundaries. Choose low canopy texture or solid tree shapes, then adjust width, rise and spacing. The tree positions are a deterministic illustrative pattern, not surveyed individual trees. Fields use mapped farmland and meadows: choose smooth patches or raised crop rows, with adjustable spacing, rise and direction. Features follow the surface and clear roads, water, buildings and special places. Source holes and boundaries are retained. Complex selections increase texture spacing to bounded sampling limits; the print notes disclose these changes. Missing source polygons cannot be filled by increasing model quality.

Enable **Style → Print colours → Multicolour print package** to export real material volumes. Choose Countryside · 4 for one four-slot AMS, River study · 2, or Colour atlas · 8; every feature colour remains editable. Matching HEX colours share a suggested filament number. Colour layer depth sets the minimum surface thickness; raised details and land above river beds can use a deeper coloured region. Your own style presets and exported settings include all landscape and palette choices. Existing projects receive compatible defaults and keep their original print files.

Each terrain/frame piece gets its own **Multicolour/*.3mf**. Open one piece in Bambu Studio, retain it as one object containing named material parts, choose your printer and compatible filament profiles, and assign the parts to your loaded AMS filaments. The file includes standard colour properties and optional Bambu part metadata, but physical AMS slot mapping and printer settings are chosen in your slicer. Some Bambu Studio versions display a geometry-only / invalid-configuration notice for ordinary 3MF geometry files; this is a [reported Bambu Studio issue](https://github.com/bambulab/BambuStudio/issues/11927). Continue with the geometry and assign the named parts. The per-piece **Materials/** STL alternative uses one shared coordinate origin: select all its material files together and import as one object with multiple parts. Do not drop, centre or arrange regions independently. The package includes `Multicolour/materials.json` and `Multicolour/readme.txt` with the suggested colours and import steps.

The complete single-colour STL for every piece is still included. Colour regions form a Boolean partition of that same solid, with coverage and overlap checked before publication. Their union retains the complete base, front details and rear features. Disconnected islands of the same colour are intentional material parts within the single printable object. Check your slice preview for thin detail and material changes; no physical multicolour print has been performed.

## Geometry and assembly

- **Global generation before cutting:** one projected heightfield is sampled and smoothed over the whole selection. Roads, waterways, buildings, markers and the frame are combined in model coordinates before any tile is cut. Every tile is a Boolean section of those complete solids. No independently sampled terrain edges.
- **Terrain:** a north-up Web Mercator rectangle is converted to physical millimetres, with a latitude-corrected ground scale. Its minimum solid thickness remains at least the configured base thickness after carving. The bottom is planar and the boundary is closed.
- **Land contours:** choose Smooth, Terraced, Sculpted or Faceted under **Style → Land contours**, independently of the building and road presets. Smooth retains the original surface. Terraced traces interpolated elevation contours and stacks solid polygon layers with flat shelves and vertical walls. Curves cross between terrain samples instead of following square grid cells; enclosed depressions and clipped map boundaries are retained. Sculpted rounds elevation transitions into soft shelves. Faceted samples the terrain onto larger triangles, capped by available grid resolution. Contour height and facet size are in printed millimetres. Styles apply across the full map before features and tile cuts, and affect the generated preview, STL and 3MF. Samples are illustrative; generate or update the model to see your actual place. Flat source terrain stays flat: try a smaller contour height or more height exaggeration when relief is low. Older settings default to Smooth; older terraced meshes are marked for updating to the new contour method.
- **Surface quality:** the visible meter offers Draft (128 samples), Standard (384), Fine (640, the default) and Ultra (1024). Higher quality refines curves at the cost of generation time and file size. The meter shows approximate physical spacing for the artwork opening; it measures selected surface sampling, not source-data accuracy or print certification. Custom resolution remains under Terrain detail & smoothing and appears as Custom in the meter. Faceted intentionally retains angular slopes at every quality. Changing quality marks generated files out of date until the model is updated.
- **Roads and water:** buffered OSM vectors form exact polygon masks. Raised roads follow the original terrain surface; engraved roads and waterways remove a terrain-following band. Channels cut through raised roads at crossings to avoid unsupported miniature bridges. Water area multipolygons and holes are supported.
- **Buildings:** Enhanced coverage is the default. The app supplements live OSM buildings and building parts with full-resolution [Overture Maps outlines](https://docs.overturemaps.org/guides/buildings/), including Microsoft's imagery-derived building data. Source IDs and substantial footprint overlap remove duplicates before enlargement; OSM shapes and tagged heights are retained. Overture heights fill missing OSM heights. Additional buildings use source height, floor count × 3 m, or the configured fallback height. Height exaggeration is separate from terrain exaggeration. Small footprints are enlarged by default to at least two nozzle widths; keep-original and omit modes are available, with counts reported. Minimum relief and width are adjustable. Real buildings & mapped roofs preserves available building-part heights and source-tagged gabled, hipped, pyramidal, skillion, dome, round, mansard and gambrel roof forms, using mapped roof height or roof levels. Parent outlines are cut around mapped wings/towers so a tall parent block cannot flatten them. Unsupported roof forms or missing roof heights retain source-height blocks. Uniform blocks and decorative stepped rooftops remain optional styles; Bold city now uses the real-building treatment. Floating parts are grounded for printable relief, and minimum dimensions/enlargement can simplify fine details. The print package reports mapped parts, roofs and fallback-height counts. A 0.03 mm polygon overlap prevents point-touching building corners from creating non-manifold vertical contacts. **Style → Building detail → Building coverage** also offers OpenStreetMap only. Opening an older OSM-only model offers an update to enhanced coverage; existing print files remain unchanged.
- **One outer frame:** configurable border width, base depth, rise, corner radius and inner/outer bevel. Total frame height is **base depth + rise**. The inner opening widens towards the top, so its bevel does not project over the landscape. Set radius and bevels to zero for a square, flat profile. The integrated option has no frame at internal seams. The separate option exports segmented bars/corners corresponding to the terrain grid, with a continuous 2 mm inward retaining lip underneath. Its 45° seat matches an underside chamfer on the insert; the central back remains flat and the edge grows at 45° during rear-down printing. Insert side clearance uses the selected tolerance. Keep the final frame section loose while sliding the insert into a segmented surround, or lower it into a one-piece ring. Dry-fit before gluing. Optional rear keys register the frame to the map.
- **Perimeter cleanup:** features stay within the actual insert wall. Non-printable zero-volume sheets from contour/channel tangencies are removed before export; real solid detail is retained. Every published STL still passes connected-solid, watertightness, orientation and volume checks. Older models offer **Update model** to apply the new edges and frame support.
- **Alignment:** two butterfly-shaped rear keys per internal tile edge, with 0.2 mm default clearance per side. Keys are 10 × 6 × 1.6 mm; pockets are 1.8 mm deep. They have no projecting front geometry. Separate-frame joints require a frame width of at least 6 mm.
- **Back labels:** tile identifier, TOP arrow, artwork name and neighbours are embossed within shallow rear recesses. Lettering starts on the print-bed plane, avoiding floating first layers. The optional name/coordinate caption is on the lower outer frame.
- **Seams:** zero is the default. An optional 0–0.4 mm gap removes half the allowance from each adjacent edge without moving the tile's assembled position. Front continuity is retained to numerical mesh precision; STL coordinates themselves are 32-bit floating point.
- **Units:** every STL is in millimetres and moved to local positive print-bed coordinates. `assembly_origin_mm` in the JSON restores the exact assembled position. The GLB and 3MF retain assembled coordinates.

### Printing and wall mounting

Start with a 0.4 mm nozzle and 0.2 mm layers. Print the flat rear surface on the bed. The underside label recesses and key pockets require short bridges; check your cooling and bridge settings with the fit coupon. Orient all TOP arrows consistently and dry-assemble on a flat surface before gluing.

The keys align the pieces; they do not carry the weight of the artwork. Bond the assembled model to a rigid backing panel and mount hanging hardware to that panel. A backing board and hardware are not generated or included. The assembly guide includes this mounting workflow.

Mesh checks do **not** substitute for a physical print trial. No physical Ender 3 print has been performed as part of development. Inspect the slice preview for bridges, fine lettering, small roofs and the first layer before a long print.

## Export layout

```text
My-artwork/
  STL/                       # A1, A2, A3, B1, B2, B3 …
  Frame/                     # only for separate-frame mode
  Assembly/                  # joining key, Fit_Left and Fit_Right
  Multicolour/               # optional: per-piece colour 3MFs, material guide
  Materials/                 # optional: aligned colour STLs grouped by piece
  Assembly.3mf               # assembled objects, not a single-plate print layout
  assembly-guide.svg         # labelled front-view diagram and instructions
  model-info.json            # dimensions, triangle counts, neighbours, checks, credits
  settings.json
  preview.glb
```

The key STL is provided once; its required quantity appears in the guide, UI and JSON. Print each terrain tile individually. **Assembly.3mf is larger than one build plate** and is intended for viewing/reassembly; use the local-coordinate STLs for individual prints. The 3MF contains geometry, not printer-specific slicer settings.

## Real data and operating limits

Elevation comes from [Mapzen Terrain Tiles on AWS Open Data](https://registry.opendata.aws/terrain-tiles/), decoded from Terrarium tiles with bilinear interpolation. The package includes the [upstream elevation source attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Source resolution varies geographically: increasing the model grid density cannot invent detail absent from the DEM.

Vector features are © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0, fetched using Overpass. Search uses [Nominatim](https://nominatim.org/release-docs/latest/api/Search/); the visible map uses OpenStreetMap raster tiles with on-map attribution. Search requests are rate-limited to one per second and cached. OSM data is cached for seven days; DEM tiles are cached indefinitely. Clear `data/cache/` to refresh data.

Additional building outlines come from Overture's latest published release, discovered automatically through its catalog and fetched with the official Python client. Both building and building_part data for the selected area are requested from the same release. Only the selected area's full-resolution GeoParquet features are requested, preserving courtyards and multipart footprints. Complete area downloads are cached for seven days in `data/cache/buildings-overture-*.json`, separately from OSM. The download runs in a subprocess with a four-minute limit, connection/request timeouts and a 50,000-building cap; oversized selections must be reduced. Failed or incomplete downloads are not cached or silently replaced with sparse OSM data. Source releases, datasets, additional-building counts and height enrichment are recorded in `model-info.json`; `data-sources.txt` includes contributor credits and source-license links in every print pack. Building data is © OpenStreetMap contributors, Overture Maps Foundation and [upstream contributors](https://docs.overturemaps.org/attribution/#buildings), under ODbL 1.0.

Overpass downloads use smaller geographic sections, POST requests, automatic server fallback and further subdivision when servers are busy. Each complete section is cached independently, so a retry resumes the missing sections. Incomplete HTTP 200 responses and corrupt cache entries are rejected. Duplicate OSM IDs are merged while retaining their full geometry; these download sections do not affect print seams. Retries respect server cooldowns and stop after the retry budget (48 attempts or approximately four minutes, with per-request timeouts). A failed download never silently removes vector layers or publishes a partial map. If both public services remain unavailable, click **Generate model** again later to resume; keep `data/cache/` to retain progress.

The application uses public services without API keys. Internet access is needed for uncached geographic data and the basemap. The interface, previews and completed exports run locally; there is **no synthetic fallback** when real data fails. Basemap/search/elevation/OSM providers receive the area or search request; Overture's public catalog and storage receive the corresponding data requests. Generated geometry and project files remain in `data/projects/` on this computer.

Selections support **90°S–90°N and date-line crossings**, with a 2° limit per axis to bound downloads and model size. For a date-line selection, east longitude may be smaller than west. At latitudes beyond 85° the interface switches to an adjustable coordinate view because the street basemap stops before the poles; drag, arrow keys and size controls remain available. Polar selections use [NOAA NCEI ETOPO 2022](https://www.ncei.noaa.gov/products/etopo-global-relief-model) through its public ERDDAP service, at 30 arc-second source spacing (about 928 m north–south). It includes ice surfaces and ocean bathymetry; the exact pole uses the nearest source row. Increasing model resolution does not add source detail. Elsewhere the finer Mapzen terrain tiles are retained. Artwork can be 60–2000 mm per side; a project can have at most 100 tiles. The full-model grid supports 64–1024 samples on the longest edge. Very dense urban selections or high resolutions require more RAM and processing time. One generation runs at a time. Modelling runs in a separate local Python process so native geometry calculations do not hold up job polling, project browsing or the interface.

Enhanced coverage fills many gaps in OSM, but does not guarantee every building or current construction. Imagery-derived outlines and heights are estimates; adjoining houses may be represented by one shared roof outline. Landmark support uses available historic/attraction outlines or simple point markers. This is relief art, not survey-grade data. City models are reconstructed from available open mapped geometry and attributes; there is no universal catalogue of complete photogrammetry or architectural meshes, and the app does not download Google/Apple proprietary 3D imagery. A complete minimum-wall-thickness solver and automatic support planner are not included: minimum dimensions, small-footprint omissions and feature warnings are conservative design checks, with slicer review still required.

## Development and verification

```sh
# Terminal 1: local geometry API
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8765
# Terminal 2: live frontend (proxies /api to Python)
pnpm dev
# Validation
.venv/bin/python -m pytest -q
node tests/frontend-validation.cjs
pnpm build
```

With the local app running and Playwright available, run the `tests/browser-*.cjs` checks, including `browser-cleanup.cjs`, `browser-controls.cjs` and `browser-inspection.cjs` for workspace recovery, numeric/preset/frame controls and keyboard/3D inspection. Set `PLAYWRIGHT_MODULE` to an existing Playwright package and `APP_URL` to the running app if needed. The workflow test generates a small real-data verification artwork and leaves that completed project in the library. Preview checks need a completed project in the library; the inspection check needs a separate frame and accepts `PREVIEW_JOB_ID`.

Tests cover automatic/manual plate fitting, invalid bounds, solid integrated/separate/no-frame exports, seam edge agreement, global volume preservation, neighbour ordering, seam gaps, ZIP/3MF artifacts, STL reloads and height-limit rejection. Every production export additionally checks each actual STL for watertightness, consistent orientation, positive volume and printer fit before publishing its ZIP.

Key source files: `backend/geodata.py` (data), `backend/buildings.py` (Overture downloads, caching and building merging), `backend/geometry.py` (global solids and cutting), `backend/export.py` (validation and packages), `backend/app.py` (jobs and local API), `src/MapView.tsx` (selection) and `src/Preview.tsx` (3D controls).
