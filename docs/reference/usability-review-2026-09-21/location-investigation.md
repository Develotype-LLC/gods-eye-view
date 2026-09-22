# Location investigation walkthrough

Reviewed 2026-09-21 against local/live 7d248a8. Read-only browser interaction, no product changes.

## Scenarios observed

Opened Compare locations, entered A 31.6783,-102.3688 and B 31.7000,-102.3200. The completed result correctly showed A 875.6 m, B 865.1 m, B 10.5 m lower, distance 5.22 km, Permian Basin and nine well records within 500 m (five shown). Opened the first nearby well (API-8 13543736) through Open source record; the Texas well inspector loaded.

## Findings

1. **P1 — Land ownership is missing from point investigation.** With Land ownership visibly enabled, the panel says it has no location-inspection adapter and directs the user to Full console. This breaks the question “who owns the parcel at B?” despite parcel functionality elsewhere. `src/reference/locationInvestigation.js:402–418` explicitly treats land-parcels as unsupported. Add containing parcel(s), recorded names, acreage, source date, unresolved-name status and Open parcel / Open owner actions. Clearly separate containing parcels from merely nearby parcels.
2. **P2 — The layer-off notice contradicts working investigation controls.** The panel says “Show it to load its controls and records” while the controls work and return elevation and source facts. `landmanWorkspace.js:168–175` applies the generic notice using the terrain layer ID. Distinguish optional terrain coloring from an enabled investigation tool; use “Terrain coloring is off” only next to that toggle.
3. **P2 — Source-record handoff loses the visible investigation path.** Opening a well replaces the comparison panel with statewide counts, display controls, classification and search before the selected well. No Back to point B action is visible. `locationInvestigation.js:357–363`; shared inspector replacement `landmanWorkspace.js:142–159`. Preserve a breadcrumb and selection context; return to the same B, radius, fact list and scroll position without rearming picking.
4. **P2 — Relevant facts are below setup, controls and repeated methodology.** A/B answers and nearby records require reading a long mixed setup/result panel. Use a sticky point header, a compact A/B result, and tabs or sections for At this point / Nearby / Sources; collapse setup after points are selected. Do not hide source dates or missing-data status.
5. **P2 — Source facts are arbitrary rather than selected for the decision.** `locationInvestigation.js:181–197` renders the first eight primitive properties and replaces underscores; TexNet source is a raw service URL. Use per-layer fact schemas, human labels, units, date and clickable source title, with raw properties behind an advanced disclosure.

## Acceptance checks for a future batch

- A point with ownership coverage yields containing parcels and their names without leaving Landman.
- No-data, failed request and no records found are visibly different states.
- Opening a record and returning preserves B, radius and result position.
- Terrain coloring being off never implies that point investigation is disabled.
- A/B difference and selected item identity are readable above the fold on a typical laptop.
