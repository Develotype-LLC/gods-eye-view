#!/usr/bin/env python3
"""Load complete official inventories into versioned PostGIS tables; activate only after count reconciliation."""
import argparse, concurrent.futures, hashlib, json, math, time
from datetime import datetime, timezone
from pathlib import Path
import requests
import psycopg2
from psycopg2.extras import execute_values, Json
GIS='https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/1/query'
UIC='https://data.texas.gov/resource/givw-z9t4.json'

def fetch(url,params,post=False):
    for attempt in range(5):
        try:
            r=requests.post(url,data=params,timeout=(15,90)) if post else requests.get(url,params=params,timeout=(15,90))
            r.raise_for_status();data=r.json()
            if isinstance(data,dict) and 'error' in data:raise RuntimeError(str(data['error'])[:300])
            return data
        except (requests.RequestException,ValueError,RuntimeError):
            if attempt==4:raise
            time.sleep(2**attempt)

def api(value):
    text=str(value or '').strip()
    return text if len(text)==8 and text.isdigit() and not text.endswith('00000') else None

def main():
    parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['gis','uic']);parser.add_argument('--resume',type=int);args=parser.parse_args()
    conn=psycopg2.connect(dbname='landman',user='postgres');conn.autocommit=False
    with conn.cursor() as cur:
        cur.execute('SELECT pg_try_advisory_lock(492811)');assert cur.fetchone()[0], 'Another import is running'
    if args.kind=='gis':
        result=fetch(GIS,{'where':'1=1','returnIdsOnly':'true','f':'json'})
        ids=sorted(result['objectIds']);assert ids and len(ids)==len(set(ids));expected=len(ids)
    else: expected=int(fetch(UIC,{'$select':'count(*) AS total'})[0]['total'])
    with conn.cursor() as cur:
        if args.resume:
            run=args.resume;cur.execute('SELECT source,state,expected_count,metadata FROM landman.ingest_run WHERE id=%s',(run,));prior=cur.fetchone();assert prior and prior[0]==args.kind and prior[1]=='loading' and prior[2]==expected
            if args.kind=='gis':assert prior[3].get('id_hash')==hashlib.sha256(json.dumps(ids).encode()).hexdigest(), 'Source ID list changed; start a new run'
        else:
            metadata={'url':GIS if args.kind=='gis' else UIC,'scope':'All Texas source records','transform':'GIS geometries requested in EPSG:4326; UIC coordinates transformed from NAD83 EPSG:4269','id_hash':hashlib.sha256(json.dumps(ids).encode()).hexdigest() if args.kind=='gis' else None}
            cur.execute('INSERT INTO landman.ingest_run(source,expected_count,metadata) VALUES(%s,%s,%s) RETURNING id',(args.kind,expected,Json(metadata)));run=cur.fetchone()[0]
    conn.commit();print(json.dumps({'run':run,'source':args.kind,'expected':expected}),flush=True)
    table='well_location' if args.kind=='gis' else 'uic_permit'
    if args.kind=='gis':
        with conn.cursor() as cur:cur.execute('SELECT objectid FROM landman.well_location WHERE run_id=%s',(run,));existing={r[0] for r in cur}
        chunks=[ids[i:i+1000] for i in range(0,len(ids),1000)];chunks=[c for c in chunks if not all(i in existing for i in c)]
        def batch(chunk):
            data=fetch(GIS,{'objectIds':','.join(map(str,chunk)),'outFields':'OBJECTID,API,GIS_WELL_NUMBER,SYMNUM,GIS_SYMBOL_DESCRIPTION,GIS_LOCATION_SOURCE,RELIAB,GIS_LAT83,GIS_LONG83','returnGeometry':'true','outSR':'4326','f':'json'},True)
            features=data.get('features',[])
            assert not data.get('exceededTransferLimit') and sorted(f['attributes']['OBJECTID'] for f in features)==chunk, 'GIS batch coverage mismatch'
            return features
        # Four bounded upstream requests; keep only a small batch in memory.
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            iterator=iter(chunks);pending={pool.submit(batch,c) for c in [next(iterator,None) for _ in range(4)] if c}
            completed=0
            while pending:
                done,pending=concurrent.futures.wait(pending,return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    features=future.result();rows=[]
                    for f in features:
                        a=f['attributes'];g=f.get('geometry') or {};x=g.get('x');y=g.get('y')
                        wkt=f'POINT({x} {y})' if isinstance(x,(float,int)) and isinstance(y,(float,int)) and math.isfinite(x) and math.isfinite(y) and -180<=x<=180 and -90<=y<=90 else None
                        rows.append((run,a['OBJECTID'],api(a.get('API')),str(a.get('GIS_WELL_NUMBER') or '').strip(),a.get('GIS_SYMBOL_DESCRIPTION') or 'Unclassified',a.get('SYMNUM'),wkt,Json(a)))
                    with conn.cursor() as cur:
                        execute_values(cur,'INSERT INTO landman.well_location(run_id,objectid,api8,well_number,category,symbol,geom,raw) VALUES %s ON CONFLICT(run_id,objectid) DO NOTHING',rows,template='(%s,%s,%s,%s,%s,%s,ST_GeomFromText(%s,4326),%s)',page_size=1000)
                    conn.commit();completed+=len(rows)
                    if completed%25000==0:print(json.dumps({'run':run,'loaded_this_run':completed,'already_present':len(existing),'expected':expected}),flush=True)
                    chunk=next(iterator,None)
                    if chunk:pending.add(pool.submit(batch,chunk))
    else:
        with conn.cursor() as cur:cur.execute('SELECT max(uic) FROM landman.uic_permit WHERE run_id=%s',(run,));last=cur.fetchone()[0] or ''
        while True:
            params={'$limit':10000,'$order':'uic_number'}
            if last:params['$where']=f"uic_number > '{last}'"
            records=fetch(UIC,params)
            if not records:break
            rows=[]
            for r in records:
                u=str(r['uic_number']).strip();assert len(u)==9 and u.isdigit() and u>last
                try:x=float(r['longitude_nad83']);y=float(r['latitude_nad83']);wkt=f'POINT({x} {y})' if math.isfinite(x) and math.isfinite(y) and -180<=x<=180 and -90<=y<=90 else None
                except (KeyError,ValueError,TypeError):wkt=None
                rows.append((run,u,api(r.get('api_no')),int(r['uic_type_injection']) if r.get('uic_type_injection') else None,wkt,Json(r)))
            with conn.cursor() as cur:
                execute_values(cur,'INSERT INTO landman.uic_permit(run_id,uic,api8,injection_type,geom,raw) VALUES %s',rows,template='(%s,%s,%s,%s,ST_Transform(ST_GeomFromText(%s,4269),4326),%s)',page_size=1000)
            conn.commit();last=records[-1]['uic_number'];print(json.dumps({'run':run,'through_uic':last}),flush=True)
    with conn.cursor() as cur:
        cur.execute(f'SELECT count(*),count(geom),count(DISTINCT api8) FROM landman.{table} WHERE run_id=%s',(run,));count,located,apis=cur.fetchone();assert count==expected,(count,expected)
        # Publish complete snapshots atomically; older versions remain recoverable.
        cur.execute('UPDATE landman.ingest_run SET state=\'complete\',row_count=%s,completed_at=now(),metadata=metadata||%s WHERE id=%s',(count,Json({'located':located,'distinct_valid_api8':apis}),run))
        cur.execute('INSERT INTO landman.dataset(name,run_id) VALUES(%s,%s) ON CONFLICT(name) DO UPDATE SET run_id=excluded.run_id',(args.kind,run))
    conn.commit()
    with conn.cursor() as cur:cur.execute(f'ANALYZE landman.{table}')
    conn.commit();print(json.dumps({'run':run,'complete':True,'records':count,'located':located,'distinct_valid_api8':apis}),flush=True)

if __name__=='__main__':main()
