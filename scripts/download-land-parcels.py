#!/usr/bin/env python3
"""Download CC0 TxGIO 2025 county parcels intersecting the two pilot basins.

Requires shapely. Uses the public S3 distribution advertised by TxGIO's catalog.
Keeps source ZIPs unchanged; run export-land-parcels.py next.
"""
import concurrent.futures,json,urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET
from shapely.geometry import shape
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'.gev-cache/land-intake'
S3='https://tnris-data-warehouse.s3.us-east-1.amazonaws.com/'
COUNTIES='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query?where=STATE%3D%2748%27&outFields=GEOID%2CNAME&outSR=4326&f=geojson&maxAllowableOffset=0.001'
def download(url,path):
    if not path.exists():
        tmp=path.with_suffix(path.suffix+'.part')
        urllib.request.urlretrieve(url,tmp)
        tmp.replace(path)
def main():
    BASE.mkdir(parents=True,exist_ok=True)
    download(COUNTIES,BASE/'counties.geojson')
    download(S3+'?list-type=2&prefix=LCD/collection/stratmap-2025-land-parcels/&max-keys=1000',BASE/'s3-index.xml')
    tree=ET.parse(BASE/'s3-index.xml');ns={'s':'http://s3.amazonaws.com/doc/2006-03-01/'}
    assert tree.findtext('s:IsTruncated',namespaces=ns)=='false','S3 index requires pagination'
    keys=[x.text for x in tree.findall('.//s:Key',ns)]
    basins={('permian' if f['properties']['name']=='Permian Basin' else 'palo-duro'):shape(f['geometry']) for f in json.load(open(ROOT/'public/reference-data/basins/usgs-basins.geojson'))['features'] if f['properties']['name'] in ['Permian Basin','Palo Duro Basin']}
    rows=[]
    for f in json.load(open(BASE/'counties.geojson'))['features']:
        g=shape(f['geometry']);membership=[k for k,b in basins.items() if g.intersection(b).area>0]
        if not membership:continue
        fips=f['properties']['GEOID'];matches=[k for k in keys if '/shp/' in k and '_'+fips+'_' in k]
        assert len(matches)==1,(fips,matches)
        rows.append(dict(fips=fips,county=f['properties']['NAME'],basins=membership,geometry=f['geometry'],downloadUrl=S3+matches[0],file=fips+'.zip'))
    def fetch(row):
        download(row['downloadUrl'],BASE/row['file']);print(row['county'],flush=True)
        return dict(row,downloadStatus='downloaded')
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(fetch,rows))
    (BASE/'counties.json').write_text(json.dumps(rows))
if __name__=='__main__':main()
