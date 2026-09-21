#!/usr/bin/env python3
"""Prepare licensed TxGIO county files; preserve accounts separately from geometry.

Input directory holds counties.json from official download catalog + basin/county
intersection and the unchanged county SHP ZIPs. No mailing addresses exported.
"""
import csv,gzip,hashlib,json,re,unicodedata
from pathlib import Path
import geopandas as gpd
import numpy as np
from shapely import make_valid,normalize,to_wkb
from shapely.geometry import shape,mapping,MultiPolygon
from shapely.ops import unary_union

ROOT=Path(__file__).resolve().parents[1]
def normalized(value):
    return ' '.join(re.sub(r'[^\w\s]',' ',unicodedata.normalize('NFKC',str(value or '')).upper()).split())
def clean(value):
    if value is None:return None
    if isinstance(value,(float,np.floating)) and not np.isfinite(value):return None
    if isinstance(value,np.generic):return value.item()
    return value

def main():
    source=ROOT/'.gev-cache/land-intake';out=source/'packet';out.mkdir(exist_ok=True)
    basins=json.load(open(ROOT/'public/reference-data/basins/usgs-basins.geojson'))
    b={('permian' if f['properties']['name']=='Permian Basin' else 'palo-duro'):shape(f['geometry']) for f in basins['features'] if f['properties']['name'] in ['Permian Basin','Palo Duro Basin']}
    (out/'basins.json').write_text(json.dumps({k:mapping(v) for k,v in b.items()}))
    counties=json.load(open(source/'counties.json'));manifest=[]
    for county in counties:
        path=source/county['file'];sha=hashlib.sha256(path.read_bytes()).hexdigest()
        df=gpd.read_file('zip://'+str(path)).to_crs(4326);df.columns=[x.upper() for x in df.columns];geom=df['GEOMETRY']
        parcel_rows={};account_rows=[];dates=set();invalid=0;skipped=0
        for ix,row in df.iterrows():
            g=row['GEOMETRY']
            if g is None or g.is_empty:skipped+=1;continue
            if not g.is_valid:g=make_valid(g);invalid+=1
            if g.geom_type=='GeometryCollection':g=unary_union([v for v in g.geoms if v.geom_type in ['Polygon','MultiPolygon']])
            if g.geom_type not in ['Polygon','MultiPolygon'] or g.is_empty:skipped+=1;continue
            if g.geom_type=='Polygon':g=MultiPolygon([g])
            g=normalize(g);wkb=to_wkb(g,hex=True,include_srid=False);key=hashlib.sha256(bytes.fromhex(wkb)).hexdigest()[:32]
            if key not in parcel_rows:
                hits=[k for k,v in b.items() if v.intersects(g) and v.intersection(g).area>0]
                parcel_rows[key]=(county['fips'],key,wkb,json.dumps(hits))
            owner=clean(row.get('OWNER_NAME')) or 'Owner not supplied'
            keep=['PROP_ID','GEO_ID','LEGAL_AREA','LGL_AREA_U','GIS_AREA','GIS_AREA_U','LEGAL_DESC','STAT_LAND_','LOC_LAND_U','SOURCE','DATE_ACQ','TAX_YEAR']
            props={k:clean(row.get(k)) for k in keep};date=str(props.get('DATE_ACQ') or '')
            if date:dates.add(date)
            account_rows.append((county['fips'],str(ix),key,str(owner),normalized(owner) or 'OWNER NOT SUPPLIED',json.dumps(props,ensure_ascii=False,allow_nan=False)))
        for name,rows in [('parcels',parcel_rows.values()),('accounts',account_rows)]:
            with gzip.open(out/(county['fips']+'-'+name+'.csv.gz'),'wt',newline='') as f:csv.writer(f).writerows(rows)
        manifest.append({'fips':county['fips'],'county':county['county'],'basins':county['basins'],'sourceUrl':county['downloadUrl'],'sha256':sha,'collection':'TxGIO Land Parcels 2025','license':'CC0-1.0','sourceDates':sorted(dates),'sourceRows':len(df),'parcels':len(parcel_rows),'accounts':len(account_rows),'repairedGeometries':invalid,'unlocatedRows':skipped,'geometry':county['geometry']})
        print(county['county'],len(parcel_rows),len(account_rows),flush=True)
    (out/'manifest.json').write_text(json.dumps(manifest))
    registry=json.load(open('/Users/brian/uplabs/IC2/LONG_HAUL/data/research-lanes-2026-09-19/entities.json'))
    # Remove project-specific client designations. Research names remain candidates.
    for e in registry['entities']:
        e.pop('clientScopeCandidate',None)
        if e['category']=='client':e['category']='unclassified'
    (out/'entity-seeds.json').write_text(json.dumps(registry))
if __name__=='__main__':main()
