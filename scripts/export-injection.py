#!/usr/bin/env python3
"""Export audited, existing HeavenWatch RRC artifacts without changing the source."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import geopandas as gpd
import pandas as pd


def export(source, output):
    base = source / 'data/validation_b/rrc'
    wells_path = base / 'injection_wells.geoparquet'
    volumes_path = base / 'injection_volume.parquet'
    wells = gpd.read_parquet(wells_path)
    volumes = pd.read_parquet(volumes_path)
    assert wells.api14.is_unique and not volumes.duplicated(['api14', 'month']).any()
    assert not (set(volumes.api14) - set(wells.api14))
    assert volumes.bbl.notna().all() and (volumes.bbl >= 0).all()
    assert wells.geometry.geom_type.eq('Point').all() and wells.geometry.notna().all()
    assert wells.crs.to_epsg() == 4326
    assert wells.geometry.x.between(-103, -102).all() and wells.geometry.y.between(31, 32).all()
    series = {}
    number = lambda v: None if pd.isna(v) else float(v)
    for api, group in volumes.sort_values('month').groupby('api14'):
        series[api] = [{'month': row.month.strftime('%Y-%m'), 'bbl': number(row.bbl),
                        'avgPsi': number(row.avg_psi), 'maxPsi': number(row.max_psi)}
                       for row in group.itertuples()]
    features = []
    for row in wells.itertuples():
        assert row.api14 == '42' + row.api_no + '0000'
        features.append({'id': row.api14, 'api8': row.api_no, 'uics': row.uic_numbers.split(';'),
            'longitude': row.geometry.x, 'latitude': row.geometry.y,
            'zone': row.disposal_zone if pd.notna(row.disposal_zone) else 'unknown',
            'zoneRule': row.zone_rule if pd.notna(row.zone_rule) else 'unknown',
            'permitDate': str(row.permit_date) if pd.notna(row.permit_date) else None,
            'permitType': int(row.uic_type), 'canceled': bool(row.canceled), 'plugged': bool(row.plugged),
            'topFt': number(row.top_inj_zone_ft), 'bottomFt': number(row.bot_inj_zone_ft),
            'history': series.get(row.api14, [])})
    result = {'schemaVersion': 1, 'title': 'Crane County area disposal wells',
        'evidence': 'Historical public records, transformed by HeavenWatch',
        'exportedAt': datetime.now(timezone.utc).isoformat(), 'sourceRetrievedAt': None,
        'period': [volumes.month.min().strftime('%Y-%m'), volumes.month.max().strftime('%Y-%m')],
        'wellCount': len(features), 'historyWellCount': len(series), 'recordCount': len(volumes),
        'bounds': wells.total_bounds.tolist(),
        'sources': [{'name': 'Texas RRC UIC well-location master', 'url': 'https://data.texas.gov/resource/givw-z9t4.json'},
                    {'name': 'Texas RRC H-10 injection monitoring', 'url': 'https://data.texas.gov/resource/qq2j-f2zm.json'}],
        'limitations': [
            'Historical local archive, not current operating status. Exact original retrieval time is not recorded in these artifacts.',
            'UIC disposal types 1 and 2 only; waterflood type 3 excluded. Multiple permits are aggregated to a well.',
            'The 14-digit join ID is synthesized from Texas API-8 with state 42 and suffix 0000; it is not a verified completion identifier.',
            'Locations retain the source NAD83 coordinates as approximately WGS84, following HeavenWatch. They are not surveyed locations.',
            'No record means missing coverage, not zero injection. Trailing zero months were removed upstream. Earlier blank volumes may have been converted to zero, so archived zero is not independently verified.',
            'H-10 reporting is delayed; recent or absent months cannot establish shutoff. Latest available month differs by well.',
            'Pressure zeros were converted to missing upstream because unreported pressure and gravity feed could not be distinguished.',
            'Shallow/deep is a HeavenWatch interpretation. Its rule is shown per well; it is not a regulator risk rating.',
            'Proximity to ground movement does not establish cause, injection attribution, or available disposal capacity.'
        ],
        'inputHashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [wells_path, volumes_path]},
        'wells': features}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'injection.json').write_text(json.dumps(result, allow_nan=False, separators=(',', ':')) + '\n')
    print(json.dumps({k: result[k] for k in ['wellCount', 'historyWellCount', 'recordCount', 'period']}))

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--output', type=Path, default=Path('public/reference-data/heavenwatch'))
    a = p.parse_args()
    export(a.source, a.output)
