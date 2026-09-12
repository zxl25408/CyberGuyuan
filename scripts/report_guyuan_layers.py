"""Quick sanity report over fetched guyuan_study layers: extents, center,
lon projection factor, main road names. Encoding-safe on GBK consoles."""
import json, math, sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
HERE = Path(__file__).resolve().parents[1] / 'data/processed/guyuan_study'

def flat(g):
    """Yield (lon, lat) pairs from any overpass geom shape."""
    if isinstance(g, dict):
        if 'lat' in g and 'lon' in g:
            yield g['lon'], g['lat']
            return
        t = g.get('type')
        cs = g.get('coordinates', [])
        if t == 'Point':
            yield cs[0], cs[1]
        elif t in ('LineString', 'MultiPoint'):
            for c in cs: yield c[0], c[1]
        elif t in ('Polygon', 'MultiLineString'):
            for ring in cs:
                for c in (ring if isinstance(ring[0], (int, float)) else ring):
                    yield c[0], c[1]
        elif t == 'MultiPolygon':
            for poly in cs:
                for ring in poly:
                    for c in ring: yield c[0], c[1]
        elif t == 'GeometryCollection':
            for sub in g.get('geometries', []):
                yield from flat(sub)

for layer in ['roads', 'buildings', 'green', 'water', 'railways', 'pois']:
    path = HERE / f'{layer}.geojson'
    if not path.exists(): continue
    d = json.loads(path.read_text(encoding='utf-8'))
    pts = [p for f in d['features'] if 'geometry' in f for p in flat(f['geometry'])]
    if not pts:
        print(f'{layer}: EMPTY'); continue
    lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
    print(f"{layer}: {len(d['features'])} feats, {len(pts)} pts, "
          f"lon {min(lons):.4f}..{max(lons):.4f}, lat {min(lats):.4f}..{max(lats):.4f}")

d = json.loads((HERE / 'roads.geojson').read_text(encoding='utf-8'))
pts = [p for f in d['features'] for p in flat(f['geometry'])]
lons = [p[0] for p in pts]; lats = [p[1] for p in pts]
cx = (min(lons) + max(lons)) / 2; cy = (min(lats) + max(lats)) / 2
print(f'\ncenter: [{round(cx, 4)}, {round(cy, 4)}]')
print(f'lon_factor (111320*cos(lat)): {round(111320 * math.cos(math.radians(cy)), 1)}')
named = {}
for f in d['features']:
    n = f['properties'].get('name', '')
    k = f['properties']['tags'].get('highway')
    if n and k in ('primary', 'secondary', 'trunk'):
        named[n] = named.get(n, 0) + 1
print('main roads:', sorted(named.items(), key=lambda x: -x[1])[:15])
