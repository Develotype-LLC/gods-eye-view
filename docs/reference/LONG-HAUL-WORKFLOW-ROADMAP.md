# LONG-Haul workflow and improvement roadmap

Discussion draft · 2026-09-21. Proposed behavior below is not yet implemented.

## Product purpose

Help Dia and the project team shortlist produced-water corridors, understand land
acquisition effort, and compare delivery-system configurations. A useful result is
a defensible shortlist with an ownership research queue and explicit engineering
gaps. A mathematical route alone is not a construction recommendation.

Working workflow assumption: generate alternatives, then edit and compare proposed
alignments. Brian's preference between generation and imported-route comparison is
pending. Keep this document as a discussion draft until that is resolved.

## Current behavior verified in the code

- One pipe per candidate; flow is not divided across parallel lines.
- Operating hours multiply annual electricity cost but do not adjust running flow
  to meet a calendar-year delivery target.
- Distance, pipeline proximity and mapped crossings guide route generation.
  Owners and pumping are evaluated afterward; the owner slider does not reroute.
- Parcel count includes any polygon intersecting the buffered screening corridor.
  This is not a count of centerline crossings or confirmed easement tracts.
- Known-owner count is distinct normalized appraisal names. Missing names are
  excluded from that count. A parcel is unresolved if it has no account or any
  account with the missing-owner placeholder, even if another account is named.
- Automatic ranking excludes candidates with unresolved owners, incomplete
  centerline parcel coverage, missing terrain or truncated parcel results.
- Distinct appraisal names are not verified legal parties, contracts or signatures.

Code: src/reference/pipelineModel.js, src/reference/pipelinePlanner.js,
server/providers/pipeline.js. Existing method: PRODUCED-WATER-PIPELINE-PLANNER.md.

## Ownership accounting: proposed rules

Keep these measures independent rather than combining them into an owner count:

| Measure | Meaning | Planning use |
| --- | --- | --- |
| Affected parcels | Unique source parcel IDs intersecting the selected footprint | Parcel-level review and documentation effort |
| Centerline-crossed parcels | Parcels with positive-length centerline intersection | Distinguish traversed land from corridor-edge contacts |
| Distinct recorded owner names | Normalized names in source appraisal records | Preliminary grouping; retain original names and sources |
| Verified ownership groups | Reviewed identity links with provenance | Count a resolved party once across its parcels |
| Unresolved parcels | Unique parcels with missing or partial owner information | Independent research obligations, never a single owner group |
| Unmapped route length | Length without imported parcel geometry | Coverage gap, not an ownerless tract |
| Rights status | Unknown, under review, or documented applicable rights | Separate title/name evidence from permission to build |

Rules:

1. Ten parcels with the same resolved owner produce ten parcel reviews and one
   distinct ownership group. Do not assume one agreement or one signatory.
2. Ten parcels with missing owners produce ten unresolved parcels, not one owner
   and not zero acquisition effort. Do not deduplicate them by the missing label.
3. An unresolved parcel is not necessarily one additional owner. It may share a
   known owner or have several parties. Report uncertainty rather than claiming
   known names + unresolved parcels is a factual owner count or upper bound.
4. A partially named parcel remains unresolved. Known-name counts and unresolved
   parcel counts can overlap; do not present them as mutually exclusive totals.
5. Parent companies and subsidiaries may share a negotiation contact while still
   being different title-holding entities. Store entity identity and optional
   commercial negotiation group separately. Never auto-merge on similar names.
6. Keep surface interests, mineral interests and rights/easements distinct. Link
   permissions to the relevant parcel, footprint, use and supporting evidence.
7. Count a parcel once per candidate even if revisited; separately report entry
   events, affected length/area and discontinuous crossings where useful.
8. Touching a polygon corner or corridor edge should be identified separately from
   positive-length/area overlap. Preserve small genuine crossings; any geometry
   tolerance must be explicit and tested, not silently discard inconvenient hits.
9. Multiple pipelines in one corridor do not multiply distinct owner counts.
   Their construction footprint may widen and affect additional parcels.

## How a user would work

1. **Define the project.** Source, delivery, required average daily volume, peak
   running flow or availability, time horizon and any existing rights.
2. **Choose system configurations.** Compare one larger line with several smaller
   parallel lines, pipe materials/sizes and operating presets. Separate planned
   throughput from demonstrated capacity.
3. **Generate or supply corridors.** Set waypoints and exclusions, infrastructure
   preferences, and crossing assumptions. Importing/editing supplied alignments
   is proposed; not yet available.
4. **Compare the shortlist.** Show distance, affected parcels, known owner groups,
   unresolved parcels, unmapped length, crossings, pumping and pressure flags.
   Keep coverage/feasibility warnings beside each alternative.
5. **Investigate land.** Click an owner to highlight all related parcels. Click an
   unresolved parcel to inspect source records, assign research, record evidence,
   and resolve identity. Rerun metrics after reviewed changes.
6. **Refine and hand off.** Adjust route or configuration, compare with a saved
   baseline, and export the alignment, parcel/owner worklist, assumptions,
   source dates and outstanding engineering questions.

Proposed comparison example (illustrative, not live results):

| Candidate | Affected parcels | Known groups | Unresolved parcels | Meaning |
| --- | ---: | ---: | ---: | --- |
| A | 20 | 3 | 0 | Few counterparties, more parcel work |
| B | 12 | 2 | 8 | Substantial unresolved acquisition effort |
| C | 14 | 5 | 0 | More counterparties, fewer parcels than A |

B must not receive a 'fewest owners' badge as though its final ownership burden
were known. A versus C remains a visible tradeoff, not an automatic universal win.

## Ranking and route-search improvements

First improve comparison transparency without relaxing the current recommendation
gates. Show every candidate, including incomplete candidates, but distinguish a
comparison from an automatic recommendation. Show alternatives that trade fewer
parcels for fewer known groups instead of hiding the tradeoff in one score.

Next introduce an explicitly assumed acquisition-effort model with independent
terms for unique verified ownership groups, unique affected parcels, unresolved
parcels, and footprint/coverage gaps. Start with effort points, not invented dollar
costs. Let users compare low/base/high research-effort assumptions. Unknowns must
not receive a free pass, but treating every unknown as a confirmed new party is
also incorrect. Missing geometry requires an incomplete status, not merely a
small penalty that the search can exploit.

Do not immediately put a per-edge 'owner cost' into ordinary A*: acquiring an owner
once across several segments is a non-additive, path-dependent cost. Start with a
bounded, diverse candidate set and rerank/refine against unique parcel/owner sets.
Later assess parcel-aware search or stateful/iterative optimization with documented
runtime limits. Claim only best among evaluated candidates, never global optimum.

## Hydraulic and system improvements

- Separate calendar-average required delivery, running flow, peak factor and
  availability. Running flow = average delivery / availability when storage and
  operating schedules make that assumption appropriate. Do not apply downtime
  twice when the entered flow is already a running-flow specification.
- Parallel identical lines in the same corridor initially share flow equally;
  compute friction/head per line and sum power. Unequal diameters, different
  paths or interconnected networks need a network hydraulic solver.
- Compare diameter, line count and material. Preserve true inside diameter and
  source/version of dimensional data; current presets are screening assumptions.
- Add source pressure, delivery pressure and a pressure profile along the route.
  Identify pressure limits and unresolved engineering inputs before marking a
  configuration feasible. Terrain samples alone cannot qualify it.
- Stage pumping-station planning after this: locations, allowable pressures,
  pump curves/efficiency, duty/standby arrangements and available power.
- Separate loss of one pump from loss of one entire line. Evaluate delivery under
  each selected contingency; N+1 pumps do not create a spare pipeline.
- Keep electricity, construction, parcel/easement acquisition, maintenance and
  research effort separate. Lifecycle comparisons need sourced or user-entered
  estimates and assumptions, not a fabricated combined cost.

## Suggested implementation order and acceptance checks

### 1. Land comparison and ownership research UI

Add prominent parcel and unresolved-parcel columns, coverage length, precise
labels, and parcel-level drill-down. Keep existing recommendation safeguards.
Tests: shared owner across many parcels; many unknown parcels; partial owner
records; repeated parcel crossings; no geometry; truncated inventory; corner-only
contacts. No automatic recommendation for unresolved ownership or data gaps.

### 2. Total-demand and parallel-line configurations

Add total delivery basis, operating availability and line count; calculate per-line
flow, power and combined energy. Show system assumptions in saved drafts/exports.
Tests: conservation of flow, equal-line symmetry, electricity aggregation, uptime
conversion, legacy single-line drafts, and shared-corridor parcel deduplication.

### 3. Pressure and pumping feasibility

Add pressure-profile screening and explicit unqualified/failed states, then station
and duty/standby scenarios. Validate against reference calculations and pump/pipe
specifications before using engineering feasibility language.

### 4. Acquisition-aware routing and project handoff

Add reviewed owner identity/rights records, saved candidate comparisons, supplied
alignment support and research worklists. Then use acquisition effort to refine
route generation. Preserve audit trails and source dates, and export the evidence
and unresolved items with each selected alternative.

Discussion decisions: first-user workflow; initial preferred system configurations;
relative parcel/negotiation/research effort; treatment of documented existing rights;
and which tasks Dia needs to assign or export from the shortlist.

## Owner profiles and relationship workspace

Brian's added requirement: make route owner rows useful and clickable, and maintain
owners we already know plus our assessment of willingness to transact. This moves
from displaying ownership into managing the land-acquisition work. Proposed only;
no relationship storage or clickable route-owner profile has been deployed yet.

### Click an owner from any route or parcel

Open a persistent owner profile in the inspector, with a return-to-route action
that retains the selected candidate and map position. Reuse the same profile from
land search, parcel inspection and LONG-Haul. Show:

- Recorded name, reviewed entity identity, aliases, review basis and source dates.
- Parcels intersecting this candidate, plus separately labeled other mapped parcels
  for this owner within our imported coverage. Highlight selected parcels on map.
- Parcel identifiers, county, recorded ownership details and authoritative source
  links when supplied. Missing links are explicit; do not fabricate deed records.
- Relationship summary: who on our team knows this owner, relationship status,
  contacts, last interaction and next follow-up.
- Project/opportunity assessment: proposed transaction, scoped parcels, willingness,
  confidence, assessment date and supporting note/evidence.
- Documented rights and agreements as a separate section with their scope/status.

Unknown-owner rows open an individual parcel research profile, not an 'unknown'
entity shared across unrelated parcels. Resolving identity attaches that parcel's
research to the reviewed entity without losing history.

### Keep relationship, willingness and agreement status separate

Relationship status examples: not assessed, no known relationship, introduction
available, existing relationship. A contact person can represent several entities;
that does not merge their ownership identities.

Transaction types: surface sale, permanent pipeline easement, temporary construction
access, lease, water-service/commercial agreement, or another specified proposal.
The same owner can decline a sale but be receptive to a pipeline easement.

Willingness: unknown, unlikely, possible, likely, or explicitly declined for this
proposal. Keep an actual accepted/executed agreement in the agreement workflow,
not a '100% likely' score. Optional negotiation stages: research, introduction,
contacted, discussing, terms proposed, on hold, declined, agreement documented.

Each assessment belongs to an owner + project/client + transaction type + relevant
parcels. Record assessor, assessment date, confidence (low/medium/high), basis and
review date. Separate staff judgment from an owner's reported statement. Unknown
is neither zero probability nor 50%. Start with qualitative choices; numeric
probability would be a subjective estimate until calibrated against outcomes.

### Proposed database extension

Use the existing container PostgreSQL database. Existing code already has
land_owner, land_account, land_client and land_client_owner, plus owner-class
review with actor/time. Those records support search and client portfolios; they
are not currently a relationship-management system.

Add stable entity IDs independent of mutable normalized appraisal names. Keep
source owner keys and reviewed entity matches with history so fresh county imports
cannot overwrite contacts, relationships or assessments. Allow manually entered
prospective owners before a parcel match exists; show them as unmatched.

Conceptual tables (names to finalize during implementation):

| Record | Purpose |
| --- | --- |
| owner_entity / owner_source_match | Stable identity and reviewed links to source owner records |
| owner_contact / entity_contact | People, contact methods, roles and represented entities |
| owner_relationship | Team/client relationship, internal sponsor and status |
| owner_interaction | Dated notes, actor, contact and source/document reference |
| owner_opportunity / opportunity_parcel | Project-specific transaction scope and negotiation stage |
| owner_assessment | Versioned willingness, confidence, rationale and review date |
| owner_agreement / agreement_parcel | Document references, status and explicit rights scope |
| owner_followup | Assigned task, due date and completion state |

Keep private commercial records separate from public appraisal evidence. Enforce
project/client access on the server, including searches, exports and map summaries;
a login alone must not imply access to every client's relationships. Attribute
edits, retain assessment history, handle concurrent edits and include database
backup/restore checks. Standard route GeoJSON exports omit contacts and private
notes; any relationship export is a separate explicit action with scoped access.
No automatic outreach, email or notifications in this first implementation.

### How relationships affect route comparison

Add route summaries for known relationships, introductions available, unassessed
parties and project-specific willingness. They supplement parcel counts, distinct
owner groups and unresolved parcels; they do not replace them.

Keep an owner-approved exclusion or hard constraint explicit and scoped to the
proposal. Do not silently block all that owner's land from a subjective 'unlikely'
assessment. A known relationship never proves access, creates capacity or removes
engineering constraints. Any relationship-aware ranking is opt-in, explains its
assumptions and shows missing/stale assessments. Do not multiply owner willingness
scores into a route-success probability; the assessments are uncalibrated and
negotiations may be dependent.

### First useful slice

1. Clickable owner profile, route-specific parcel list, map highlighting and source
   links; individual parcel research for unknown ownership.
2. Stable entity matching and a shared, access-scoped relationship record: internal
   sponsor, contact, relationship status, notes and next action.
3. Project/transaction-specific willingness with confidence, evidence and history.
4. Route relationship summaries and filters. Add ranking preferences only after
   the underlying assessments are useful and sufficiently populated.

Acceptance checks: identical names with different identities are not auto-merged;
known aliases share only a reviewed profile; unknown parcels stay separate;
source refresh preserves private records; willingness differs by transaction and
project; unauthorized users cannot read/write/export another client's records;
standard route exports contain no private notes; profile navigation preserves the
selected route; every displayed assessment shows who recorded it and when.

## Implementation checkpoint · 2026-09-21

Implemented in this change: clickable route owner names and parcel/search profile
links; separate unresolved-parcel research links; known-name/parcel/unresolved
columns; owner directory and manually entered owners; source-linked parcel lists
and highlights; project-scoped relationship forms; transaction-specific willingness,
confidence, rationale and dates; next-action worklist fields; revision history and
optimistic concurrency. New private projects belong only to their creator.

The initial Brian/Dia membership grant is a separate migration requiring the
pending explicit access approval. Application schema migration is additive; schema
backup is stored on CT110. Authorization is checked for every private endpoint,
using nginx's authenticated actor. SQL is parameterized and mutations transactional.
Standard route exports never query or embed private relationship records.

Current boundaries: source-name profiles are unverified appraisal groups, not a
completed legal-entity registry. Manually entered owners have no parcel association
until a later identity-linking workflow. Alias merging, document uploads, permission
management UI, automated follow-up notifications, research reassignment to verified
entities and relationship-aware route ranking remain future steps. One current
assessment per transaction per profile/project is retained, with prior scope changes
in history. Create a separate project for concurrent proposals of the same type.
Parcel lists/highlights are limited to the first 100 matching parcels and disclose
truncation. Directory lists the most recent 200 records. No numerical success
probabilities, automatic outreach, new pipeline engineering features or changes to
unknown-owner ranking gates are introduced in this release.

Validation: targeted model/API tests, browser workflow with explicitly local
synthetic fixtures, and real Postgres integration checks with all writes rolled back.
The integration checks cover access denial, independent transaction assessments,
conflicting edits, history, and real mapped parcel retrieval.
