"""Guyuan (Yuanzhou) exterior world from fetched OSM layers. WGS84 -> local
metres at 1:1. Adapted from prepare_driving_city.py (Shenzhen). Inland city:
no coastline, land is the full bbox; heights are typology estimates until
user-verified. Reads data/processed/guyuan_study/{layer}.geojson produced by
fetch_guyuan_overpass.py.
"""
import json, math, re, random
from pathlib import Path
from collections import Counter
from shapely.geometry import shape, box, Point, Polygon, LineString
from shapely.ops import transform
from shapely.strtree import STRtree

R = Path(__file__).resolve().parents[1]; OUT = R / 'public/city'; OUT.mkdir(exist_ok=True)
BBOX = [106.20, 35.98, 106.36, 36.06]
SCALE = 1.0
ORIGIN = [106.273, 36.020]          # downtown Guyuan, near 文化街/中心公园
LON_FACTOR = 89990.0                # 111320 * cos(36.020°); Shenzhen used 102850
bounds = box(*BBOX)

def project(x, y, z=None):
    return ((x - ORIGIN[0]) * LON_FACTOR * SCALE, (y - ORIGIN[1]) * 111320 * SCALE)

def load(layer):
    return json.load(open(R / f'data/processed/guyuan_study/{layer}.geojson', encoding='utf-8'))['features']

def parts(g, kind):
    if g.is_empty: return []
    if g.geom_type == kind: return [g]
    if hasattr(g, 'geoms'): return [p for v in g.geoms for p in parts(v, kind)]
    return []

def coords(ring): return [[round(x, 2), round(y, 2)] for x, y in ring.coords]
def poly(g): return [coords(g.exterior), *[coords(r) for r in g.interiors]]

# Inland: land is the entire study area (roads/buildings clipped to bbox).
land = transform(project, bounds)
landparts = [land]
allowed = {'trunk', 'primary', 'secondary', 'tertiary', 'residential',
           'unclassified', 'service', 'trunk_link', 'primary_link',
           'secondary_link', 'tertiary_link'}
roads = []
for f in load('roads'):
    t = f['properties']['tags']; k = t.get('highway'); g = shape(f['geometry'])
    if k not in allowed or not g.intersects(bounds) or t.get('access') in ['private', 'no'] or t.get('motor_vehicle') == 'no':
        continue
    g = transform(project, g.intersection(bounds))
    try: lanes = max(1, min(5, int(t.get('lanes', '2').split(';')[0])))
    except: lanes = 2
    width = max(5.8, min(16, lanes * 3.0))
    if k == 'service': width = 4.5
    for line in parts(g, 'LineString'):
        line = line.simplify(.8)
        if line.length < 3: continue
        roads.append({'id': f['id'], 'name': t.get('name', '支路'), 'kind': k,
                      'width': width, 'oneway': t.get('oneway') == 'yes',
                      'points': coords(line), 'grade': t.get('layer', '0')})
roadlines = [LineString(r['points']) for r in roads]; tree = STRtree(roadlines)

# Landmarks resolved by name from fetched layers; heights are placeholders
# until user-verified with photos. Original Shenzhen script hardcoded coords.
LANDMARK_NAMES = [
    ('gym_gov', '固原市政府', 24, 60),
    ('hospital', '固原市人民医院', 40, 70),
    ('museum', '固原博物馆', 15, 50),
    ('normal_univ', '宁夏师范学院', 30, 80),
    ('no1_high', '固原市第一中学', 25, 70),
    ('hui_high', '固原回民中学', 25, 70),
    ('xihu_park', '西湖公园', 0, 0),
    ('renmin_park', '人民公园', 0, 0),
    ('guyan_park', '古雁公园', 0, 0),
    ('center_park', '中心公园', 0, 0),
    ('dia bia', '地标广场', 0, 0),
    ('中医院', '固原市中医院', 25, 60),
]
byname = {}
for layer in ['pois', 'green', 'buildings', 'water']:
    for f in load(layer):
        n = f['properties'].get('name', '')
        if n and n not in byname:
            try: byname[n] = shape(f['geometry']).centroid
            except Exception: pass
marks = []
for lid, name, h, radius in [(a, b, c, d) for a, b, c, d in
                             [(m[0], m[1], m[2], m[3]) for m in LANDMARK_NAMES if m[1]]]:
    c = byname.get(name)
    if c is None:
        print('landmark not found in OSM:', name); continue
    x, z = project(c.x, c.y); p = Point(x, z)
    ri = int(tree.nearest(p)); line = roadlines[ri]
    q = line.interpolate(line.project(p))
    dd = min(line.length, max(0, line.project(p)) + 4); p2 = line.interpolate(dd)
    if q.distance(p2) < 1: p2 = line.interpolate(max(0, line.project(p) - 4))
    marks.append({'id': lid, 'name': name, 'lon': round(c.x, 6), 'lat': round(c.y, 6),
                  'x': round(x, 2), 'z': round(z, 2), 'height': h * SCALE,
                  'area': '', 'excludeRadius': radius * SCALE,
                  'arrival': [round(q.x, 2), round(q.y, 2)],
                  'yaw': math.atan2(p2.x - q.x, p2.y - q.y)})

buildings = []; seen = set(); est = Counter()
for f in load('buildings'):
    g = shape(f['geometry']); t = f['properties']['tags']
    if not g.intersects(bounds): continue
    g = transform(project, g.intersection(bounds)); center = g.centroid
    if not land.contains(center) or any(math.hypot(center.x - m['x'], center.y - m['z']) < m['excludeRadius'] for m in marks):
        continue
    if t.get('building') in ['roof', 'garage', 'garages', 'shed', 'construction'] or t.get('building:part'):
        continue
    for p in parts(g, 'Polygon'):
        if p.area < 22: continue
        seed = f['properties']['osm_id']; rnd = random.Random(seed)
        key = (round(p.centroid.x), round(p.centroid.y))
        if key in seen: continue
        seen.add(key)
        raw = t.get('height', ''); lev = t.get('building:levels', '')
        try:
            h = float(re.search(r'[0-9.]+', raw).group()) * SCALE; status = 'osm_height'
        except Exception:
            try:
                h = float(lev) * 3.3 * SCALE; status = 'osm_levels_estimated'
            except Exception:
                # Small loess-plateau city: mostly low-rise, a few new towers.
                h = rnd.choice([10, 13, 16, 19, 22, 26, 33]) * SCALE; status = 'typology_estimate'
        h = max(4, min(80, h)); est[status] += 1
        near = tree.query(p.buffer(12))
        buffers = [roadlines[int(i)].buffer(roads[int(i)]['width'] / 2 + 2.0) for i in near]
        if buffers: p = p.difference(__import__('shapely').ops.unary_union(buffers))
        for pp in parts(p, 'Polygon'):
            if pp.area < 20: continue
            pp = pp.simplify(.4)
            typ = 'office' if h > 26 or t.get('building') in ['commercial', 'office'] else 'residential'
            buildings.append({'id': f['id'], 'name': t.get('name', ''), 'rings': poly(pp),
                              'height': round(h, 1), 'heightSource': status, 'style': typ, 'seed': seed})

green = []; water = []
for layer, dest in [('green', green), ('water', water)]:
    for f in load(layer):
        g = shape(f['geometry']); t = f['properties']['tags']
        if not g.intersects(bounds): continue
        if layer == 'water' and t.get('natural') == 'wetland': continue
        g = transform(project, g.intersection(bounds)).intersection(land)
        for p in parts(g, 'Polygon'):
            if p.area < 180: continue
            dest.append({'name': t.get('name', ''), 'rings': poly(p.simplify(1))})

# Spawn near downtown: drivable primary/secondary road closest to origin.
spawnpoint = Point(*project(*ORIGIN))
choices = [i for i, r in enumerate(roads)
           if r['kind'] in ['primary', 'secondary', 'trunk']]
si = min(choices, key=lambda i: roadlines[i].distance(spawnpoint))
sl = roadlines[si]; sp = sl.interpolate(sl.project(spawnpoint)); yaw = 0.0

metadata = {'version': '0.1', 'source': 'OpenStreetMap contributors (Overpass, 2026-09-12)',
            'license': 'ODbL-1.0', 'bboxWGS84': BBOX, 'originWGS84': ORIGIN,
            'horizontalScale': SCALE, 'verticalScale': SCALE,
            'coordinateSystem': 'local east/north; equirectangular at Guyuan latitude, metres 1:1',
            'roadTreatment': 'prototype roads flattened; one-way tags kept but driving unrestricted',
            'heightStatus': dict(est),
            'counts': {'roads': len(roads), 'buildings': len(buildings), 'green': len(green),
                       'water': len(water), 'landmarks': len(marks)},
            'extent': [round(v, 2) for v in land.bounds]}
city = {'meta': metadata, 'land': [poly(p) for p in landparts], 'coast': [],
        'roads': roads, 'buildings': buildings, 'green': green, 'water': water,
        'landmarks': marks,
        'spawn': {'x': round(sp.x, 2), 'z': round(sp.y, 2), 'yaw': yaw, 'road': roads[si]['name']}}
(OUT / 'city.json').write_text(json.dumps(city, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(OUT / 'metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(metadata, ensure_ascii=False, indent=2))
print('spawn', city['spawn'])
print('bytes', (OUT / 'city.json').stat().st_size)
