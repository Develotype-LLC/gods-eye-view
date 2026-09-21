#!/usr/bin/env python3
"""Read existing project data and capture public catalogs into an auditable intake packet."""
import csv, datetime, hashlib, json, subprocess
from pathlib import Path
from urllib.parse import urlencode
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.gev-cache/reference-intake'
HOME=Path('/Users/brian')
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()

def read(path): return json.loads(Path(path).read_text())
def capture(url):
    result=subprocess.run(['curl','-fsSL','--retry','2','--max-time','60',url],capture_output=True,check=True)
    data=json.loads(result.stdout)
    if isinstance(data,dict) and data.get('error'): raise RuntimeError(str(data['error'])[:200])
    return data

def arcgis(key,base,where='1=1'):
    meta=capture(base+'?f=json'); (OUT/(key+'-metadata.json')).write_text(json.dumps(meta))
    ids=sorted(capture(base+'/query?'+urlencode({'where':where,'returnIdsOnly':'true','f':'json'}))['objectIds'])
    field=meta.get('objectIdField') or meta.get('objectIdFieldName') or next(f['name'] for f in meta['fields'] if f['type']=='esriFieldTypeOID')
    def batch(chunk):
        data=capture(base+'/query?'+urlencode({'objectIds':','.join(map(str,chunk)),'outFields':'*','outSR':4326,'f':'geojson'}))
        assert not data.get('exceededTransferLimit')
        features=data['features']; assert sorted(f['properties'][field] for f in features)==chunk
        return features
    features=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for rows in pool.map(batch,[ids[i:i+1000] for i in range(0,len(ids),1000)]):features.extend(rows)
    assert len(features)==len(ids)
    data={'type':'FeatureCollection','features':features}
    path=OUT/(key+'-source.geojson');path.write_text(json.dumps(data))
    return path,data,field

def sql_export(key,query):
    result=subprocess.run(['docker','exec','supabase_db_ag-gis','psql','-U','postgres','-d','postgres','-Atc',query],capture_output=True,check=True)
    path=OUT/(key+'-source.json'); path.write_bytes(result.stdout); return path,read(path)

def provenance(path):
    return {'path':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def feature(key,name,geometry,properties,api8=None,date=None):
    return {'key':str(key),'name':str(name),'geometry':geometry,'properties':properties,'api8':api8,'date':date}

def dataset(key,name,source,note,features,files,observations=None):
    assert len({f['key'] for f in features})==len(features),key
    data={'id':key,'name':name,'source':source,'note':note,'retrievedAt':NOW,'features':features,'observations':observations or [],'files':[provenance(p) for p in files]}
    (OUT/(key+'.json')).write_text(json.dumps(data,allow_nan=False))
    print(key,len(features),'features',len(data['observations']),'observations',flush=True)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    atlas=HOME/'uplabs/basin-atlas/data/generated'
    for key,file,name,note in [
      ('flares','viirs-flares.json','VIIRS flares · 2024','Annual 2024 flare detections; not live flare status. Catalog confidence is not an operational probability. No verified operator attribution.'),
      ('tanks','ast-storage-tanks.json','Storage tank detections','Published imagery detections; contents, ownership and capacity are not verified. Source diameter-derived capacity is an estimate.'),
      ('nm-disposal','nm-ocd-disposal.json','New Mexico disposal wells','June 2026 regulatory snapshot; includes inactive and plugged records. This does not establish available capacity.')]:
        path=atlas/file;data=read(path);features=[]
        for a in data['assets']:
            coords=[[lon,lat] for lat,lon in a['coordinates']]
            geom={'type':'Point','coordinates':coords[0]} if a['geometryKind']=='point' else {'type':'Polygon','coordinates':[coords if coords[0]==coords[-1] else coords+[coords[0]]]}
            props=dict(a);props.pop('coordinates');props.pop('confidence',None)
            if key=='flares':props.pop('operator',None)
            features.append(feature(a['id'],a['name'],geom,props))
        dataset(key,name,features[0]['properties']['sourceUrl'],note,features,[path])
    path=HOME/'uplabs/Exxon_Permian_Offline/geojson/ponds.geojson';data=read(path)
    dataset('ponds','Produced-water pond candidates','Local Exxon Permian offline package · Sentinel-2 and NM OCD',
      '52 curated pond points, not pond footprint polygons. Texas ownership is inferred by proximity. Volumes are modeled from assumed depth, not measured capacity; see attribution tier.',
      [feature(f['properties']['pond_id'],f['properties']['pond_id'],f['geometry'],f['properties']) for f in data['features']],[path])
    base=HOME/'uplabs/xon/Reference Library/outputs/rrc-texnet-out-of-basin-investigation-2026-07-23/data/texnet'
    wp=base/'texnet_wells.csv';hp=base/'texnet_annual_injection_by_well.csv'
    with wp.open() as h:wells=list(csv.DictReader(h))
    with hp.open() as h:history=list(csv.DictReader(h))
    features=[feature(w['Id'],w['LeaseName']+' '+w['WellNumber'].strip(),{'type':'Point','coordinates':[float(w['SurfaceLongitude']),float(w['SurfaceLatitude'])]},w,w['APINumber']) for w in wells if w['SurfaceLatitude'] and w['SurfaceLongitude']]
    obs=[{'key':r['WellId'],'period':r['year'],'kind':'Annual reported injection','raw':r} for r in history]
    dataset('texnet-injection','TexNet injection reporting','https://maps.texnet.beg.utexas.edu/arcgis/rest/services/injection/injection/MapServer',
      'July 2026 local capture. Operator reporting subset, not statewide coverage. Annual summaries of reported rows do not prove continuous reporting, water routing or spare capacity.',features,[wp,hp],obs)
    path,data,oid=arcgis('texnet-seismic','https://maps.texnet.beg.utexas.edu/arcgis/rest/services/catalog/catalog_all/MapServer/0')
    features=[]
    for f in data['features']:
        p=f['properties'];date=datetime.datetime.fromtimestamp(p['Event_Date']/1000,datetime.timezone.utc).date().isoformat()
        features.append(feature(p[oid],f"{p['EventId']} · M{p['Magnitude']}",f['geometry'],p,date=date))
    dataset('texnet-seismic','TexNet reviewed earthquakes','https://maps.texnet.beg.utexas.edu/arcgis/rest/services/catalog/catalog_all/MapServer/0',
      'Reviewed catalog snapshot; preliminary layer excluded. Event coincidence with injection does not establish causation. Dates are UTC; source depth and uncertainty fields are retained.',features,[path,OUT/'texnet-seismic-metadata.json'])
    types=['Recycling Facility - (RFL)','Treating Plant - (TP)','Injection Plant - (INJ)','Brine Well Facility - (BW)','Pipeline - Water - (PLW)']
    path,data,oid=arcgis('nm-water','https://gis.emnrd.nm.gov/arcgis/rest/services/OCDView/Facilities_Public/FeatureServer/0',"type IN ("+','.join("'"+t+"'" for t in types)+")")
    dataset('nm-water','NM water infrastructure','https://gis.emnrd.nm.gov/arcgis/rest/services/OCDView/Facilities_Public/FeatureServer/0',
      'Regulatory facility points: recycling, treating, injection, brine and water pipelines. Pipeline records are points, not routes. Status and permit records do not prove operating throughput.',
      [feature(f['properties'][oid],f['properties']['name'] or f['properties']['id'],f['geometry'],f['properties']) for f in data['features']],[path,OUT/'nm-water-metadata.json'])
    path,data=sql_export('openet',"SELECT json_build_object('fields',(SELECT json_agg(json_build_object('properties',to_jsonb(f)-'geom','geometry',ST_AsGeoJSON(f.geom)::json)) FROM public.openet_field f),'observations',(SELECT json_agg(t) FROM public.et_timeseries t),'runs',(SELECT json_agg(json_build_object('source',source,'params',params,'status',status,'row_count',row_count,'finished_at',finished_at)) FROM public.ingestion_run WHERE source='openet'))")
    features=[feature(f['properties']['field_id'],f['properties']['field_id']+' · '+(f['properties']['crop_name'] or 'Unknown crop'),f['geometry'],f['properties']) for f in data['fields']]
    obs=[{'key':r['field_id'],'period':r['date'][:7],'kind':r['variable'],'value':float(r['et_mm']) if r['et_mm'] is not None else None,'raw':r} for r in data['observations']]
    dataset('openet','Evapotranspiration · OpenET fields','https://etdata.org/',
      '42 fields near Lubbock only; monthly 2018 sample. ET is satellite-model actual evapotranspiration in mm/month. ETo is reference evapotranspiration, not actual consumption. No statewide ET coverage is implied.',features,[path],obs)
    path,data=sql_export('cooling-water',"SELECT json_build_object('facilities',(SELECT json_agg(json_build_object('properties',to_jsonb(f)-'geom','geometry',ST_AsGeoJSON(f.geom)::json)) FROM public.water_use_facility f),'observations',(SELECT json_agg(t) FROM public.monthly_facility_water_use t))")
    features=[feature(f['properties']['facility_id'],f['properties']['facility_name'],f['geometry'],f['properties']) for f in data['facilities']]
    obs=[{'key':r['facility_id'],'period':r['period_date'][:7],'kind':'Cooling water','raw':r} for r in data['observations']]
    dataset('cooling-water','Cooling-water facilities · EIA','https://www.eia.gov/electricity/data/eia923/',
      'Existing 2018 EIA facility and monthly cooling-water records. Withdrawal and consumption are distinct, in million gallons. These are demand context, not confirmed produced-water customers.',features,[path],obs)
if __name__=='__main__':main()
