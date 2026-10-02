# Desktop UI review — 2 October 2026

Contour Studio now keeps the everyday design flow compact: **Place & size → Style → Make**. The next action remains visible at the bottom of the window.

## What changed

- Three immediate starting choices: Natural, Bold city and Minimal. Landscape, Contour art and personal presets are under **More styles & saved presets**.
- Five icon-labelled Style groups: **Land contours**, **Map features**, **Print colours**, **Frame & caption** and **Special places**. Each closed group describes the current settings. Opening one main Style group closes the previous group without losing edits.
- Roads, water, buildings, landmarks, forests and fields are together under Map features. Dimensions, smoothing, colour overrides and precise positions are in their relevant detail groups.
- Printer, tile layout, joining details and exact coordinates have their own groups. Printer presets are immediately available when Your printer opens; exact dimensions remain under Change printer settings.
- Portable settings import/export are grouped under Design files. Help has a visible desktop label. Symbol controls and direction indicators use SVG icons.
- Draft messages refer to this device. System fonts remove the Google Fonts dependency from startup.
- Review settings opens the relevant group and its precision controls. Failed generation preserves the design and offers style review and, when colours are enabled, a single-colour retry.
- Numeric Escape restores the original value, invalid-input feedback keeps download buttons in place, saved style replacement preserves its identity, and blank special-place names show an actionable hint.
- Crop proportion choices survive reload. Starting choices, imports and navigation invalidate pending place searches. Failed project loading keeps the current artwork and the library open with a retry action.
- Preview selection, hidden frames, isolation and whole-artwork fitting now work together. Image saving gives success/error feedback. Layout inspection supports keyboard navigation and clips tiles to the rounded artwork outline. Assembly instructions follow the actual model's frame version.
- Separate frames now have a continuous 2 mm retaining lip with a matching 45° underside seat on the landscape insert. The frame opening widens upwards. Contour/water tangency sheets and coincident material boundaries are repaired before strict export validation. Rear lettering starts on the print bed inside its recess.

## Verification

Production and hosted TypeScript/Vite builds and frontend settings validation passed. Browser checks cover keyboard disclosure, one open main group, persistent edits, reload, invalid numeric input, undo/redo, dimensions, printer choices, imported settings, saved styles, landscape controls, palettes, marker duplication and the project library.

Layout checks cover 1920 × 1080, 1366 × 768, 1280 × 720, 1024 × 576, 900 × 650, 960 × 480, 900 × 500, 683 × 384, and 390 × 844. The smaller CSS viewport checks approximate a scaled laptop display; they do not constitute a physical Windows DPI trial. The header, navigation and primary action remain within the viewport. No JavaScript page errors were observed in the passing UI journeys.

The final cleanup also passes 320 px preview/layout checks, Chrome and WebKit map and artwork-sizing journeys, polar marker placement, search-race/project-failure recovery, numeric download interaction, preview and package inspection, and the static hosted workflow. The full local browser workflow completed real search, marker placement, generation and validated ZIP download (`e2249605-12e0-481a-918c-fbd63f0c54b0`). Final local/hosted builds, frontend validation and all **204 Python tests** pass.

Final separate-frame app job `73351ebb-197f-4b56-81cc-7782f87d4228` publishes the corrected Keswick terraced-water colour pack with frame, key and fit files. Bambu Studio 02.08.02.61 sliced its terrain rear-down with stock P2S 0.4 mm / 0.20 mm Standard / Generic PLA settings and supports off, with no slicer warnings. Spatial toolpath analysis found zero Bridge or Overhang wall paths along the exterior above the seat, excluding the intended registration pockets. Internal infill roofs, key pockets and label recesses still require short bridges. The final seat fixture and frame slices also passed. Evidence is under `data/ui-cleanup/slicer/`; no physical fit or print trial is claimed. Older print packs need **Update model** for these corrections.

The richer final app generation `e0ef34a5-c4d8-474a-bf48-540ea4860100` also completed: 400 × 280 mm, four terrain tiles, four separate frame pieces, 660 buildings, raised roads, smooth water/banks, woodland trees, field furrows, rear labels and keys, and four suggested filament colours. Strict parent/material volume closure and every local STL reload pass. Finite paint insets avoid tangent sheets along draped road/ridge walls; building paint masks fully cover physical walls after snapping. The physical parent shape is unchanged by those paint adjustments. The dense B1 terrain and its keyed frame slice with no warnings and no exterior Bridge/Overhang wall paths outside registration pockets. Its colour 3MF also slices as one object without warnings; the CLI stock-filament diagnostic is a geometry check, not physical AMS tray validation.

The compiled local workspace completed a real settings import, single-colour generation, fully loaded 3D preview and validated ZIP download (job `7163557f-10c6-468b-8f9a-717a6d44e5fe`). A separate real colour-export failure confirmed that the single-colour recovery preserves the design and completes a new print pack (job `224c25f5-928d-4d9a-bd83-f8cbc25fec5f`). Job reconnection, interruption retry and the static desktop handoff also passed.

Screenshots and the generation check's job ID are under `data/ui-review/` locally and are excluded from release archives.

## Remaining release checks

Windows installation, native WebView2 rendering, draft persistence, installed-engine generation and uninstall have passed on a GitHub Windows runner. Real-data generation, native file downloads and 100–200% display scaling still need trials on personal Windows computers. Builds remain unsigned; Intel Mac remains untested. The installer and verification instructions are in DESKTOP.md.

The initial multicolour mesh failures are resolved. Colour regions now split once around a shared level inner core; coherent supported-tree meshes and bounded field-corner overlap avoid coincident feature contacts. Raw geometry is retained when its actual local binary STL is valid; bounded simplification is available when required, with every stage compared against the original native volume. Failed exports remain unpublished.

The earlier multicolour integration passed **197 Python tests**, frontend validation and the production build. Real app generations completed a 400 × 280 mm four-colour landscape (`70c47a49-f4b5-47c4-80d9-e099cb9fda38`) and the 600 × 600 mm City of London (`48891a2e-881c-4ea4-85b0-2d62b4558267`). Actual colour preview, live palette changes, selection/isolation, PNG export, all material downloads and mobile layouts passed without page errors. All four colour 3MFs passed Bambu Studio CLI import and manifold checks. Printer profiles and physical AMS tray mapping remain slicer choices. Those checks were import checks; the targeted final geometry slicing is described above. Detailed evidence is recorded in VERIFICATION.md.

## Desktop release preparation

The final source suite passes **205 Python tests**, including native startup recovery, scaled Windows window sizing and adjacent-building colour closure. The grouped UI passes the desktop/browser regression with no page errors. The Apple Silicon app contains the current compiled interface byte-for-byte, has been opened in its native window, restored the Style draft after closing/reopening, and passed its frozen watertight STL/ZIP and worker-error check. The Windows setup detects and verifies WebView2 before installing the app. Its installation/rendering/persistence/engine/uninstall trial has passed. Windows opens maximised and limits its restored size to the display; compact CSS keeps the map and main action usable on short viewports. Candidate installers are in releases/.
