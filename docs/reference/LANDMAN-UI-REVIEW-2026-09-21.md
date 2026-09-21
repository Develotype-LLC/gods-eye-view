# LANDMAN UI and map review — September 21, 2026

Status: proposals for Brian and Dia to review. No application changes or deployments.

Three independent source reviews covered workflows, cartography, and clarity/accessibility. A live browser walkthrough checked Overview, Water, ET fields, and the Ground movement controls. This was not a full accessibility audit or a validation of every source record.

## What the current app shows

- Overview: large teal well-count circles and overlapping labels crowd Texas. The sidebar well swatch is amber; actual individual wells are amber and clusters are teal. A single swatch does not explain this change.
- Water: several types of assets appear as similarly shaped colored circles. Active water layers can be below the sidebar fold while inactive oil/gas layers occupy the visible list. The inspector describes one dataset, but there is no persistent combined legend.
- ET fields: field polygons already exist, alongside centroid markers. The inspector correctly discloses the 42-field Lubbock sample and 2018 reporting periods. Missing observations use green, which can resemble a valid ET measurement.
- Ground movement: the current controls explicitly distinguish national long-term velocity from dated pilot maps and point history. Preserve those distinctions; make the selected metric and dates easier to see without reading the entire panel.
- Source review confirms that terrain and ground movement use the same diverging ramp and can blend. Layer exploration can enable a layer and fly the camera; presets replace the visible layer set.

## Recommended first batch: map readability

1. **Persistent active-layer legend.** Match the actual point, cluster, line, polygon or raster. Show metric, units, observation period, coverage and no-data meaning. Include details and opacity controls without requiring camera movement.
2. **Reduce well clutter.** Use clearly labeled count bins at regional scale, then individual assets close up. Start with a count view; offer count/km² only when normalized by physical area. Keep aggregation stable enough that changing zoom does not imply a data change.
3. **Establish a visual hierarchy.** Subdued geology and parcel boundaries; distinct well, disposal, facility and candidate-pond symbols; strong selection outlines independent of dataset color. Offer a quiet analysis basemap alongside imagery.
4. **Separate quantitative shading.** Show terrain or satellite movement as the primary map shading by default. Preserve both tools and their separate reference points. A later comparison view can use swipe or side-by-side.
5. **Fix missing-data appearance.** Gray/patterned ET no-observation state, explicit zero, coverage boundaries, and fixed numeric legends for comparisons.
6. **Separate Details from Zoom to coverage.** Preserve the selected location while inspecting data. Make preset replacement behavior explicit and surface currently active layers at the top.

## Which representation fits each question?

| Data / question | Recommended representation | Meaning to preserve |
|---|---|---|
| Texas wells, inactive wells, plugging | Regional count bins; distinct points close up | Well counts and plugging actions are different; neither is production |
| Injection reporting | Points sized by reported volume for a chosen period; optional volume bins | Requires numeric metrics and completeness checks; missing report is not zero |
| Earthquakes | Magnitude-sized event symbols; optional event-count bins | Count concentration is not seismic hazard |
| NASA ground movement | Diverging raster with coverage mask | LOS velocity in mm/year or dated displacement in mm; not vertical settlement |
| Terrain relative to selected A | Diverging continuous surface centered on A | Metres relative to A, separate from satellite change |
| ET | Field polygon shading on a fixed mm/month scale | Retain actual field boundaries; do not interpolate the 42-field sample across Texas |
| Parcels and ownership | Boundaries with selectable owner/class/relationship/research themes | Unknown parcels stay separate; appraisal names are not verified title or mineral rights |
| Basins/sub-basins | Restrained, labeled boundary hierarchy | Requires separately sourced sub-basin boundaries; no heat map |
| Ponds, tanks, water facilities, disposal wells | Distinct asset symbols; real footprints when available | Imagery candidates and permit points do not establish capacity or operations |
| Flares and cooling-water demand | Proportional symbols once the correct reported metric is exposed | Annual/historical observations, not live operations or verified customer demand |
| LONG-Haul | Labeled route lines, selected-route casing, clickable crossings | Existing infrastructure proximity is not permission or available capacity |

A smooth heat map is appropriate only when its interpolation or density calculation has a clear meaning. Regional concentrations should begin with auditable bins. Continuous terrain and NASA surfaces already have a different, quantitative purpose.

## Next batch: ownership and planning workflow

- Organize entry points around **Explore land**, **Water assets**, **LONG-Haul**, and **Ground movement**. Add Permian/Palo Duro shortcuts and an explicit Land & owners view.
- Split LONG-Haul into **Setup → Compare → Land review**. Keep operating presets prominent and advanced routing penalties secondary.
- Move the owner-priority slider into comparison and label that it ranks the generated alternatives; it does not reroute them.
- Preserve separate known-name, parcel, unresolved-parcel and coverage metrics. Add concise definitions near the numbers.
- Give owner profiles a summary first, with deliberate editing sections. Add a project-scoped research/follow-up worklist and route owner relationship summaries.
- Make crossings and unresolved parcels selectable from results, with map highlighting and source links.
- Later: named shared studies, saved candidate selection and review status. Keep private relationship information separate from public exports.

Private relationship project membership remains a separate access setup; the current no-project state should explain available actions without implying access exists or automatically granting it.

## Proposed order and review decisions

**Recommended:** map readability first, ownership themes second, LONG-Haul workflow third. Quantitative injection/flare/cooling symbols follow typed metrics and reporting checks; these are data changes as well as UI changes.

Before implementation, choose whether wells should default to count bins or reduced-label clusters, whether the quiet analysis basemap should become the default, and whether the first ownership theme should emphasize owner classes or unresolved research work.

Acceptance review should cover Texas, basin, county and parcel zoom; imagery and a quiet basemap; multiple active layers; selection; empty/missing observations; and keyboard/focus behavior. Verify that legend colors match actual renderers and that periods remain comparable. No compliance claims until tested.

## Detailed agent reports

- [Workflow review](ui-review-2026-09-21/landman-workflow-review.md)
- [All 16 layers and route cartography](ui-review-2026-09-21/landman-cartography-review.md)
- [Clarity, legends and accessibility](ui-review-2026-09-21/landman-clarity-review.md)

Reports include source pointers and implementation dependencies. Findings about code are distinguished from the live observations above.

## First implementation · September 21, 2026

Implemented the readability batch: collapsible persistent active-map legend, active layers first, separate Details and Zoom actions, larger switches, shared distinct asset symbols, subdued geology/parcel context, smaller well clusters with labels suppressed when crowded, fixed ET bins with gray missing values and polygon outlines, and mutually exclusive terrain/NASA shading in Landman mode. The full console retains independent layer controls.

This release retains existing count-preserving viewport clusters; it does **not** implement fixed-area density bins. Quantitative volume symbols, ownership themes/worklists, quiet-basemap shortcuts and the LONG-Haul workflow redesign remain subsequent work.

Validation: production build and package boundaries passed; 49 reference tests passed, including concurrent surface switching and ET null-versus-zero checks. Full suite: 4,195 passed, one skipped, one existing icon-font scanner failure involving unchanged library/owner UI text. Live browser checks covered the legend, Water symbols, layer Details preserving camera/visibility, ET field geometry and surface switching. Browser review found and corrected active-group ordering and an off-layer notice hidden by existing inspector CSS. ET opacity/boundaries were strengthened after reviewing bright imagery.

## Next batches implemented

- Texas wells: fixed EPSG:5070 equal-area density cells (10, 25, 50 km), stable sequential scale, cell inspection and explicit location/density controls. Full-cell counts are cached by import version/category/resolution with bounded entries. These measure inventory locations, not production or operating status.
- Land & owners preset and parcel themes for owner class/research status. Unknown and partially named parcels stay distinct; name matches remain unverified, and reviewed classification is not title verification. Regional clusters require zooming before parcel themes apply.
- LONG-Haul: Setup, Compare and Land review steps; persistent endpoints/route summary; ranking slider beside alternatives; advanced assumptions collapsed; mapped crossings can be located on the map. Existing routing and hydraulic calculation scope is unchanged.
- Private owner workspace: summary before editing plus a project-scoped follow-up directory filtered by name, relationship, due status and team contact. Existing access checks remain mandatory; no memberships granted.

Validation before deployment: 53 reference tests, import/package boundary checks and production build passed. Read-only live SQL returned 1,186 statewide 25-km cells containing 1,396,962 well locations and six detailed parcels with ownership classifications. Full suite: 4,200 passed, one skipped, one existing Material Symbols text-scanner failure; cache regression was added and passed afterward. Browser verification is recorded separately after activation.
