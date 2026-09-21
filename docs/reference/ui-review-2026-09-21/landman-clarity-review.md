# Landman clarity, legends and accessibility review

Read-only source review, 2026-09-21. No live-browser or contrast measurements; root agent owns visual verification. No application edits.

## Highest-value findings

1. **Active-layer legend is effectively removed in Landman mode.** `src/ui/styles/landman-workspace.css:321–328` hides records-panel's `[data-legend]`; remaining layer switches use only a 10px colored knob (`:207–226`). `src/reference/records.js:22` renders nearly every reference class as the same 8px circle. With several layers on, users must remember which small color means which dataset. Proposed: a compact always-visible active legend containing actual map symbols, dataset name, quantity/unit/date and display mode. Clicking a legend entry opens its inspector. Keep toggles independently named and keyboard reachable. Priority P1.

2. **No-data ET is a plausible measured color.** `src/reference/records.js:20–22` falls back to green `#77db88` for missing ET; ET's valid ramp passes through green. `recordsPanel.js:11` acknowledges this in prose, but map appearance is ambiguous. Proposed: gray/hatched polygon or outlined no-value marker, explicit 'No observation' category, never color null as a valid measurement. Keep zero at the actual scale minimum. Priority P1.

3. **Terrain and satellite movement use the identical blue/cream/orange diverging ramp and can blend.** `locationModel.js:4–11`, `terrainDifference.js:27`, `motionTile.js:18`, `library.js:240`, `locationInvestigation.js:32`. Existing text warns about blending, but cannot make blended pixels quantitatively interpretable. Proposed: one quantitative raster displayed at a time by default, with explicit 'Replace map shading' action; preserve both toggles as available analyses. Later add swipe/side-by-side. Persistent legend says 'Terrain relative to A · m' or 'Satellite LOS change · mm · dates', with reference point and limits. Priority P1.

4. **Many similar gold/tan point classes collide with land and basin outlines.** `landmanModel.js:15–160` and `records.js:2`: wells #e6bd76, disposal #efbc68, tanks #d7bd8b, flares #ffc24b; parcels #d8be7a and basins #e6b96b. This is a finite semantic palette problem, not simply choosing more colors. Proposed: use geometry/shape and hierarchy, not 16 unique hues. Basins subdued dashed outlines without fill by default, parcel thin neutral outlines, active owner/parcel stronger selection, categorical assets use glyphs/shapes. Priority P1/P2.

5. **Quantity mostly does not influence point appearance.** `records.js:20–22` uses fixed dots for earthquakes, flares, injection, cooling demand and facilities; only clusters change size, by log count. Proposed: preserve precise point mode, add explicit density/quantity modes where scientifically meaningful, with unit-specific legends. Do not let a 'heat map' label ambiguously mean counts, magnitude, volume or uncertainty. See table below. Priority P2.

6. **Time and coverage are correctly disclosed, but scattered.** `motionHistoryPanel.js:6–14` explicitly separates map-period and point-history controls; national map velocity vs dated pilot displacement is explained, 10yr map disabled, pilot footprint/end date retained. This is good evidence behavior. `landmanModel.js` has hard-coded source dates, while `recordsPanel.js:28–36` reports import date and reporting period separately. Proposed shared data badge: 'Observation period / geography / imported or refreshed date / snapshot or live'. Use catalog metadata for badges. Show these directly in active legend, not only deep inspector. Never imply US full valid coverage or entire Permian dated maps. Priority P2.

7. **Tap targets too small; canvas features lack equivalent record navigation for all layers.** Landman toggle explicitly 26×16px (`landman-workspace.css:207–210`); reference markers 8px. Land parcels have first-50 list (`land.js:199+`), while reference datasets require canvas picking for generic details (`recordsPanel.js:45+`). Proposed 40–44px row-level activation region with unchanged small visual switch; visible selected state and focus; keyboard-accessible nearby-record list and searchable/tabular results. Do not claim accessibility compliance without keyboard and contrast testing. Priority P2.

8. **Selection styles compete with water symbology.** Owner highlight cyan (`ownerWorkspace.js:159–175`), selected route teal (`pipelinePlanner.js:328–341`), pond teal, water blue. Proposed universal selection halo (white outer casing + dark inner edge) combined with numbered labels, thicker outline, inspector heading and selected-row state. Selected state should survive grayscale or a saturated raster. Route alternatives need labeled route badges/line styles, not only thinner gray unselected lines. Priority P2.

## Per-layer representation recommendations

| Layer | Default | Optional analytical view | Important safeguard |
|---|---|---|---|
| Wells / inactive / plugging | Clusters at regional scale; distinct icons at asset scale | Fixed-area count bins or density | Caption 'well count' or 'plugging actions'; date/status filters; not production heat |
| Injection reporting | Asset points, sized by selected period volume if valid | Aggregated volume per fixed area, or clearly labeled density of reporting wells | Missing report vs zero injection; subset coverage; no volume inference from point count |
| Earthquakes | Circles sized by magnitude, filtered by time | Event-count density explicitly separate from magnitude | Do not call density a hazard/risk map; retain event dates/depth |
| Flares | Facility/detection points | Proportional symbols for measured annual metric if present | Detection count is not emissions; annual snapshot label |
| Ponds | Actual polygon when available; inference-specific dashed boundary | Optional area aggregation | 'Candidate / imagery-derived', not confirmed produced-water asset |
| ET | Field polygon choropleth, centroid marker suppressed at detail zoom | Monthly comparisons on fixed numeric scale | mm/month, ET vs ETo, 42-field 2018 pilot, null separate from zero |
| Parcels / ownership | Neutral boundaries; owner/relationship mode explicitly chosen | Categorical owner class, private relationship or research status | Unknown owner separate research parcels, not one owner; willingness not numeric probability |
| Ground movement | Measured raster | Dated difference map only in available footprints | LOS sign and mm vs mm/year; no-data mask; no unsupported interpolation |
| Terrain relative to A | Diverging raster centered zero | Contours/profile | Metres relative to visible A; separate from ground movement |
| Basins / sub-basins | Thin boundaries / restrained labels | Optional low-opacity category fills | Geological context must not cover parcel/asset legibility |

## Coherent palette/legend system to prototype

- Context: neutral slate/gray boundaries, low visual weight; basin outline dashed and labeled.
- Oil/gas asset family: amber/orange, with circle well / outlined inactive / cross plugging; never color alone.
- Water infrastructure: blue/cyan family, distinct disposal triangle / facility square / pond polygon.
- Events: orange/vermilion circle with magnitude-size legend; time window explicit.
- Commercial/research workflow: dedicated categorical mode, with named states and line patterns/icons. Unknown = gray hatched; do not paint unknown as favorable green or group all unknown parcels.
- Sequential quantities: one perceptually ordered ramp per active quantitative theme, with numeric tick labels and capped-end notation. Avoid ad-hoc HSL hue traversal. This is a design proposal, not yet a validated palette.
- Signed differences: diverging blue–neutral–orange centered on a meaningful zero. One raster at a time or split view prevents semantic mixing.
- Selection: high-contrast dual outline + label, independent of data color.
- Missing/outside coverage: distinct labeled swatch and footprint boundary; transparent absence alone is insufficient.
- Legend card schema: actual symbol/ramp, layer + metric, units, observation period, aggregation/scale, no-data swatch, coverage badge, source link, opacity, inspect action. Separate import date from observation date.

## Suggested review decisions

1. Approve first: unified legend + no-data semantics + one quantitative shading layer at a time.
2. Choose first density experiment: Texas wells count bins (simple and auditable) versus injection volume aggregation (requires period completeness checks).
3. Approve map hierarchy: neutral geology/parcel context, distinctive asset symbols, selection halo.
4. Decide default workspaces: Land research, Water assets, LONG-Haul, Ground movement; each starts with a small intentional layer set.
5. Validate before rollout with screenshots at Texas / basin / county / parcel zoom and bright/dark basemaps; keyboard navigation; simulated color deficiencies; selected and no-data states.
