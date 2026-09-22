# Information panel usability review

Reviewed 2026-09-21 against commit `7d248a8` and live `landman.develotype.com`. Read-only review; no data, permissions, classification, or relationship records changed. Dedicated Chrome review tab used. This report separates live observations from source-confirmed behavior and remaining verification.

## Assessment

The information exists, but much of the inspector behaves as a database viewer rather than an answer to the selected map question. The strongest example is ET: selecting a field does not immediately tell the user the value responsible for that field's current color. Controls, dataset inventory totals and provenance dominate the first screen, while the useful selected-object fact is buried in source records.

The existing missing-versus-zero distinctions, appraisal/title caveats, dated coverage descriptions and private-project boundary are valuable. Preserve them in a better hierarchy rather than remove them.

## Prioritized findings

### P1 — Selected ET field does not explain the selected map value

**Live verified:** Choose ET fields, retain July 2018 / Actual ET, click the Cotton polygon near the center-left of the view. The inspector shows field `21148302113`, `206.45556041704` acres, crop code `2`, county FIPS `48303`, an ingestion timestamp and 24 collapsed linked records beginning December 2018. There is no July ET headline. Expanding `2018-07 · ET` reveals `et mm: 39.401` among IDs, model, run UUID and ingestion metadata.

**Evidence:** `src/reference/recordsPanel.js:8-15,163-180` renders arbitrary properties and all observation summaries. `src/reference/records.js:278-286,309-317` refreshes the map when period/measurement changes but detail retrieval does not receive either selection.

**Consequence:** A user must hunt for the period and variable which colored the map and may read December ETo while looking at July actual ET.

**Proposed UX:** Selected-field summary first: **39.4 mm actual ET · July 2018**, Cotton, 206.5 acres, county name, OpenET ensemble / historical sample. Show ETo separately when selected, and a monthly chart with ET/ETo toggle. Retain all original precision and fields in Source records. Changing the map period must immediately update the summary; missing selected-period data must say No observation, never silently use the latest value.

**Acceptance:** Clicking a field answers current value + unit + month without scrolling or opening disclosure. Changing month/variable keeps the same field selected and updates that answer.

### P1 — Unknown owner can be added as though it were one owner

**Source confirmed, live sentinel parcel not exercised:** `land.js:386-410` correctly sends an unknown owner to parcel-specific research, then unconditionally renders **Add this owner to selection**, storing `OWNER NOT SUPPLIED` in `selectedOwners`. The server owner filter compares owner keys (`server/providers/land.js:59`) and client membership stores those keys.

**Consequence:** The card presents two conflicting mental models: this is an unresolved parcel, but also an owner that can be selected across parcels. This directly conflicts with the requirement that unrelated unknown parcels must not become one contracting party.

**Proposed UX:** Unknown-owner cards should show **Owner unresolved · parcel [county parcel ID]** and **Research this parcel**. Never offer owner-group selection or client owner membership for the sentinel. If unknown-parcel selection is desired, use explicit parcel IDs and label it a research queue, not an owner portfolio.

**Acceptance:** Two unknown parcels create two research subjects; neither can become a shared owner through the inspector or client-save flow. Needs a live read-only unknown parcel fixture plus unit coverage before release.

### P1 — Layer controls obscure object inspection

**Live verified for ET; source-confirmed for other panels:** At a 1510 × 855 viewport, selected ET detail starts roughly 570 pixels down the page, below dataset totals, a coverage paragraph, zoom, period, measurement and legend. Its actual observation requires further scrolling. The 350-pixel inspector has one outer scroll area; it docks whole pre-existing panels rather than distinguishing settings from selected facts.

**Evidence:** `src/ui/styles/landman-workspace.css:276-310`; ET panel declaration `recordsPanel.js:22-29`; Texas `texasPanel.js:13`; land `land.js:534-549` places its selected detail after theme/filter/client/coverage controls. `landmanWorkspace.js:143-159` sets a layer title, not a selected-object title.

**Proposed UX:** Two clear modes: **Layer settings** and **Selected feature**. A map click opens Selected feature at the top, with a sticky identity strip and Back to layer controls. Keep the current period visible in a compact strip, not the entire setup form. Put dataset coverage and import totals in a Source & coverage disclosure. Preserve a visible evidence badge beside key facts.

**Acceptance:** First screen after any map click contains object identity, three to six meaningful facts, timeframe, evidence state and one relevant next action. Back restores filter state and scroll position. Test desktop, narrow viewport and keyboard focus explicitly.

### P2 — Raw properties lack a consistent facts vocabulary

**Live verified ET, source-confirmed across collections and appraisal accounts:** `recordsPanel.js:8-15` merely replaces underscores with spaces and prints scalar values; `land.js:411-412` prints every nonempty account property with its original key. Arbitrary field order controls user hierarchy. Records have excessive decimal precision, administrative codes, and ingestion timestamps mixed with physical facts. Every linked observation is displayed identically regardless of record type.

**Proposed UX:** Dataset-specific presentation adapters with shared fact rows: label, formatted value, unit, observation date, evidence/source. Start with ET, ponds, injection and parcel ownership. For a pond: measured/detected area with units, detection date, location and attribution confidence; for an earthquake: magnitude, event date/time, depth with units and reviewed status. Never invent units or interpret undocumented codes—show Unknown until mapped from source metadata. Keep untouched source fields under Advanced source record.

**Acceptance:** Source IDs remain available for audit, but users need not understand crop codes, FIPS or run UUIDs to answer a domain question. Verify adapters against representative records and missing values.

### P2 — Well selection silently chooses the first location when an API has multiple matches

**Source confirmed:** `texasPanel.js:104-124` selects `matches[0]` and says the first is shown when multiple GIS locations match; it provides no location chooser. `texasPanel.js:107-144` leads with API/category/well number and raw UIC type/operator number, rather than a consolidated named/dated fact card.

**Consequence:** A user investigating a specific map location cannot reconcile another location for the same API from this panel. A first-record choice can be mistaken for the exact selected completion or permit context.

**Proposed UX:** A small location selector listing GIS ID, available well name/number, coordinates, classification and source; retain the clicked GIS ID. Show linked permits as named cards with human-readable permit types and reference identifiers. Unknown operator names should remain labeled rather than inferred from numbers.

**Acceptance:** A known multi-location API can be switched explicitly and selection remains synchronized with the map. Verify the provider supplies enough location context before designing the final card.

### P2 — Historical injection is a table without an interpretation summary

**Source confirmed:** `texasPanel.js:155-199` immediately emits all returned permit-month rows. `injectionPanel.js:31-41` puts history behind a disclosure but still only supplies a table. Units and missing-value distinctions are good, but there is no quick way to see reporting completeness, range or the movement of volume/pressure over time.

**Proposed UX:** Selected-month volume and pressure as separate facts, exact reporting month, and a compact volume history chart with gaps (not zeros). Show reporting coverage, latest source month, linked permit count, and an explicit permit selector when there are multiple permits. Keep the table available with period filtering and source/export actions. Do not turn injection into production or sum pressures.

**Acceptance:** A user can answer latest reported volume, period, reporting gaps and which permits are included without reading dozens of rows. Chart and table must reconcile to the same rows. Live disposal history request still needs representative checking.

### P2 — NASA point chart has no axis labels and its source is hover-only

**Source confirmed:** `motionHistoryPanel.js:63-99` draws circles in an auto-scaled SVG with no time or displacement ticks, zero baseline or visible gap treatment. `motionHistoryPanel.js:107-117` promises Observation values and source records, but stores `p.source` only in a table-row title. It is not a visible or clickable citation and is unavailable to ordinary touch interaction.

**Proposed UX:** Label time and relative displacement axes, draw zero/reference baseline, show requested and actual date endpoints, display any largest-gap warning near the value, and expose explicit source links/identifiers in the expanded observation table. Keep LOS direction and not-vertical-subsidence qualification next to the headline. Provide retry near timed-out history requests.

**Acceptance:** The chart can be understood without hover. Mobile and keyboard users can open the same source evidence. Live point-history latency/empty/error cases remain to be checked.

## Recommended common inspector layout

1. **Selection identity:** feature name/type, county or coordinates, stable parcel/API/source ID, clear selected marker; Back to layer controls.
2. **Answer:** three to six domain facts, with units and observation dates. For ET this is selected-month ET; for a parcel it is reported owner, geometric acreage and interest-evidence state.
3. **Useful next actions:** open owner/research parcel, view well history, compare this location, use as route endpoint where supported. Never advertise an action that cannot complete with current permissions or data.
4. **History / related records:** readable chart or grouped cards; counts, filtering and paging for long collections.
5. **Source & confidence:** exact source/as-of date, coverage and uncertainty; original fields under a further disclosure.

Layer settings remain reachable but are a separate presentation state. Public appraisal identity and private relationship records remain separate; do not solve the access issue by exposing private fields in public detail endpoints.

## Suggested first implementation slice

Build the shared selected-feature shell and ET adapter first because the live problem and expected answer are unambiguous. In the same correctness batch, remove sentinel owner-group actions. Then adapt parcel and well cards, followed by readable injection/NASA history. The A/B unsupported-land and off-layer-banner issues are being reviewed separately by the root reviewer and should be folded into the shared inspector state design.

## Verification limits

Live review covered ET selection, selected-period record expansion and the desktop inspector hierarchy. Other findings above are explicitly grounded in current source; no private project record, permission change, unknown-owner portfolio save, NASA fetch, or disposal history write was performed. No claim of mobile or screen-reader conformance is made. The live ET discrepancy is repeatable independently of those remaining checks.
