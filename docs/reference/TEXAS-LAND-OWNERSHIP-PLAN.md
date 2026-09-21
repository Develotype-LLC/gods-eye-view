# Texas land ownership and mineral rights

Scope agreed September 21, 2026: Texas portions of the Permian and Palo Duro basins. The first appraisal-parcel implementation is described in [Texas land intake](TEXAS-LAND-INTAKE.md). The remaining roadmap below includes legal-entity identity review, recorded rights and competing-use evidence; those are not implied by appraisal ownership.

## Menu and map behavior

Add a **Land & rights** workspace with these controls:

| Control | Choices and behavior |
| --- | --- |
| Basin | Permian, Palo Duro, or both. Use the geological basin geometry; show county coverage independently. |
| Select by | Client portfolio, specific owner, or owner class. No fixed client is required. |
| Client portfolio | Saved, named collections of legal entities. Include subsidiaries only through reviewed relationships. A client can have multiple entities and aliases. |
| Specific owner | Searchable legal names and aliases; show the original appraisal name alongside the matched entity. Allow multiple selections. |
| Owner class | Upstream, midstream, holding company, minerals/royalties, data centers, power/utilities, agriculture, public land, other, or unclassified. Multiple classes may apply. |
| Interest | Appraisal-reported surface owner, documented surface interest, mineral interest, leasehold, easement, or option. Keep unknown interests explicit. |
| Evidence | Appraisal reported, document linked, reviewed, or candidate match; source date and county coverage always available. |
| Nearby activity | Data centers, power projects, agricultural use and other infrastructure, with distance and project status. |

Selections filter both parcel polygons and a results list. Clicking a parcel shows parcel/account identifiers, raw owner name, matched entity and company family, the basis for that match, acreage, source date, and separately sourced rights and nearby activity. Clear filters and fit-to-results must be available.

Client is a portfolio relationship, not an owner class. Holding company and upstream/midstream roles can overlap. Do not classify every LLC as a holding company or count the same parcel twice when multiple classes match. Provide legal-owner versus company-family grouping.

## Sources and what they establish

| Question | Starting source | Interpretation |
| --- | --- | --- |
| Who is listed as owning the surface parcel? | [TxGIO county parcel downloads](https://geographic.texas.gov/stratmap/land-parcels), supplemented by county appraisal districts | Appraisal-reported ownership; county vintages and coverage vary. Not a title opinion. |
| Is this owner part of a client or company family? | Client-maintained entity portfolios, SEC subsidiary exhibits and company filings; [Texas Comptroller entity status](https://comptroller.texas.gov/taxes/franchise/account-status/) for identity support | Entity identity and sourced relationships; corporate affiliation alone does not transfer or establish parcel title. |
| Who owns minerals or other rights? | County clerk recorded deeds, reservations, assignments and leases; authorized title records; [GLO](https://www.glo.texas.gov/energy) for state interests | Document-specific interests. Surface and mineral estates can be severed; appraisal and RRC operator records cannot fill unknown mineral ownership. |
| Where are power projects? | [EIA-860M](https://www.eia.gov/electricity/data/eia860m/index.php), [ERCOT resource information](https://www.ercot.com/gridinfo/resource), local permits | Existing/proposed project context, not proof the developer owns or wants a particular parcel. |
| Where are data centers and other potential competing uses? | Existing app locations, public planning/permit documents, company site announcements and parcel-specific purchase/option evidence | Retain operating, announced, permitted, construction and withdrawn statuses. A nearby project is a demand signal, not a confirmed buyer. |
| Where is agricultural use? | [USDA Cropland Data Layer](https://www.nass.usda.gov/Research_and_Science/Cropland/Release/index.php), existing OpenET coverage | Observed/classified land use and dated water context, not agricultural ownership or acquisition intent. |

For mineral interpretation, the [GLO minerals FAQ](https://www.glo.texas.gov/sites/default/files/2025-01/Minerals%20FAQ_updated%202023.pdf) explains severed estates and the need to examine recorded instruments.

## Local material available to reuse

The Long Haul research directory at `/Users/brian/uplabs/IC2/LONG_HAUL/data/research-lanes-2026-09-19/` contains a 127-entity, 27-source registry and a bounded parcel-access audit. Reuse the evidence structure and reviewed names, but do not inherit its project-specific client designation or treat the registry as parcel ownership evidence.

Its Armstrong 2026 tax roll has 3,850 rows; it includes non-real-property accounts and needs a verified geometry join. Its GIS samples contain only ten Armstrong and ten Randall polygons. The Randall service was dated 2022; Armstrong GIS reuse terms require resolution before publishing that geometry. These are importer research inputs, not regional coverage.

The Exxon offline land-footprint sections represent well-containing sections, not verified land, mineral or leasehold ownership.

## Storage and matching

Use the existing container PostgreSQL/PostGIS database with separate tables for:

- Source snapshots: county, source URL, retrieval date, source vintage, terms, file hash and ingestion status.
- Parcel geometry: source-scoped stable ID, version, polygon, acreage and basin intersections.
- Appraisal accounts: account/sequence keys, raw owner fields, property type and links to parcel geometry. Multiple accounts or interests may share one polygon.
- Entities and aliases: stable identifiers, legal names, jurisdiction and dated role classifications.
- Entity relationships: parent/affiliate relationship type, dates, source and review status; do not infer a direct parent from reporting-group membership.
- Client portfolios: named collections and explicit entity membership, independent of owner class.
- Rights/interests: estate and instrument type, parties, legal tract, dates, fraction and depth scope when known. Mineral tracts may not match surface parcel boundaries.
- Projects and evidence: source, status, location precision and any explicitly documented parcel relationship.

Normalize names for candidate search, then preserve review status. Never automatically confirm a match from a prefix, mailing address or registered agent. Preserve unmatched owners as searchable records. Aggregate surface acreage once per geometry; show net mineral acreage only when the relevant fraction and scope are established.

## Build sequence and acceptance

1. Intersect the two basin boundaries with Texas counties and produce a county/source/vintage/availability manifest. Acquire permitted official parcel files and import complete snapshots with repeatable upserts. Distinguish missing coverage from no matching owners.
2. Add entity review and client-portfolio storage, then connect the three selection modes to spatial queries and the map/results inspector. Show real owners from imported data, not example ownership polygons.
3. Add mineral and other documented interests incrementally; retain unknown mineral ownership where no evidence is available.
4. Add competing-use overlays and parcel-specific interest evidence. Separate exact parcel links from site points or county-only locations.

Acceptance checks: a named owner returns the same parcels through its reviewed aliases; client selections include only assigned entities; overlapping owner classes do not duplicate acreage; out-of-coverage counties are labeled; mineral unknowns stay unknown; every displayed ownership or demand assertion links to dated evidence. Basin clipping must not silently replace whole-parcel acreage with in-basin area—label both if provided.

## First implementation scope — September 21, 2026

The initial layer imports 46 complete county snapshots, then filters parcels by actual intersection with the Texas Permian and Palo Duro basin polygons. It provides owner-name search, explicit saved client-name portfolios, candidate/reviewed owner-class filters, regional counts, detailed boundaries and source-linked parcel inspection. See [source manifest](TEXAS-LAND-SOURCES.json) and [intake and limitations](TEXAS-LAND-INTAKE.md).

Portfolios currently store selected normalized appraisal names, not verified canonical entities. Alias expansion, parent/subsidiary and company-family grouping remain pending; each relevant appraisal name must be selected explicitly. Role review is supported, but it is not legal-identity verification. Recorded-rights filters are present and return no records until instruments are imported. Nearby competing-use relationships and a dedicated evidence-status filter remain future work.
