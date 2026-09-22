# Map and ownership workflow usability review

Reviewed 2026-09-21, live landman.develotype.com and code at 7d248a8. Read-only browser session; no records, projects, membership or classifications created/changed. Findings below separate live observations from code inference. Detailed record-panel and LONG-Haul reviews are separate.

## 1. P1 — Selected owner can be silently ignored

**Live reproduced and code confirmed.** Land & owners defaults to Select by: All owners, but displays the owner search and “Select multiple owners, then Apply filters.” Searching Pioneer, selecting PIONEER NATURAL RESOURCES USA INC and clicking Apply retained 507,076 matching parcels. A Remove chip suggested a real selection. Only explicitly changing Select by to Specific owner and applying reduced results to 95 parcels / 28,896 geometric acres.

Cause: `src/reference/land.js:308–310` adds the chip without switching mode; `557–562` leaves owner tools visible in All owners; `578–584` sends an empty owner list in that mode.

**Fix:** selecting a search result should enter Specific owner mode automatically, or hide selection tools in All owners. Show a persistent applied-filter summary and distinguish unapplied changes. Acceptance: selecting one owner and applying cannot silently execute All owners.

## 2. P1 — “Open profile” is a dead end for public ownership exploration

**Live reproduced and code confirmed.** Open profile from the Pioneer search replaced useful public results with an empty Relationship project selector and “No private relationship project is assigned…” Search owners / Add owner remain exposed. Back to route or land successfully restores prior results.

Cause: `src/reference/land.js:312–317` sends all profile actions to the private workspace. `src/reference/ownerWorkspace.js:159–169,315–329` requires a project before loading an owner profile.

**Fix:** provide a public owner summary (recorded names, parcels, county coverage, acreage, source evidence) without a private project, then a clearly separate Relationship notes section with access status. Do not solve this by widening permissions. If retaining current architecture, rename action “Private relationship record” and explain access before navigation; offer a public “Show this owner’s parcels” action.

## 3. P2 — Transient viewport failure is presented as entire database failure

**Live observed once; not a permanent outage.** Initial Land & owners regional viewport showed “Land database unavailable; retry shortly” and Results unavailable while owner-name search returned results successfully. Applying filters again eventually loaded the 507,076-parcel overview. Thus the observed failure affected a viewport request, not all database functions. No root-cause conclusion is asserted.

`src/reference/land.js:232–242` clears map/results and displays the service message, with no dedicated retry. Map legend also showed that warning.

**Fix:** scoped “Could not load parcels for this area” with Retry and last-success/coverage context. Preserve last successful map as visibly stale if appropriate. Separate loading, no matches, outside coverage and failed request states. Investigate timeout/server performance independently.

## 4. P2 — Owner search results crowd out filters and the actual parcel results

**Live observed.** Pioneer returned 17 name variants; each consumes two consecutive buttons, followed by selection chips, disclaimers, Apply/Fit, totals, coverage and 50 parcel buttons. Selected owner results therefore sit well below an expansive search list. Repeated company names/acreages do not provide quick geographic differentiation.

`src/reference/land.js:303–320,206–223,534–549` builds all sections in one continuous panel.

**Fix:** compact selectable search rows with one secondary profile action; collapse search results after selection; place selected names and applied totals above a dedicated Results section. Add county grouping and parcel IDs, sorting and list/map correspondence. Preserve explicit legal-identity caveats; do not auto-merge similar company names.

## 5. P2 — Regional ownership themes have no immediate visual payoff

**Live initial regional state observed; theme behavior code inferred.** Land & owners flies to both basins and shows parcel-count clusters. The first control is Map coloring, but regional circles remain gray regardless of owner theme. Text correctly says “Zoom in for parcel colors,” yet a user choosing Owner class has no direct route to a useful thematic view except manual zoom/filtering.

`src/reference/landmanWorkspace.js:288–308`; `src/reference/land.js:123–135,505–525`; `src/reference/mapLegend.js:104–129`.

**Fix:** explicitly label themes “Parcel colors — available when zoomed in”; provide “Zoom to parcel view” or a clear filtered-area shortcut. If regional class summaries are added, use breakdown counts with mixed/unknown explicitly represented, never color a multi-owner cluster as one owner/class.

## 6. P2 — Uncertainty styling conflates missing identities and candidate classification

**Code inferred, not visually validated across all live parcel classes.** Both missing owner names and unverified name-match classes share dashed boundaries. Owner-class fill can imply confidence while only a small line pattern distinguishes research matches. The research theme is more explicit, but users need to switch themes to understand why a parcel is dashed.

`src/reference/landThemes.js:21–51`; `src/reference/mapLegend.js:117–126`.

**Fix:** retain class color but add distinct uncertainty symbols/patterns, and always show a plain-language status on selection. Missing owner and candidate class should be separately identifiable. Review land classes on satellite imagery and with color-vision simulations; do not claim current palettes meet accessibility standards without testing.

## 7. P2 — Density guidance promises points that fixed-density mode will never show

**Code inferred.** Selected cell says “Zoom in for individual locations” and offers Zoom to selected cell even when Map display is explicitly Fixed-cell density. That mode remains density as the user zooms; cell zoom alone cannot deliver the promised points.

`src/reference/texasPanel.js:65–89`; display choices at `13` and density mode routing in `server/providers/texas.js`.

**Fix:** in fixed-density mode offer “Show locations in this cell” that switches to locations/auto and zooms, or change copy to explain the required display switch. Keep locations/km², fixed cell size, edge-cell counts and inventory-not-production labels; these are useful existing safeguards.

## What worked

Land & owners is discoverable as a task preset; Details and Zoom are separate controls; explicit Specific owner filtering produced the expected 95 parcels; private project access was not bypassed; Back to route or land preserved context. Source/date labels, appraisal versus mineral-rights caveats and separate unknown-parcel research semantics should remain.

## Suggested order

First fix ignored owner selection and provide a useful public profile destination. Then improve error/retry states and split search/filter/results presentation. Finally refine thematic zoom guidance, uncertainty symbols and density drill-down. No implementation or live data changes were made by this review.
