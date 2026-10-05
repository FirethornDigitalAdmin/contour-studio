# Printable transport and city detail

In **Make it yours → Transport & urban land**, choose **Add transport & city detail**, then update the model. Each effect can also be enabled separately. Existing saved designs default to their previous behaviour; saved settings, drafts and custom styles retain the new choices.

- Railways use mapped active rail, light rail, tram, narrow-gauge and preserved routes, including sidings and yards where mapped. Platforms use available mapped outlines. Underground railway sections are hidden. Track beds are at least six nozzle widths. Individual rails and sleepers are at least two nozzle widths and appear only when the real scaled gauge leaves a nozzle-width gap and fits inside the bed; otherwise a continuous supported bed is used. Parallel routes can merge at wider-area scales. Sleeper geometry is limited to 1,200 pieces per model; rails and beds remain continuous.
- Road hierarchy uses mapped road width where available, otherwise class-based relative widths. Roads and paths are at least two nozzle widths in this mode. Road width remains the reference width; main roads are wider and smaller paths narrower. Proposed/construction roads are excluded.
- Parks, gardens, recreation grounds, pitches and golf courses use smooth green relief. Parking, industrial, commercial, retail and railway land use smooth road-coloured relief. Surfaces rise 0.2 mm, follow the terrain, exclude buildings and water, and remove strips below two nozzle widths. Green space does not invent individual trees or sports markings.
- Mapped road and railway bridges use fully filled supported relief decks. There is no open underside, cantilever or floating span. This deliberately fills crossing voids to avoid support material. Underground roads are hidden when supported crossings are enabled. Source coverage determines which crossings can be recognised.
- When small-building enhancement would close neighbour or street gaps, gap preservation retains the original outline if it is at least two nozzle widths; smaller outlines are omitted. Mapped adjoining terraces and overlapping building parts remain mapped adjoining forms. This cannot recover individual houses absent from the source.
- Type-based height estimates use the configured fallback height as a reference for mapped building types. Measured/source heights and mapped levels take priority; uniform style retains a uniform height. Estimates and omissions are reported in model-info.json.

All additions join the supporting terrain solid before tile cutting and use the existing export validation. Tracks and hard urban surfaces share the roads filament; smooth parks share the forest filament. No additional AMS colour is required. Printer height violations stop generation. Binary STL and colour regions must pass the existing watertightness, orientation, positive-volume, volume-preservation and build-plate checks before the package is published.

## Verification — 4 October 2026

The full combined Python suite passed (305 tests), including production single/multicolour export, binary STL reloads, terrain styles, tiles, supported crossings, close-scale curved tracks, gap preservation and railway simplification. Production frontend build and frontend validation passed. Browser checks covered the new controls, settings download, draft reload, and 390/768/1440 px layouts with no page errors; existing landscape controls also passed.

A real OpenStreetMap Bolton selection generated 21 railway sections, four green areas, ten hard urban areas and twelve supported crossings. All track sections used beds at that artwork scale. The review pack is in `data/infrastructure-review/bolton/`; it is a separate QA sample, not a replacement for a saved project. It uses the QA design's OSM-only building source.

These are digital geometry/export checks. No physical print or target-printer slicing trial has been performed for these additions.
