# Landman workspace

The standalone app opens a Landman workspace for a fresh visit. `?view=landman` selects it explicitly; `?view=console` restores the original console. A shared scene without an explicit view retains the console. The choice is saved in local storage and the URL.

The left sidebar groups the existing 14 map layers by oil/gas, geology/movement, water/infrastructure, and activity/water use. Switches change visibility; layer names enable the layer, zoom to coverage, and open its inspector. Search matches names, sources, categories and coverage labels. Active only filters the list. The RRC archive is searchable separately because most archive rows have no map geometry.

Task presets replace the Landman layer selection and move to the relevant area:

- Overview: Texas wells and USGS basins.
- Water: TexNet injection reporting, pond candidates, NM water facilities and disposal wells.
- Well history: RRC inactive wells and plugging actions.
- Ground movement: Crane OPERA ground motion and reviewed TexNet earthquakes.
- ET fields: Lubbock OpenET pilot, July 2018 initially; choose month and actual ET/reference ETo in the inspector.

Existing panels are mounted into one inspector while Landman is active and returned to their original placement in the full console. Closing the inspector leaves layers visible. Marker selections and source-library actions open the appropriate inspector. The workspace removes tactical overlays and unrelated enabled layers while active; returning to the console restores its visual settings and prior non-Landman layers.

Narrow screens have a Layers toggle and a lower inspector sheet. The 2D / 3D tilt action uses the existing camera control. Map-provider selection, cinematic scenes, drawing, voice and other advanced tools remain in Full console.

This is a UI change over the existing authenticated APIs. No new datasets, refresh schedules, ownership claims or parcel boundaries are introduced. Collection dates and limitations remain visible; land, leases and mineral rights are explicitly marked unconnected.

## Compare locations

Use **Compare locations · A → B** to set a reference A and then inspect B by map click or latitude/longitude entry. Picking stays active for subsequent B locations until Stop picking, closing the inspector, or leaving Landman. Clear removes the reference and markers. The reference is session-only; refreshing requires selecting A again.

Terrain elevation is a separate registered layer. Its globe material colors modelled terrain by WGS84 ellipsoidal height relative to A (blue lower, cream equal, red higher). Select ±25/100/500/2,000 m; extremes saturate. The existing Re:Earth height service supplies A/B readings, while the globe mesh supplies display detail. This is not survey-grade or mean-sea-level elevation. Photoreal tiles switch to satellite terrain for heat-map visibility; flat fallback terrain is refused.

The OPERA layer can show its existing absolute LOS velocity or the per-pixel rate minus A's rate, with a ±30 mm/year scale. This is the installed 2016–2025 rate snapshot, not a two-date displacement calculation, and LOS is not vertical subsidence. Outside/no-data reference pixels suppress the relative raster and show a message; missing values never become zero. Both heat maps may be on, with an explicit blended-color notice.

Point B inspection uses only shown Landman layers and retains each reference collection's period/measurement selection and Texas GIS classification filter. The search radius is 100 m, 500 m, 1 km or 5 km. Authenticated GET `/api/reference/texas/inspect` and `/api/reference/records/inspect` use indexed spatial bounding, geography-distance filtering, parameterized inputs, a complete count and five nearest source rows per layer. Polygon containment and distance to geometry are separate labels. Open source record returns to the existing record inspector. Basin containment uses the installed USGS polygons including holes; OPERA samples its installed raster directly. Other full-console layers explicitly state when no location adapter exists.

There is no schema migration. Tests cover radius/coordinate validation, bounded SQL and filters, null-versus-zero comparisons, color saturation, and polygon holes. Query failures are shown per layer so they cannot masquerade as zero records.

## US ground movement (2026-09-21)

Ground movement now defaults to the ASF national short-wavelength velocity overview. Coverage controls retain the local Crane archive. Lower 48, Alaska, and Hawaii navigation buttons and separate ascending/descending orbits are available. Coverage is the provider's valid observations, not a guarantee of a valid measurement at every US location; underlying tiles also include neighboring OPERA coverage.

Click the map (outside A/B picking mode) or enter coordinates to query the provider-derived short-wavelength point history. One month, one year, five years, ten years, and all-available comparisons use actual observation endpoints and report dates, sample counts, start-date offsets, and largest gaps. Insufficient historical coverage is explicit. Values are millimeters LOS; the national raster remains long-term millimeters/year and is not recolored by point-period selection. No arbitrary-date national change raster is claimed. Frames and orbit directions remain separate. Missing/masked values are not zero. Missing provider quality flags are disclosed. The archive's relative-to-A raster is available only in Crane mode.

The fixed-origin server endpoints are `/api/reference/ground-motion/history?longitude=...&latitude=...&direction=ascending` and `/api/reference/ground-motion/tiles/{asc|desc}/{z}/{x}/{y}.png`. The former proxies ASF's public `/timeseries` service; no Earthdata credential is needed for this service. Downloads of source NetCDF products remain a separate authenticated workflow. Tile colors decode ASF's grayscale velocity range (-0.03 to +0.03 m/year) into a diverging ramp. Transparent source alpha is preserved. HTTP 404 tile coverage becomes transparent; other upstream failures remain errors. Both proxy caches are bounded, and requests have timeouts, body limits, and fixed upstream destinations.

Integration sources: https://github.com/asfadmin/Discovery-SearchUI (NetcdfService and MapService), https://docs.asf.alaska.edu/datasets/disp_faq/ . ASF's service/mosaic deployment URLs are implementation dependencies rather than a versioned public API contract. They should be checked if the service changes. Snapshot acquisition checks still refer to the installed Crane frame; the US history returns dates for the actual selected point.
