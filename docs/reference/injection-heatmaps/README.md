# Injection heat maps

Injection capacity & reporting → Layer settings → Injection map offers well locations, permitted-capacity heat map, or annual-reported-injection heat map. Annual mode has a year selector (2021–2026 in the current import).

Both heat maps sum values into fixed 5 × 5 km EPSG:5070 equal-area cells. Cells are anchored globally; full edge cells are included, so zoom/pan does not change a cell's total. Color thresholds stay fixed across years and viewports. Cell selection reports total, known-value wells, and missing-value wells. Gray is unknown, while reported zero is retained. These are spatial totals, not interpolation of subsurface capacity.

Capacity uses positive `TotalBPDMax` values from the TexNet well snapshot in bbl/day. Zero/absent values are treated as unknown, not zero permitted capacity. This is not spare/available capacity or a current permit verification. Annual volume sums `reported_volume_bbl` from imported `Annual reported injection` observations for the selected year, in bbl/year. Reporting may be partial or overlapping; no annualization, deduplication of the upstream reported-row sums, or completeness claim is made. 2026 is a partial-year capture. Coverage is the imported TexNet operator-reporting subset, not statewide permits.

Validation: six reference API tests pass, package/import boundaries and production build pass. Read-only production query returns 1,077 located wells in 577 cells. Positive capacity: 1,069 wells, 25,005,390 bbl/day. 2024 reporting: 859 wells, 1,287,476,446.7614434 reported barrels. Both aggregate totals independently match the local source CSVs. These totals are validation of import/aggregation, not validation of permit status or reporting completeness.
