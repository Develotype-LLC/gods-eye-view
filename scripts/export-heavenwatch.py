#!/usr/bin/env python3
"""Read-only export of HeavenWatch's existing public OPERA-derived rasters.

Run with HeavenWatch's Python environment. Never imports its config or secrets.
No pipeline fitting, scoring, or fresh NASA download is performed here.
"""
import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import from_origin, array_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling
import xarray as xr
from PIL import Image
from matplotlib import colormaps


def tree_hash(path):
    digest = hashlib.sha256()
    files = sorted(path.rglob('*')) if path.is_dir() else [path]
    for item in files:
        if not item.is_file():
            continue
        digest.update(str(item.relative_to(path) if path.is_dir() else item.name).encode())
        with item.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
    return digest.hexdigest()


def export(source, output):
    source = source.resolve()
    base = source / 'data/validation_b'
    cube = xr.open_zarr(base / 'disp_cube.zarr')
    inventory = pd.read_parquet(base / 'inventory.parquet')
    inventory = inventory[inventory.frame == 'F20697'].sort_values('secondary')
    assert len(inventory) == cube.sizes['time'] == 269
    assert np.array_equal(inventory.secondary.to_numpy(), cube.time.values)
    output.mkdir(parents=True, exist_ok=True)
    variants = []
    for var, label in [('displacement', 'Full displacement'), ('short_wavelength_displacement', 'Short-wavelength displacement')]:
        path = base / f'features_{var}.zarr'
        ds = xr.open_zarr(path)
        assert ds.attrs['var'] == var
        assert np.array_equal(ds.x, cube.x) and np.array_equal(ds.y, cube.y)
        values = ds.velocity.values.astype('float32')
        assert np.allclose(np.diff(ds.x), 30) and np.allclose(np.diff(ds.y), -30)
        transform = from_origin(float(ds.x[0]) - 15, float(ds.y[0]) + 15, 30, 30)
        bounds = array_bounds(*values.shape, transform)
        target, width, height = calculate_default_transform(ds.attrs['crs_wkt'], 'EPSG:4326', values.shape[1], values.shape[0], *bounds)
        grid = np.full((height, width), np.nan, dtype='<f4')
        reproject(values, grid, src_transform=transform, src_crs=ds.attrs['crs_wkt'], src_nodata=np.nan,
                  dst_transform=target, dst_crs='EPSG:4326', dst_nodata=np.nan, resampling=Resampling.nearest)
        rgba = colormaps['RdBu_r'](np.clip((grid + 30) / 60, 0, 1))
        rgba[..., 3] = np.isfinite(grid)
        png = output / f'{var}.png'
        binary = output / f'{var}.f32'
        Image.fromarray((rgba * 255).astype('uint8')).save(png)
        grid.tofile(binary)
        finite = grid[np.isfinite(grid)]
        variants.append({
            'id': var, 'label': label, 'image': png.name, 'values': binary.name,
            'width': width, 'height': height, 'bounds': list(array_bounds(height, width, target)),
            'valueEncoding': 'float32-little-endian-row-major-north-to-south', 'noData': 'NaN',
            'units': 'mm/year LOS', 'colorRange': [-30, 30],
            'min': float(finite.min()), 'max': float(finite.max()),
            'validPixels': int(finite.size), 'validFraction': float(finite.size / grid.size),
            'sourceHash': tree_hash(path), 'imageSha256': hashlib.sha256(png.read_bytes()).hexdigest(),
            'valuesSha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
        })
    granules = [{'title': row.title, 'url': row.url, 'acquired': row.secondary.isoformat(),
                 'processed': row.processing.isoformat()} for row in inventory.itertuples()]
    (output / 'granules.json').write_text(json.dumps(granules, indent=2) + '\n')
    manifest = {
        'schemaVersion': 1, 'id': 'heavenwatch-crane-opera', 'title': 'Crane County / Tubbs Corner',
        'source': 'NASA JPL OPERA DISP-S1 · Sentinel-1 · ASF DAAC',
        'sourceUrl': 'https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/',
        'evidence': 'Calculated from public satellite observations', 'status': 'Historical snapshot',
        'startDate': str(cube.time.values[0])[:10], 'endDate': str(cube.time.values[-1])[:10],
        'acquisitions': 269, 'frame': 'F20697', 'nativePostingMeters': 30,
        'nativeCrs': 'EPSG:32613', 'displayCrs': 'EPSG:4326',
        'method': 'Existing HeavenWatch OLS LOS velocity over the stitched full time series; no AOI-median subtraction. Reprojected with nearest-neighbor sampling.',
        'quality': 'Mean temporal coherence >= 0.5; recommended mask valid for at least half of epochs; at least 8 finite observations per fitted pixel.',
        'sign': 'Positive: toward satellite. Negative: away from satellite. Not a vertical-motion measurement.',
        'limitations': [
            'Historical archive through 2025-12-30; not a live monitoring feed.',
            'Does not establish cause, injection attribution, failure risk, or safe disposal capacity.',
            'Existing derived raster reused; dates/grid checked against cube metadata, but the full fit and epoch stitching were not independently revalidated.',
            'HeavenWatch reports magnitude and onset differences between processing layers and comparison sources.',
            '30 m is native pixel posting, not a guarantee of 30 m effective resolving power.',
            'Colors saturate at ±30 mm/year; sampled values retain the full range. Transparent pixels are no data, not zero motion.',
        ],
        'provenance': {
            'sourceProject': 'HeavenWatch',
            'sourceCommit': subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip(),
            'sourceWorkingTreeDirty': bool(subprocess.check_output(['git', '-C', str(source), 'status', '--porcelain'], text=True).strip()),
            'input': 'data/validation_b/features_<variant>.zarr',
            'inventorySha256': hashlib.sha256((base / 'inventory.parquet').read_bytes()).hexdigest(),
            'granuleIndex': 'granules.json',
            'exportedAt': datetime.now(timezone.utc).isoformat(),
        },
        'variants': variants,
    }
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'output': str(output), 'dates': [manifest['startDate'], manifest['endDate']],
                      'variants': [{k: v[k] for k in ['id', 'width', 'height', 'validPixels', 'min', 'max']} for v in variants]}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('public/reference-data/heavenwatch'))
    args = parser.parse_args()
    export(args.source, args.output)
