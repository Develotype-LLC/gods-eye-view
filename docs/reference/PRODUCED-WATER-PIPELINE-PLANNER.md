# LONG-Haul: produced-water routing

Open the Landman workspace and choose **LONG-Haul · pipeline routing**. Load the Permian example or pick source and delivery points. Add up to eight required waypoints by clicking the map or editing the ordered coordinate lines. Draw an exclusion with three or more vertices and finish it; remove an area to revise it. Exclusions are hard constraints, including for endpoints and waypoints.

## Preferences and alternatives

Prefer, remain neutral to, or discourage routes parallel to mapped pipelines. An optional operator-name substring narrows that preference. Default corridor discount is 30%; this is an editable search assumption, not a verified saving. Parallel proximity means within 100 m with alignment cosine at least 0.85. The map shows pipeline context in purple, roads in gold, rail in orange, waterways in blue, exclusions in red and the finite study boundary in white.

Crossing penalties are **equivalent additional kilometres**, not construction quotations: defaults highway 5 km, other road 0.5 km, rail 8 km, waterway 3 km. Actual segment intersections produce penalties; parallel travel does not count as a crossing. Reported intersections within 10 m of one another and of the same class are grouped. Divided roads can yield more than one event. These are mapped geometric crossing events, not engineered bore counts.

An eight-neighbor A* grid search generates distance-first, infrastructure-balanced, and stronger crossing-avoidance alternatives. Every alternative honors exclusions and ordered waypoints. The grid is adaptive, with minimum 75 m spacing; its resolution is shown. A finite study envelope extends beyond the input chain by 0.015–0.12 degrees. Routes are approximate grid paths, not global optima or buildable centerlines. Alternatives may coincide. Collinear vertices are compacted without smoothing through obstacles.

Routes are then evaluated for pumping electricity and appraisal owners. **Terrain and owner acquisition costs do not yet participate in the path search itself.** The owner/energy slider compares eligible candidates after routing. It does not alter the search. Owner groups, secured ROW, wetland constraints and client-specific rights remain future work.

## Infrastructure sources

- Texas RRC public GIS **Pipelines layer 13**: operator-submitted mapped linework with operator, commodity, status and T-4 permit. Layer 14 is transmission-only and is not used. The query paginates with a 6,000-record limit and does not use truncated results. [RRC mapping context](https://www.rrc.texas.gov/pipeline-safety/permitting-and-mapping/mapping/).
- OpenStreetMap via public Overpass endpoints: highways, railways and river/stream/canal/drain ways. Bounded queries, timeouts and a 10,000-way cap; incomplete or refused responses remain unavailable, never authoritative empty inventories. [OSM attribution](https://www.openstreetmap.org/copyright).
- Successful inventories are cached for one hour, capped at eight study areas and two concurrent retrievals. Combined geometry cap 150,000 vertices. Context rendering is capped at 2,000 features, but routing uses the complete returned inventory. Retrieval times, availability and source URLs accompany exports.

Mapped pipelines do not establish available capacity, access, active operation or permission to build alongside them. Operator preference is not proof of client ownership. OSM data is not a complete crossing inventory. Draw exclusions for known restrictions not represented in the sources.

## Terrain, land and pumping

The interactive chain supports 50 m–250 km; exceptionally dense or large inventories can require a smaller study. Generated routes are limited to 1,500 vertices and 400 km in the parcel API. Parcel queries are capped at 3,000 intersections per candidate, explicitly reported as truncated. No silent sampling of owners.

Terrain sampling preserves every route vertex and samples intervening segments with target spacing of at least 250 m, increased for long routes. Heights are fetched in 64-point batches with visible progress and cancellation. Actual maximum sample spacing is shown. Missing samples prevent a pumping estimate. Re:Earth heights are modelled ellipsoidal heights, not a survey.

Darcy–Weisbach friction uses Colebrook for turbulent flow and 64/Re for laminar flow. Source pressure is assumed zero gauge. Required head accounts for accumulated friction, sampled crests and outlet pressure, with no energy recovery. Electrical power is rho*g*Q*head / combined pump/motor efficiency. Annual cost multiplies power by operating hours and tariff. [DOE Fluid Flow handbook](https://www.energy.gov/ehss/articles/doe-hdbk-10123-92).

TxGIO appraisal snapshots provide corridor-intersecting parcels and normalized names; aliases can remain separate. Names are not verified parties or contract counts. Coverage measures centerline coverage by parcel geometry, not legal ROW availability or coverage of the whole corridor width. Automatic comparison badges require available infrastructure sources, complete terrain, at least 99.999% centerline parcel coverage, no unknown owners and an untruncated query.

Construction, ROW and maintenance dollars, burial depth, fittings, solids/gas, surge, pump curves, station spacing, pressure rating, wetlands, permits and engineering clearances are not modeled. Sparse samples can miss crests. Defaults are assumptions, not measured produced-water properties.

## Persistence and checks

Drafts remain in the current browser and include endpoints, waypoints, exclusions, routing preferences and operating assumptions. Previous pipeline drafts remain loadable. GeoJSON exports retain selected route geometry, crossing details, assumptions, source availability, search bounds/resolution and limitations.

Automated tests cover path changes caused by crossing penalties and corridor preferences, operator filtering, required waypoint preservation, polygon avoidance, endpoint rejection, cancellation, input limits and unavailable-source handling, alongside the original hydraulic and ranking checks.

### Selectable operating scenarios

LONG-Haul now starts with a selectable scenario rather than an expanded numeric form:
small gathering (20,000 bbl/day, 8-inch nominal), gathering (50,000, 12-inch),
trunk line (100,000, 16-inch; fresh-screen default), and regional transfer (250,000,
24-inch). These are analyst-selected screening combinations, not observed industry
averages, rated capacities, or recommendations for construction.

Pipe dimensions use HDPE IPS DR11 average inside diameters of 6.963, 10.293,
12.915, and 19.374 inches from [Chevron Phillips PP501 Table 2](https://www.cpchem.com/sites/default/files/2022-03/PP%20501%20Driscoplex%204000%204100%20Water%20Pipe%20Brochure.pdf).
This dimensional reference does not establish suitability for a particular
produced-water chemistry, temperature, pressure or surge condition. Flow targets
are assumptions; station spacing and pressure qualification remain outside the model.
Shared planning assumptions retain density 1,100 kg/m³, viscosity 1.2 cP,
roughness 0.0015 mm, combined efficiency 70%, electricity $0.10/kWh, annual
operation 8,000 hours, delivery pressure 30 psig and corridor width 100 feet.
All values remain editable under View or customize assumptions. Selecting a scenario
replaces these operating values but retains ranking priority and route preferences.
Changes invalidate old route results. Saved drafts retain their numeric values;
legacy or edited values display as Custom unless they exactly match a scenario.
Exports include scenario metadata when the values match, plus the actual assumptions.
