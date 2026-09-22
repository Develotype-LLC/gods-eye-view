# Usability batches implementation

2026-09-21. Implements the four batches in README.md.

- Correctness: selecting an owner enters Specific owner mode; pending/applied filters are explicit. Missing-owner sentinel is rejected by owner filter, portfolio and classification writes, and is not offered owner-group actions. Public owner summaries query appraisal data only, preserving private membership checks. Point investigation now includes containing parcels. Failed map parcel requests have scoped messaging and Retry. LONG-Haul disables priority when no complete eligible alternative can be recommended.
- Selected items: parcel, Texas well and reference-record details appear above a separate Layer settings disclosure. ET leads with the selected month/measure value (missing stays missing, zero stays zero), a monthly history and formatted acreage. Original fields remain available. Well APIs with multiple GIS matches have an explicit location chooser. Public owners offer parcel highlighting, source links and parcel facts. The inspector supports back navigation and retains underlying tool state.
- Route decision: Compare places the candidate table before sources/methodology, explains badge-only priority behavior, and labels electricity cost precisely. Land review leads with parcels/owners/unresolved coverage; hydraulics and crossings have their own disclosure. Pick instructions clear on stop/success; Escape cancels picking. Save/export labels state inputs-on-device versus candidate GeoJSON.
- Polish: public ownership remains usable without a private project; private creation/add/worklist actions are disabled or hidden when no membership exists. Empty owner searches have guidance. Focus map hides layer rail and legend on demand. Keyboard focus, sticky inspector heading, responsive sizing and return controls are improved. NASA observations have axis labels/zero baseline and visible source references. Texas injection history has a latest-report summary and expandable rows.

Validation: 56 focused reference tests, package/import boundaries and production build pass. Final full suite: 4,204 pass, one skipped, one failure in the icon-subset scanner (ordinary text is incorrectly detected as icon names). Read-only production database checks return 42 Chevron basin parcels and one containing parcel at the walkthrough point; public response contains no private profile/history fields.

Deployment: application commit `9cdde819e925633119e568e6e6e7f1656840c07a`, release `/srv/godseye/releases/20260922T023102Z`, at https://landman.develotype.com.

Live browser checks:
- Selecting Pioneer automatically enters Specific owner mode; Apply returns 95 parcels. The selected Martin County parcel leads with acreage and reported owner, with settings and raw fields collapsed.
- Public Pioneer owner summary opens without private project membership; private editing remains gated.
- Cotton field 21148302113 leads with 39.4 mm actual ET for July 2018; switching the selected month to August immediately shows 32.0 mm and retains the field/history.

- Focus map hides the layer sidebar and legend and offers Show layers to restore them.
- LONG-Haul Permian example completed with three alternatives. Compare leads with the table and coverage warning; priority is disabled with an explanation for incomplete infrastructure/land coverage. Land review leads with 26 parcels and 24 recorded names for Distance first. Chevron opens a public summary scoped to one intersecting parcel; Back to route or land retains Distance first and Land review. External infrastructure loading took several minutes and returned partial coverage, clearly labeled.
- Location comparison retains A/B coordinates, reports B 10.5 m lower, and identifies the containing 664.9-acre Diamondback appraisal parcel at B with a parcel-facts action. No contradictory layer-off notice appears when the terrain color layer is off.

Not exercised: private relationship writes (no membership changes), mobile device interaction, and every external NASA observation source.

Scope: no private membership grants, title verification, routing-engine redesign, multi-pipe sizing, named shared studies, or private record mutations. Those are separate capabilities, not part of these four usability batches.
