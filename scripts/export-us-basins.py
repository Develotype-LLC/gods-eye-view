"""Capture the official national basin overlay; no API key required."""
import datetime
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = 'https://energy.usgs.gov/arcgis/rest/services/BaseMaps/Sedimentary_Basin/MapServer/0'
OUT = Path(__file__).resolve().parents[1] / 'public/reference-data/basins'

def get(params):
    with urlopen(BASE + '/query?' + urlencode(params), timeout=60) as response:
        return response.read()

if __name__ == '__main__':
    expected = json.loads(get({'where': '1=1', 'returnCountOnly': 'true', 'f': 'json'}))['count']
    payload = get({'where': '1=1', 'outFields': 'OBJECTID,name,basintype,era,source,source_scl',
                   'outSR': 4326, 'geometryPrecision': 4, 'maxAllowableOffset': 0.02, 'f': 'geojson'})
    data = json.loads(payload)
    assert data['type'] == 'FeatureCollection' and len(data['features']) == expected
    assert len({f['properties']['OBJECTID'] for f in data['features']}) == expected
    assert all(f['geometry']['type'] in ('Polygon', 'MultiPolygon') and f['properties']['name'] for f in data['features'])
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'usgs-basins.geojson').write_bytes(payload)
    (OUT / 'manifest.json').write_text(json.dumps({
        'source': 'USGS Sedimentary Basins of the U.S.A.', 'url': BASE,
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'featureCount': expected, 'sha256': hashlib.sha256(payload).hexdigest(),
        'crs': 'EPSG:4326', 'querySimplificationDegrees': 0.02, 'coordinateDecimals': 4,
    }, indent=2) + '\n')
    print(f'Captured {expected} basin polygons')
