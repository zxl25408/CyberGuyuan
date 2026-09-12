"""Fetch Guyuan (Yuanzhou) OSM layers via Overpass API into the same layered
GeoJSON schema extract_city.py produces. Replaces the blocked Geofabrik pbf
download: the study area is small enough to export live. Output is standard
GeoJSON (lon/lat, unprojected); projection happens in prepare_guyuan_city.py.
"""
import json, time, sys
from pathlib import Path
from urllib.request import Request, urlopen

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/processed/guyuan_study'
OUT.mkdir(parents=True, exist_ok=True)
BBOX = [106.20, 35.98, 106.36, 36.06]  # Guyuan urban: downtown + Guyanling + Qingshui river
BB = f"({BBOX[1]},{BBOX[0]},{BBOX[3]},{BBOX[2]})"
ENDPOINT = 'https://overpass-api.de/api/interpreter'

QUERIES = {
    'roads': f"[out:json][timeout:120];way['highway']{BB};out geom tags;",
    'buildings': f"[out:json][timeout:120];(way['building']{BB};relation['building']{BB};);out geom tags;",
    'green': f"[out:json][timeout:120];(way['leisure'~'park|garden|pitch|golf_course|playground']{BB};way['landuse'~'grass|forest|meadow|recreation_ground|village_green']{BB};relation['leisure'~'park|garden']{BB};);out geom tags;",
    'water': f"[out:json][timeout:120];(way['natural'='water']{BB};way['waterway'~'river|stream|canal|riverbank']{BB};relation['natural'='water']{BB};);out geom tags;",
    'coastline': f"[out:json][timeout:60];way['natural'='coastline']{BB};out geom tags;",
    'railways': f"[out:json][timeout:120];way['railway'~'rail|light_rail']{BB};out geom tags;",
    'pois': f"[out:json][timeout:120];(node['name']['amenity'~'school|hospital|university|college|kindergarten|place_of_worship|police|fire_station|townhall|library|museum|bank']{BB};node['name']['leisure'~'park|stadium|sports_centre']{BB};way['name']['amenity'~'school|hospital|university|museum|townhall']{BB};way['name']['leisure'~'park|stadium']{BB};);out geom tags;",
}

def fetch(query, retries=4):
    for attempt in range(retries):
        try:
            req = Request(ENDPOINT, data=('data=' + query).encode(),
                          headers={'User-Agent': 'Guyuan-city-replica/0.1 (personal non-commercial study)'})
            with urlopen(req, timeout=180) as r:
                return json.loads(r.read())
        except Exception as e:
            print(f'  attempt {attempt+1} failed: {e}', file=sys.stderr)
            if attempt < retries - 1:
                time.sleep(20)
    raise SystemExit('Overpass unreachable after retries')

def ll(c):
    return [c['lon'], c['lat']] if isinstance(c, dict) else list(c[:2])

def is_closed_ring(cs):
    return len(cs) >= 4 and cs[0] == cs[-1]

def geom_of(el):
    """Overpass element geometry -> standard GeoJSON geometry (lon/lat)."""
    if el['type'] == 'node':
        return {'type': 'Point', 'coordinates': [el['lon'], el['lat']]}
    if el['type'] == 'way':
        cs = [ll(c) for c in el.get('geometry', [])]
        if not cs: return None
        tags = el.get('tags', {})
        if is_closed_ring(cs) and (tags.get('building') or tags.get('natural') == 'water'
                                   or tags.get('leisure') or tags.get('landuse')
                                   or tags.get('amenity') or tags.get('area') == 'yes'):
            return {'type': 'Polygon', 'coordinates': [cs]}
        return {'type': 'LineString', 'coordinates': cs}
    # relation: assemble member ways
    lines, polys = [], []
    for m in el.get('members', []):
        if m['type'] != 'way' or 'geometry' not in m: continue
        cs = [ll(c) for c in m['geometry']]
        if not cs: continue
        if is_closed_ring(cs) and m.get('role') in ('outer', 'inner', ''):
            polys.append((m.get('role', 'outer'), cs))
        else:
            lines.append(cs)
    if polys:
        outer = [cs for role, cs in polys if role == 'outer'] or [cs for _, cs in polys]
        inner = [cs for role, cs in polys if role == 'inner']
        if len(outer) == 1:
            return {'type': 'Polygon', 'coordinates': outer + inner}
        return {'type': 'MultiPolygon', 'coordinates': [[o] for o in outer] + [[[i]] for i in inner]}
    if lines:
        return {'type': 'MultiLineString', 'coordinates': lines} if len(lines) > 1 \
            else {'type': 'LineString', 'coordinates': lines[0]}
    return None

def feature(el):
    tags = el.get('tags', {})
    typ = {'node': 'n', 'way': 'w', 'relation': 'r'}[el['type']]
    return {'type': 'Feature', 'id': f"{typ}/{el['id']}",
            'properties': {'osm_type': typ, 'osm_id': el['id'], 'tags': tags,
                           'name': tags.get('name:zh', tags.get('name', '')),
                           'source': 'OpenStreetMap', 'license': 'ODbL-1.0'},
            'geometry': geom_of(el)}

for layer, query in QUERIES.items():
    print(f'{layer} ...', flush=True)
    data = fetch(query)
    feats = [f for f in (feature(el) for el in data.get('elements', [])) if f['geometry']]
    path = OUT / f'{layer}.geojson'
    path.write_text(json.dumps({'type': 'FeatureCollection', 'features': feats},
                               ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'  {len(feats)} features -> {path.name}')
    time.sleep(5)
(OUT / 'bbox.json').write_text(json.dumps(BBOX))
print('done')
