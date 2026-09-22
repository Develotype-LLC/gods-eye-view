# LANDMAN’S Eye workflow usability review

Reviewed 2026-09-21, application commit `7d248a8`. Three dedicated agents reviewed information panels, LONG-Haul, and map/ownership workflows; the primary agent walked through A/B location investigation. This is a review and proposed work sequence, not an implementation or deployment. Reports distinguish live observations from source-code inference. Private project editing could not be exercised without membership; no access changes were made.

## Main recommendation

Make the right-hand inspector answer the question raised by the map selection. Today it combines layer settings, search, selected-record facts, source metadata and research forms in long scrolling panels. A user can successfully click a feature yet still need to hunt for the facts that explain it.

Proposed order for an information panel:

1. **Selection header:** readable name, record type, location; back to the originating map/route/point investigation.
2. **Key facts:** a small set specific to the selected layer, with units, observation period and missing-value labels. ET shows the selected month/measure; a parcel shows acreage, reported owner names and unresolved ownership; a well shows API, classification and relevant linked records.
3. **Actions:** zoom to item, open owner/parcel, investigate nearby, use as a route endpoint where supported.
4. **History and related records:** readable charts/tables, current selection emphasized, counts and coverage explicit.
5. **Sources and method:** source title/date, limitations and raw fields behind a disclosure. Critical uncertainty stays beside the affected fact.

Layer visibility, coloring, density resolution and filters belong in a distinct Layer settings area. Changing settings must not erase selection or unexpectedly move the map.

## Highest-priority findings

| Finding | Evidence | Recommended change |
|---|---|---|
| Selected owners can be ignored | Live: Pioneer selection under All owners retained 507,076 parcels; Specific owner produced 95 | Automatically enter owner mode when selecting a name; expose applied filters |
| Unknown owner can be treated as one selectable owner | Source-confirmed sentinel action; no live save attempted | Remove owner-group/portfolio action for missing-owner sentinel; retain parcel-specific research |
| ET map selection does not explain its color | Live: July actual ET 39.401 mm buried among 24 observations and raw metadata | Lead with 39.4 mm actual ET, July 2018, and a readable monthly history |
| Public owner drilldown stops at private access | Live in ownership and route workflows | Public owner/parcel summary first; private relationship section independently gated |
| Ranking appears available when no routes qualify | Live shipped example; source requires near-complete coverage and no unresolved parcels | Disable/explain unavailable ranking; clarify rank badges versus actual table ordering |
| Comparison candidates are below the first screen | Live laptop-sized viewport | Results first; concise coverage warning; method/source disclosures below |
| Point investigation cannot answer land ownership | Live A/B comparison with ownership layer shown | Add containing-parcel adapter and context-preserving handoff |

## Proposed implementation sequence

| Batch | Focus | Completion criteria |
|---|---|---|
| 1 | Fix broken or misleading interactions | Visible owner selections actually filter; missing-owner sentinel cannot form an owner group; ranking has an explicit unavailable state; point investigation includes land ownership; no generic layer-off banner contradicts a working tool; viewport failures do not masquerade as no data. |
| 2 | Selected-item inspector | ET, well and parcel panels lead with useful selected facts; public owner summaries work without private project access; readable labels/units/dates; meaningful next actions; raw source fields moved to disclosure; back navigation preserves context. |
| 3 | LONG-Haul decision screen | Alternatives and coverage visible before long methodology; candidate selection, ranking scope and unresolved parcels clear; route-to-owner return preserves context. |
| 4 | Workflow polish | Worklist access/empty states, responsive panel space, keyboard focus, explicit pending filters and useful loading/retry states. |

The existing distinctions remain essential: appraisal names are not verified legal identities; surface parcels are not mineral-title evidence; unknown parcels remain separate research items; density counts locations rather than production; preliminary routes are not construction-ready designs.

## Detailed reviews

- [Information panel](information-panel.md)
- [Map and ownership](map-ownership.md)
- [LONG-Haul](longhaul.md)
- [Location investigation](location-investigation.md)
