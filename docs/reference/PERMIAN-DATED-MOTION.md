# Dated surface-change maps

The ground-movement panel separates the US long-term velocity map (mm/year) from a **Permian pilot dated change** view (mm LOS). Point-history periods affect only the selected US point; map periods replace the pilot raster itself.

## Available pilot

Read-only export from HeavenWatch's existing stitched cubes:

| Area | Frame | Latest archive date | Available map windows |
| --- | --- | --- | --- |
| Crane / Tubbs Corner (`validation_b`) | F20697 | 2025-12-30 | 1 month, 1 year, 5 years |
| Toyah (`validation_c`) | F22665 | 2025-12-12 | 1 month, 1 year, 5 years |

These two footprints are not basin-wide coverage. Ten years is unavailable; both archives begin in 2016. Palo Duro is not yet prepared. Expansion order is Permian, then Palo Duro, as requested September 21, 2026.

Run `scripts/export-motion-periods.py --source /Users/brian/upsoft/heavenwatch` with HeavenWatch's Python environment. Outputs are ignored generated assets in `public/reference-data/motion-periods/`; the normal app build and deployment include them. Run `scripts/test-motion-periods.py` in the same environment for endpoint selection and quality-mask checks.

Each image is end-minus-start displacement from the existing epoch-stitched short-wavelength series, converted meters to millimeters. It is **not** annual velocity multiplied by elapsed years. Start is the nearest observation to a calendar interval before that footprint's latest date. The UI displays actual endpoint dates. All periods share ±100 mm colors; values outside this range saturate visually but remain available to sampling.

Both endpoint values must be finite, have recommended_mask == 1, and temporal coherence >= 0.5. Unavailable pixels are transparent. Individual frames remain separate and are not stitched spatially. Inputs reuse HeavenWatch's prior epoch reconstruction; that complete reconstruction has not been independently revalidated. Short-wavelength LOS is not vertical subsidence or a cause/risk determination.

The generated manifest records dates, bounds, frame IDs, endpoint source granules, quality rules and raster hashes. Browser validation checks the selected marker/readout, replacement and clearing controls, plus actual overlay and sampled-value changes between windows.

## Basin expansion

The remaining work is to inventory source frames intersecting the basin polygons, retrieve/cache their required observations, validate epoch references and endpoint masks, and publish separate frame rasters with a county/basin coverage manifest. The existing small cubes do not establish basin coverage. Process Permian before Palo Duro. Do not silently fill missing or insufficient history with zero or velocity extrapolation.

The [ASF product FAQ](https://docs.asf.alaska.edu/datasets/disp_faq/) distinguishes the service's basic-velocity map from displacement point histories. ASF's [OPERA-DISP-TMS pipeline](https://github.com/ASFHyP3/OPERA-DISP-TMS) documents regional frame processing; its S3-direct processing route requires execution in AWS us-west-2. Local authenticated ranged reads are a separate possible acquisition path already present in HeavenWatch.
