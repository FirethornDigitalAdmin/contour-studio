# Forest and field customisation

The Forests & fields section now shows the main style choices whenever each effect is enabled. Size, spacing and direction stay in expandable controls.

- Forest treatment: low canopy or individual trees.
- Tree grouping: clustered groves (the new default), or evenly spaced woodland. Groves contain up to seven crowns, clipped to mapped woodland with gaps between groups. Small woodland fragments retain an interior-tree fallback.
- Tree type: rounded broadleaf, pointed conifer, or deterministic mixed woodland. Tree type applies to individual trees; low canopy retains its low crown profile.
- Field treatment: rounded crop lines (the new default), square crop ridges (the previous furrows style), or smooth fields. Rounded lines round the row ends and corners in plan; their top follows the terrain.

All choices are included in saved settings, drafts, custom style presets and backend validation. Previously saved explicit field styles remain selected. Apply Add landscape detail to choose grouped mixed trees and rounded crop lines together. Update the model to regenerate its printable geometry.

## Verification on 3 October 2026

Production build and frontend validation passed. The browser landscape check passed: style choices, saved custom styles, refresh persistence, mobile/tablet/desktop layout and no JavaScript page errors. Focused geometry checks passed for all six tree-type/grouping combinations, connected terrain and round-tripped binary STL, deterministic placement, compact woodland fallback and rounded field boundaries (13 tests).

The broader multicolour suite reported failures while the shared terrain-following colour-core code was being modified concurrently in this checkout. Those shared changes were preserved. Multicolour export is therefore not fully verified by this change; the focused connected single-colour exports are verified.


## Real trees outside woodland — 4 October 2026

Enable Trees & woodland and update the model. Existing settings use the same `forests` switch.

- OpenStreetMap individual tree points retain their mapped centres with stylised printable crowns. Overlapping crowns or details too close to exclusions/edges are omitted, never moved.
- OpenStreetMap tree rows remain continuous strips along the recorded line. Strip width is a print setting, not a measured canopy width. Groups with polygon geometry retain their boundary and holes; point-only groups do not establish cover and are skipped.
- Forest Research Trees Outside Woodland canopy polygons supplement OSM around England. Queries use the public regional feature services, complete pagination, a 30-day cache and a 20,000-feature limit. Additional canopy is omitted above 100 km². Service failures are disclosed and leave OSM detail available; failed/incomplete regional downloads do not add a partial subset.
- Canopy patches and rows follow the terrain with rounded, lobed foliage relief, without generating trunk locations. Features narrower than two nozzle widths may be omitted. Export summaries separate mapped trees, rows, canopy patches and illustrative woodland texture. Source attribution and limitations travel in the model and download package.

Woodland grouping/type/spacing controls still affect the existing illustrative forest texture; they do not determine where real mapped points, rows or canopy outlines are located. Canopy data is derived from lidar and imagery with varying survey dates, minimum 3 m height and 5 m² area, and possible classification errors.


### Rounded foliage silhouettes

Mapped broadleaf points now use a supported stem and rounded crown. Crown flares are limited to 45 degrees from vertical; the stem widens automatically for short/wide crowns and remains at least two nozzle widths. Conifer selection keeps the tapered silhouette. Mapped rows and canopy patches have curved, lobed roofs instead of flat extruded tops. Lobes are decorative foliage within the recorded cover, not new tree or trunk positions. The canopy remains supported continuously down to terrain, with real holes and feature clearances retained. Tree rise controls this foliage; woodland spacing still controls only the existing illustrative texture.
