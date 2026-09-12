"""Procedural building infill for Guyuan v2: street-aligned rows (Chinese
street-front typology), heights calibrated for a loess-plateau prefecture
city (6-floor walk-ups common, high-rises in the new districts), names from
Amap POIs. Idempotent: previous 'proc/' buildings are replaced on rerun.
"""
import json, math, random, sys
from pathlib import Path
from shapely.geometry import shape, Point, Polygon, LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.prepared import prep

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
ORIGIN = [106.273, 36.020]; LON_FACTOR = 89990.0
proj = lambda lon, lat: ((lon - ORIGIN[0]) * LON_FACTOR, (lat - ORIGIN[1]) * 111320)

city = json.loads((ROOT / 'public/city/city.json').read_text(encoding='utf-8'))
city['buildings'] = [b for b in city['buildings'] if not str(b.get('id', '')).startswith('proc/')]
pois = json.loads((ROOT / 'data/processed/guyuan_study/amap_pois.json').read_text(encoding='utf-8'))
rnd = random.Random(20260912)

# --- masks ---------------------------------------------------------------
road_geoms, green, water, existing = [], [], [], []
for r in city['roads']:
    line = LineString(r['points'])
    road_geoms.append(line.buffer(r['width'] / 2 + 2.6))
for g in city['green']:
    green.append(shape({'type': 'Polygon', 'coordinates': g['rings']}))
for w in city['water']:
    water.append(shape({'type': 'Polygon', 'coordinates': w['rings']}))
for b in city['buildings']:
    existing.append(shape({'type': 'Polygon', 'coordinates': b['rings']}))
for m in city['landmarks']:
    if m.get('excludeRadius', 0) > 0:
        existing.append(Point(m['x'], m['z']).buffer(m['excludeRadius']))

road_lines = [LineString(r['points']) for r in city['roads']]
road_widths = [r['width'] for r in city['roads']]
tree = STRtree(road_lines)
excl = prep(unary_union(road_geoms + green + water + existing))
band = prep(unary_union([line.buffer(w / 2 + 110) for line, w in zip(road_lines, road_widths)]))

# --- POIs in projected space --------------------------------------------
poi_pts = [(proj(*p['wgs84'])[0], proj(*p['wgs84'])[1], p['name'], p['cat']) for p in pois]
COMMERCE = {'商场', '银行', '酒店', '超市'}
def nearest_poi(x, z):
    best, bd = None, 240.0
    for px, pz, name, cat in poi_pts:
        d = math.hypot(px - x, pz - z)
        if d < bd: best, bd = (name, cat), d
    return best

def road_yaw(x, z):
    """Bearing of the nearest road segment — buildings front the street."""
    i = int(tree.nearest(Point(x, z))); line = road_lines[i]
    a = list(line.coords)
    # segment containing projection
    best, bd = (0.0, 1.0), 1e18
    for k in range(len(a) - 1):
        ax, az = a[k]; bx, bz = a[k + 1]
        dx, dz = bx - ax, bz - az; L2 = dx * dx + dz * dz or 1e-9
        t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / L2))
        px, pz = ax + dx * t, az + dz * t
        dd = math.hypot(x - px, z - pz)
        if dd < bd: bd, best = dd, (ax, az, bx, bz)
    ax, az, bx, bz = best
    return math.atan2(bx - ax, bz - az)

# --- candidate grid over the built-up envelope ---------------------------
xs = [p[0] for b in city['buildings'] for ring in b['rings'][:1] for p in ring]
zs = [p[1] for b in city['buildings'] for ring in b['rings'][:1] for p in ring]
x0, x1 = min(xs) - 700, max(xs) + 700
z0, z1 = min(zs) - 700, max(zs) + 700

TARGET = 6200; SPACING = 34.0
cells = []
gx = x0
while gx <= x1:
    gz = z0
    while gz <= z1:
        cells.append((gx + rnd.uniform(-6, 6), gz + rnd.uniform(-6, 6)))
        gz += SPACING
    gx += SPACING
rnd.shuffle(cells)

made = []
for cx, cz in cells:
    if len(made) >= TARGET: break
    if not band.contains(Point(cx, cz)): continue
    yaw = road_yaw(cx, cz)
    w = rnd.uniform(14, 26); d = rnd.uniform(10, 16)
    ca, sa = math.cos(yaw), math.sin(yaw)
    hw, hd = w / 2, d / 2
    corners = []
    for lx, lz in [(-hw, -hd), (hw, -hd), (hw, hd), (-hw, hd), (-hw, -hd)]:
        corners.append([round(cx + lx * ca - lz * sa, 2), round(cz + lx * sa + lz * ca, 2)])
    foot = Polygon(corners)
    if not excl.disjoint(foot): continue
    dist = math.hypot(cx, cz)
    if dist < 1200:   hs = [16, 18, 22, 26, 30, 36]
    elif dist < 2800: hs = [13, 16, 19, 22, 26]
    elif dist < 4500: hs = [9, 12, 15, 18, 21]
    else:             hs = [6, 8, 10, 12]
    h = rnd.choice(hs) * (1.35 if rnd.random() < .15 else 1.0)
    poi = nearest_poi(cx, cz)
    if poi and poi[1] in COMMERCE: style = 'office'
    else: style = 'office' if rnd.random() < .15 else 'residential'
    made.append({'id': f'proc/{len(made)+1}', 'name': poi[0] if poi else '',
                 'rings': [corners], 'height': round(h, 1),
                 'heightSource': 'infill_estimate', 'style': style,
                 'seed': rnd.randint(1, 1 << 30)})

city['buildings'].extend(made)
est = city['meta'].setdefault('heightStatus', {})
est['infill_estimate'] = est.get('infill_estimate', 0) + len(made)
city['meta']['counts']['buildings'] = len(city['buildings'])
(ROOT / 'public/city/city.json').write_text(
    json.dumps(city, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'infill {len(made)} buildings -> total {len(city["buildings"])}')
print('named after real POIs:', sum(1 for b in made if b['name']))
