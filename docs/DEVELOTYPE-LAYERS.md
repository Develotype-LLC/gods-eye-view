# Develotype oil and gas visualization workspace

This fork starts with the upstream application. No internal reference-library data
has been imported or published. The public GitHub fork contains application code;
private evidence must remain outside Git and its public build artifacts.

## First layer intake

Choose one bounded region and one source snapshot before implementing the first
layer. Candidate geometry includes well locations, disposal facilities, basin
boundaries, and sourced pipelines. Each dataset needs:

- Stable dataset and feature IDs, source title/URL, retrieval date, source date,
  licensing/redistribution status, and SHA-256 of the original input.
- Original coordinates/CRS and the documented transformation to WGS84 GeoJSON.
- Published, Assumed, Calculated, or Open evidence status, preserved per claim.
- An explicit distinction between location, permit, historical activity, current
  operation, ownership, and capacity; a mapped point does not prove all of them.
- A refresh policy, geographic/temporal limits, and source locators shown when
  a user selects a feature.

Start with a reviewed public-data subset. For private reference material, use a
separate authenticated data endpoint/storage path and per-user authorization
before adding multi-user access. Never copy the reference library into `public/`.

## Integration points verified against this checkout

1. Implement a dataset factory beside `src/data/infrastructure.js`, using
   `createLocalGeoJsonLayer` from `src/data/localGeojsonCore.js` for compatible
   GeoJSON/GeoJSONL. Reuse the application's Cesium instance and rendering services.
2. Register the factory in `src/app/constructCatalog.js` and matching stable IDs
   in `src/data/layerState.js`. Catalog metadata must match layer instances.
3. Connect controls in the existing layer UI; verify toggle, selection, source
   details, opacity if supported, saved/share state, and disabled-layer cleanup.
4. Preserve provenance in feature properties and selectable context. Large well
   inventories should use bounds-based loading or tiled data after measuring the
   first subset; avoid loading an entire reference library into the browser.
5. Test feature counts, CRS/bounds, malformed geometry, duplicate IDs, evidence
   labels, and real browser interactions. Then build and deploy a versioned release.

See `docs/INFRASTRUCTURE-LAYERS.md` for the lifecycle and service contract.

## Upstream assets and keys

The MIT license covers code. Upstream's submarine cable dataset and Bhote Koshi
event material have noncommercial restrictions; this baseline retains upstream
assets for evaluation and is not a cleared commercial data product. Remove or
license those datasets before commercial use. Preserve other source attributions.
See `LICENSE` and `DATA_SOURCES.md` for the source-specific notices.

The baseline runs keyless. Photorealistic 3D and optional paid feeds need separately
configured provider credentials and suitable provider terms. Hosted preview mode
does not expose the upstream local-only credential-writing setup route. Add keys
through a reviewed server configuration when needed; never commit them.
