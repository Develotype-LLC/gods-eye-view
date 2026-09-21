# Produced-water pipeline planner

Open the Landman workspace and choose **Plan a produced-water pipeline**. Pick source and delivery points on the map or enter latitude, longitude. Endpoints must be in Texas and 0.25–50 km apart. The Permian example is an illustrative location pair, not a client project.

Set flow, inside diameter, density, viscosity, roughness, combined pump/motor efficiency, electricity tariff, annual hours, outlet pressure and screening corridor width. Compare seven candidate alignments, then adjust the owner-name priority slider. Select a candidate to view its elevation profile, pumping electricity estimate, intersected parcels, appraisal names and source dates. Drafts remain in the current browser; GeoJSON exports include assumptions and limitations.

## Calculation and evidence

Seven deterministic alignments (direct, four doglegs, two S-shaped candidates) are compared. This is preliminary candidate screening, not a global routing optimizer. Each route uses 25 sampled Re:Earth ellipsoidal terrain heights. Darcy–Weisbach friction uses Colebrook for turbulent flow and 64/Re for laminar flow. Transitional flow is flagged. Source pressure is assumed zero gauge; required head accounts for accumulated friction, sampled crests and outlet pressure, with no energy recovery. Electrical power is rho*g*Q*head / combined efficiency; annual electricity cost multiplies power by hours and tariff.

Method reference: [DOE Fluid Flow handbook](https://www.energy.gov/ehss/articles/doe-hdbk-10123-92).

PostGIS intersects each corridor with the active TxGIO appraisal parcel snapshots already imported for Permian and Palo Duro. Unique normalized appraisal names are counted across parcels; aliases may remain separate and appraisal names are not verified legal parties or contract counts. Coverage measures route centerline coverage by parcel geometry, not legal ROW availability or coverage of the entire corridor width.

Automatic rankings require complete terrain, at least 99.999% centerline parcel coverage, no unknown owners and an untruncated query. Incomplete candidates remain visible for manual inspection. Results are capped at 3,000 intersected parcels per candidate. The weighted score normalizes electricity cost and owner-name count over eligible candidates; it does not monetize acquisition costs.

## Exclusions and next increments

No construction cost, easement cost, maintenance, crossing clearance, road/rail/wetland avoidance, existing corridor preference, existing owner agreements, burial depth, fittings, solids/gas, surge, pump curves, station spacing, pipe pressure rating or surveyed route is modeled. Sparse terrain samples can miss crests. Current defaults are editable assumptions, not measured produced-water properties.

Next increments: editable waypoints and exclusion areas; client-owned/secured parcels; terrain/ownership cost-surface routing; crossings and constructability constraints; shared project alternatives; verified party and easement workflow.
