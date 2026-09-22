# LONG-Haul workflow usability review — 2026-09-21

Reviewed current source at commit `7d248a8` and the live Landman application in a separate authenticated Chrome tab at a 1510 × 911 viewport. No private records, memberships, browser drafts, or application code changed. Ran the supplied public Permian example, selected an alternative, visited Land review, opened a recorded owner, returned to the route, changed the ranking slider, inspected a crossing, and replaced a map endpoint. Save/export were inspected in source only; no file was exported and no existing browser draft overwritten.

## What worked

- Example calculation completed with three distinct candidates. Setup → Compare → Land review works, and returning from Owners preserves the selected Infrastructure balance candidate.
- The example separates known names, total parcels, unresolved parcels and centerline coverage. Infrastructure balance had 7 names, 12 parcels, 1 unresolved parcel and 98.2% mapped centerline. Unknown parcels do not collapse into one owner.
- Map replacement populated source A and invalidated stale results. Crossing action selected South Happy Lane and zoomed to it, with a warning that it was not surveyed.
- Operating presets and collapsed numeric overrides reduce entry work. Source inventories and limitations are explicit.

## Prioritized findings

### P1 — Public owner research ends at private-project access

**Observed:** Clicking ROCKHOUND LANDCO LLC from Land review replaced the entire route panel with Owners & relationships and “No private relationship project is assigned to your login.” The clicked name, its three intersecting parcels and public evidence were no longer displayed. Back to route or land works, but there is no useful owner drilldown for this login.

**Cause:** `src/reference/ownerWorkspace.js:158–169` requires a project; `:316–329` calls initialize before setting subject context and retrieving the profile. Route owner buttons dispatch directly to that gated workspace (`pipelinePlanner.js:875–886`).

**Fix:** Open a public owner summary first: selected recorded name, county/source date, route-intersecting parcels, parcel highlighting, and source links. Add the private relationship assessment as a separately gated section. Preserve subject identity in the no-access state and offer a precise access-request explanation. This does not require granting anyone access.

**Acceptance:** A user with no private project can inspect every public parcel behind a route owner and return to the selected route; private assessments remain inaccessible.

### P1 — Ranking control promises an effect that the shipped example cannot produce

**Observed:** Moving Recorded owner-name priority from 50% to 100% changed the percentage but no candidate order, selected route, badge or outcome. All example routes had less than 100% mapped coverage. A generic paragraph says no automatic recommendation, but the prominent slider remains enabled and says “Reranks these generated alternatives.”

**Cause:** `pipelineModel.js:185–194` excludes every route lacking ≥99.999% coverage or having any unknown parcel. `pipelinePlanner.js:629–745` always renders rows in original route order; the slider rerenders at `:1012–1016` but does not sort them. Even eligible cases change badges, rather than table order.

**Fix:** State “Ranking unavailable — parcel coverage incomplete” beside a disabled control when there are no eligible routes, with per-route missing facts. For eligible candidates, either actually sort with rank positions or rename the control to explain badge-only behavior. Keep uncertainty gating; do not quietly treat unknown land as an easy route.

**Acceptance:** The default example explains immediately why priority changes cannot recommend a winner. Eligible fixtures visibly show what changes and retain explicit manual selection.

### P1 — Comparison results are below a screenful of explanatory text

**Observed visually:** At 1510 × 911, the initial Compare view displayed duplicate LONG-Haul headings, step navigation, endpoint summary, slider and several source/method paragraphs. No candidate row or Land review CTA was visible without scrolling. The left layer rail and expanded legend also consumed substantial map area while planning.

**Cause:** `pipelinePlanner.js:630–672` appends method/source/limitation paragraphs before the table. Header/intro and step navigation consume additional height. `src/ui/styles/landman-workspace.css:751` controls routing-panel width; widening alone does not resolve vertical order.

**Fix:** Lead Compare with three concise route cards or a compact visible table: distance, electricity/year, names, parcels, unresolved and coverage. Follow with the priority control and fixed selected-route action. Collapse method details under “Sources and calculation details”; retain a short prominent uncertainty banner. Offer a temporary planning focus mode that collapses the general layer rail and legend without losing their state.

**Acceptance:** At a normal laptop viewport, users can compare all three alternatives and see the next action without an initial scroll.

### P2 — “Land review” puts hydraulics ahead of the land task

**Observed:** Land review starts with corridor following, crossing counts/list, fit button, pump power/head/velocity/pressure and elevation profile before ownership. The owner list is useful once reached, but this step's title does not predict the information order.

**Evidence:** `pipelinePlanner.js:758–849` precedes parcel summary and owner list at `:851–917`.

**Fix:** Land review should lead with parcels, recorded names, unresolved parcels and unmapped gaps, then owner rows and public parcel actions. Keep “Hydraulics” and “Crossings” as explicit adjacent sections or name the step “Route review” with clear subsection navigation. Show land gaps spatially, not only as a percentage.

### P2 — The current share workflow is a technical file, not a review handoff

**Source-confirmed, not exercised:** One localStorage key stores inputs only (`pipelinePlanner.js:31`, `:1043–1060`). There is no study name, multiple saved studies, saved computed candidate snapshot or reopenable shared study. Loading requires recalculation (`:1066–1096`). Export is one selected route GeoJSON (`:1113–1159`). Clear text correctly says drafts stay in this browser.

**Fix:** Near-term add a readable study summary/export with date, endpoints, assumptions, all comparison candidates, selected candidate and unresolved land tasks. Distinguish “Save inputs on this device” from “Export candidate GeoJSON.” Later add named, permission-scoped studies; do not imply current exports are shared saved studies.

### P2 — Picking confirmation leaves an obsolete instruction

**Observed:** Replacing source A updated coordinates and the result status, but “Click the map for source A” remained in the setup drawing hint. Compare and Land review correctly became disabled. The canvas offered limited unobstructed space between two rails and the legend.

**Cause:** arm writes `[data-drawing]` (`pipelinePlanner.js:171–184`); successful endpoint pick calls stop and updates `[data-points]` / status but does not clear that hint (`:1202–1213`).

**Fix:** Clear the pick instruction on successful pick and on Stop; show a persistent A/B chip with Change and Zoom. Collapse contextual panels during picking and support Escape to cancel. Editing a waypoint should eventually use a reorderable list rather than coordinate lines.

### P2 — Trust messages need request-specific scope

**Observed transiently:** During/after route calculation, the general map legend said “Land database unavailable; retry shortly” while routing results displayed parcel counts and 95–99% coverage. The warning cleared after subsequent map navigation. This does not prove route results were invalid; the requests are separate.

**Fix:** Say “Map parcel display failed; route parcel analysis succeeded at [time]” when appropriate. Keep last successful timestamp and retry action scoped to the failed display. Avoid making one failed request appear to invalidate every land result.

## Lower-priority polish

- Crossing labels expose `majorRoad` and generic `track`; use Highway / Other road and show source identity in details. Duplicate divided-highway events should visually group with the existing explanation. Evidence `pipelinePlanner.js:782–786`; observed two South US Highway 385 events.
- “Pumping / yr” should say “Pumping electricity / year” so the comparison does not imply station/maintenance costs. Method prose already explains the limit (`pipelinePlanner.js:54`, table `:677`).
- High-flow customization permits up to 2 million bbl/day but remains a single-pipe screening model (`pipelinePlanner.js:37–46`, `:54`). Surface that limitation directly beside flow/diameter; multiple-pipe sizing is a separate capability, not a color/UI change.

## Recommended implementation order

1. Public owner read-only summary independent of private relationship membership; explicit unavailable ranking state.
2. Results-first Compare and land-first Land review, with clear source/coverage banners.
3. Pick-mode cleanup and better crossing/parcel map focus.
4. Readable named study handoff, followed by shared saved studies if selected for product scope.
