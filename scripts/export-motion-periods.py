#!/usr/bin/env python3
"""Export dated displacement differences from existing stitched HeavenWatch cubes.

Read-only inputs; each footprint/frame stays separate. No velocity extrapolation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd
import xarray as xr
from rasterio.transform import from_origin, array_bounds
from rasterio.warp import calculate_default_transform, reproject, Resampling
from PIL import Image


def period_indices(times, period):
    end = pd.Timestamp(times[-1])
    offset = {'month': pd.DateOffset(months=1), 'year': pd.DateOffset(years=1),
              'five': pd.DateOffset(years=5), 'ten': pd.DateOffset(years=10)}[period]
    target = end - offset
    if target < pd.Timestamp(times[0]):
        return None
    start = int(np.argmin(np.abs(times - target.to_datetime64())))
    if start == len(times)-1:
        return None
    return start, len(times)-1, target


def difference(start, end, start_mask, end_mask, start_quality, end_quality):
    valid = (np.isfinite(start) & np.isfinite(end) & (start_mask == 1) &
             (end_mask == 1) & (start_quality >= .5) & (end_quality >= .5))
    return np.where(valid, (end-start)*1000, np.nan).astype('float32')


def export(source, output):
    output.mkdir(parents=True, exist_ok=True)
    entries = []
    for area, name, frame in [('validation_b', 'Crane / Tubbs Corner', 'F20697'),
                              ('validation_c', 'Toyah', 'F22665')]:
        path = source / 'data' / area / 'disp_cube.zarr'
        ds = xr.open_zarr(path)
        times = ds.time.values
        assert np.all(times[1:] > times[:-1])
        assert np.allclose(np.diff(ds.x),30) and np.allclose(np.diff(ds.y),-30)
        inventory = pd.read_parquet(source / 'data' / area / 'inventory.parquet')
        inventory = inventory[inventory.frame == frame].sort_values('secondary')
        assert np.array_equal(inventory.secondary.to_numpy(),times)
        for period in ['month', 'year', 'five', 'ten']:
            indices = period_indices(times, period)
            if indices is None:
                entries.append({'area': area, 'name': name, 'period': period, 'available': False,
                                'reason': 'Archive begins in 2016; ten full years are not available.'})
                continue
            start, end, target = indices
            # Limit Dask concurrency because source chunks span all dates.
            with __import__('dask').config.set(scheduler='synchronous'):
                pair = ds.isel(time=[start,end]).compute()
            arr = difference(pair.short_wavelength_displacement.values[0], pair.short_wavelength_displacement.values[1],
                             pair.recommended_mask.values[0],pair.recommended_mask.values[1],
                             pair.temporal_coherence.values[0],pair.temporal_coherence.values[1])
            transform = from_origin(float(ds.x[0])-15,float(ds.y[0])+15,30,30)
            bounds = array_bounds(*arr.shape,transform)
            dst, width, height = calculate_default_transform(ds.attrs['crs_wkt'],'EPSG:4326',arr.shape[1],arr.shape[0],*bounds)
            grid = np.full((height,width),np.nan,dtype='<f4')
            reproject(arr,grid,src_transform=transform,src_crs=ds.attrs['crs_wkt'],src_nodata=np.nan,
                      dst_transform=dst,dst_crs='EPSG:4326',dst_nodata=np.nan,resampling=Resampling.nearest)
            t = np.nan_to_num(np.clip(grid/100,-1,1),nan=0)
            neutral=np.array([235,231,203]); blue=np.array([39,142,196]); red=np.array([215,78,43])
            rgb=neutral+np.abs(t)[...,None]*(np.where((t<0)[...,None],blue,red)-neutral)
            rgba=np.concatenate([np.rint(rgb).astype('uint8'),(np.isfinite(grid)*255).astype('uint8')[...,None]],axis=2)
            key=area+'_'+period
            Image.fromarray(rgba).save(output/(key+'.png'))
            grid.tofile(output/(key+'.f32'))
            entry={'id':key,'area':area,'name':name,'frame':frame,'period':period,'available':True,
                   'startDate':str(times[start])[:10],'endDate':str(times[end])[:10],
                   'requestedStart':str(target)[:10],'units':'mm LOS','colorRange':[-100,100],
                   'bounds':list(array_bounds(height,width,dst)),'width':width,'height':height,
                   'image':key+'.png','values':key+'.f32','validPixels':int(np.isfinite(grid).sum()),
                   'imageSha256':hashlib.sha256((output/(key+'.png')).read_bytes()).hexdigest(),
                   'valuesSha256':hashlib.sha256((output/(key+'.f32')).read_bytes()).hexdigest(),
                   'nativeDifferenceSha256':hashlib.sha256(arr.tobytes()).hexdigest(),
                   'sourceRecords':inventory.iloc[[start,end]][['title','url']].to_dict('records')}
            entries.append(entry)
            print(json.dumps({k:entry[k] for k in ['id','startDate','endDate','validPixels']}),flush=True)
    manifest={'schemaVersion':1,'title':'Permian pilot · dated surface change','coverage':'Two existing archive footprints only: Crane / Tubbs Corner and Toyah. Not basin-wide coverage.',
              'method':'End minus start of existing epoch-stitched short-wavelength displacement, converted meters to mm. Nearest observation to calendar target; each frame remains separate.',
              'quality':'Both endpoints finite, recommended_mask == 1 and temporal coherence >= 0.5 at both dates. Transparent pixels are unavailable, not zero.',
              'limitations':['Historical archives ending December 2025; not change through today.','Reuses HeavenWatch epoch stitching; the full reconstruction has not been independently revalidated.','Line-of-sight motion, not vertical elevation. No causal attribution.','Different footprints have different observation dates.','Ten-year maps unavailable until sufficient observations exist.'],
              'variants':entries}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2,allow_nan=False)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path('public/reference-data/motion-periods'))
    args=parser.parse_args();export(args.source,args.output)
