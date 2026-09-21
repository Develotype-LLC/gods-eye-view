# LANDMAN cartography audit — read-only, 2026-09-21

## Evidence and scope
Reviewed actual Cesium renderers and server viewport aggregation, not just sidebar swatches. No application changes. Root separately observed live overview: overlapping white cluster counts on teal well circles over imagery, while sidebar swatch is amber. All other findings below are code evidence; not claims of live UI validation.

## Highest-value changes

1. **P1: an always-visible active-map legend that matches the renderer**, with unit, reporting date/window, source footprint and no-data meaning. Sidebar currently identifies datasets, not what symbols measure. Wells actually change from amber points to teal clusters. Most layer colors are categorical, not quantitative.
2. **P1: scale-aware wells and seismic overview**. Current server grid clusters preserve counts, but point locations represent averages, and grid size changes with viewport. Prefer explicit count bins at regional scale and individual records close up. Count bins are not density until normalized by area; viewport-relative bins cannot support visual comparisons across zooms. Offer a density mode with a fixed physical aggregation cell size and count/km², or a clearly labeled kernel-density mode with a stated physical bandwidth. Never imply reservoir pressure or seismic hazard from a dot-density surface.
3. **P1: ownership status map**. Current parcels all same gold; selected owner's parcels cyan. Add selectable thematic modes: neutral boundaries, owner identity, relationship status, unresolved-owner research. Unknown-owner parcels need distinct hatching/outline and separate parcel IDs, never one implied common owner. Keep source-record absence distinct from unknown name. Surface appraisal ≠ title/mineral ownership/easement permission.
4. **P1: distinguish the two true surface maps**. Terrain is metre elevation relative to reference A; satellite motion is LOS velocity mm/year or dated LOS change mm. They share the same diverging palette helper today, inviting confusion. Explicit map-mode/title/units/date legend and a one-active-surface default would help more than arbitrary extra colors.
5. **P2: activity magnitudes as proportional symbols**. Injection, flares, cooling demand and earthquake magnitudes currently use largely identical fixed-size dots. Add meaningful size encoding only after a typed numeric endpoint and clear quantity/time aggregation exist. The current generic viewport API mostly returns geometry and only a special ET value; sizing these correctly is not just a CSS change.

## Layer-by-layer proposals

| Layer | Actual current rendering | Proposed default / optional mode | Coverage and interpretation limits | Priority |
|---|---|---|---|---|
| Texas wells | 9px amber point; count-based logarithmic teal clusters, white count labels. | Regional fixed-resolution count bins or count clusters with deconflicted labels; close-up well symbols by RRC class. Optional count/km² density. | Published location classification is not current production; no production heat map from counts. | P1 |
| Inactive wells | Pink 8px points; same-color unlabeled logarithmic count clusters above 1,000 in viewport. | Same well location language with inactive-state shape; monthly snapshot filter; optional count bins. | August 2026 source; API-linked coordinates from GIS vintage may differ. | P2 |
| Plugging history | Lavender 8px points/clusters. | Point symbols colored by action date or count bins by selected period; distinct-well vs action-count toggle only with appropriate aggregate. | 2015–2026 history, current year partial; actions ≠ wells. | P2 |
| Injection reporting | Purple 8px points/clusters; not sized by injected quantity. | Proportional circles for reported monthly/annual volume; missing/reporting-gap/zero distinct. Optional fixed-area summed-volume bins with units/time. | 1,077-feature reporting subset, not statewide inventory/capacity. Do not spatially smooth into subsurface pressure. | P1/P2 |
| Terrain elevation | Continuous Cesium globe ElevationRamp, blue–cream–orange diverging around A, configurable ±10–2,000m (default100m). | Keep continuous surface; visible A/reference elevation, ±range, metre legend, contour optional; isolate from motion. | Terrain provider ellipsoidal height, not surveyed elevation or ground change. Turns photoreal off to imagery. | P1 |
| Geological basins | Gold outlines 2px and 12% gold polygon fill, all basins same. | Muted outline/no fill default; selected basin emphasized and labeled; basin/subbasin hierarchy if separately sourced. | Simplified USGS regional interpretations, not formations or land boundaries. No heat map. | P2 |
| Earthquakes | Coral 8px points/clusters; no magnitude encoding. | Graduated magnitude symbols with explicit magnitude legend, date filter and optional depth color; count bins for overview. | Reviewed TexNet snapshot 50,832 source records; clustered counts are not energy or hazard. Magnitude is logarithmic: avoid unlabeled literal area proportionality to magnitude. | P1/P2 |
| Ground movement | ASF tiled LOS velocity raster ±30mm/year recolored diverging; Permian selected-period image rasters ±100mm. | Keep measured/derived raster; two explicitly named modes: Long-term LOS velocity vs Dated LOS change. Coverage mask, actual dates and orbit direction always accessible. | National valid observations only; dated maps are Crane/Tubbs and Toyah archive footprints ending Dec2025, not all Permian; invalid endpoints transparent; not vertical settlement. | P1 |
| Land ownership | Gold parcel polygons22% fill/1.5px outline; count clusters above600 records; selected-owner cyan35% fill/cyan outline. | Neutral parcel outline; color by selected thematic attribute and highlight selected owner. Unknown/coverage separate patterned styles. At broad scale coverage counties/basins before parcel counts. | TxGIO46counties intersected with two basins; multiple appraisal accounts ≠ extra physical parcels; normalized names ≠ verified party. No owner density heat map as rights proof. | P1 |
| Pond candidates | Cyan8px points, no pond footprints. | Distinct pond-candidate symbol; optional modeled-size symbol visibly marked estimated, initially retain equal symbols. | 52 curated points; proximity-derived attribution and assumed-depth volumes, no footprints/measured capacity. No continuous water surface or pollution heat map. | P2 |
| Water facilities | Blue8px regulatory points/clusters. | Facility icons by type with status filter; group nearby symbols. | NM563features; even pipeline records are points, not route lines; permits ≠ throughput. | P2 |
| Disposal wells NM | Amber8px points/clusters. | Well symbol with disposal type/status; quantity size only when actual reporting added. | 5,114 snapshot records incl inactive/plugged, not spare capacity. | P2 |
| Storage tanks | Beige8px points/clusters. | Tank symbol close up, count bins/cluster overview; estimated diameter/volume optional with explicit estimate flag. | 8,892 imagery detections; content/operator/capacity unverified. No generic density as available storage. | P2 |
| Cooling-water demand | Blue8px facility dots. | Facility symbols sized by selected reported withdrawal OR consumption in million gallons for named period; clearly separate metrics. | 106 historical2018features; potential demand context, not verified customer or current demand. | P2 |
| Annual flares | Yellow8px dots/clusters. | Graduated annual flare quantity if numeric source/units exposed; otherwise detection symbols, optional detection-count bins. | 1,850 annual2024detections, not live fire; no verified operator; source confidence not operating probability. | P2 |
| Evapotranspiration | Polygon35% fill PLUS centroid8px; ET value HSL color from green toward warm for0–300; missing same generic green as dataset, no explicit no-data style. | Field polygon choropleth sequential single-hue/perceptual ramp, fixed mm/month breaks, ET/ETo selector, missing gray/hatched; suppress redundant centroid except small-field pick aid. | Only42Lubbockfields monthly2018. Do not interpolate into regional raster; ETo reference demand not actual ET. | P1/P2 |

## LONG-Haul and selection overlays

Actual renderer: selected route6px teal, other routes2px gray45%; context pipelines2px lavender50%, water blue, rail peach, roads pale gold1px50%; sourceAteal, deliveryBamber, VIAgold; exclusions red25%; white study boundary50%. Context only first2,000features drawn although routing uses returned inventory.

- Keep routes as lines. Distinguish alternatives with line pattern/number labels as well as hue; selected route bright with dark casing against imagery. Exclusions need hatch/dashed boundary so red is not mistaken for earthquake/thermal intensity.
- Provide a compact route legend and explicit context display count: “2,000 of N infrastructure features shown.” Otherwise empty-looking map can contradict route crossing metrics.
- Show crossed parcel strips/outline at useful zoom, using a selectable ownership research theme; known owner group identifier separate from parcel identifier. Relationship/willingness overlays must respect authorized project scope and show assessment state, not pretend measured probability.
- Candidate route selection teal, owner selection cyan and pond cyan currently compete. Reserve a consistent high-contrast selection treatment (white/dark casing) across objects rather than rely on new hue alone.
- Add crossed-road/rail/water markers only for selected route and deconflict at broad scale. Name/metric popup would connect route table counts to physical crossings.
- Do not depict search corridor proximity as purchased right of way or existing pipe capacity.

## Implementation design before any palette rewrite

A layer-style registry should specify `geometry`, `overviewMode`, `detailMode`, `quantity`, `unit`, `period`, `breaks`, `noDataStyle`, `legend`, `selectionStyle`, and source footprint. Keep qualitative identity separate from quantitative ramp. Current colors duplicated in landmanModel.js/records.js; special renderer wells and shared terrain/motion diverging helper disagree with simple sidebar swatches. Use shape/pattern/text so interpretation does not require color discrimination. Review against both imagery and a subdued basemap.

### Source pointers
- `src/reference/landmanModel.js:15` all16Landman layers and sidebar swatches; views near170.
- `src/reference/records.js:2,19-32` actual generic symbol colors,8pxpoints/logclusters,ETspecialHSL,polygon35%.
- `server/providers/reference-records.js:16-36` count>1,000 viewport28×20bins; genericvalue is ET-style observation query.
- `src/reference/texas.js:17-20` well actual tealcluster/amberpoint mismatch and labels.
- `src/reference/land.js:121-181`; `server/providers/land.js:126` parcels/countthreshold600.
- `src/reference/ownerWorkspace.js:165-175` cyanselectedownerpolygons.
- `src/reference/basins.js:6,32-48` goldregionalboundaries.
- `src/reference/terrainDifference.js:20-38,55-67` ramp/defaultreferenceandmapstack.
- `src/reference/locationModel.js:4-11` sharedbluecreamorangeRGBA190.
- `src/reference/groundMotion.js:108-159`; `motionTile.js:18`; `motionHistoryPanel.js:7-8` actualnationalvslocaldatedraster.
- `src/reference/pipelinePlanner.js:210-340` routes/context/selection/exclusions.
- `src/reference/catalog.js` source coverage/quantity/uncertainty records for all datasets.

All proposals are product/cartographic judgments grounded in current code; no external technical claims or newly verified data sources added.
