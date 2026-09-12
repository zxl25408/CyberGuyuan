"""Fetch Guyuan POIs from Amap Web API (user's own key from travel-planner)
and save WGS-84 converted, for naming procedural buildings.

Amap returns GCJ-02; OSM/game world is WGS-84. gcj2wgs() does the standard
inverse approximation (sub-metre accuracy). Volume is modest: ~8 categories x
2 pages, free personal-key tier.
"""
import json, math, sys, time
import urllib.parse, urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
KEY = json.loads((Path.home() / 'travel-planner/config.json').read_text(encoding='utf-8'))['amap_key']
OUT = ROOT / 'data/processed/guyuan_study/amap_pois.json'
OUT.parent.mkdir(parents=True, exist_ok=True)
CENTER = '106.273,36.020'  # GCJ-02-ish; the radius search tolerates the small offset

CATEGORIES = [
    ('住宅小区', '商务住宅;住宅区;住宅小区'),
    ('学校', '科教文化服务;学校'),
    ('医院', '医疗保健服务;综合医院'),
    ('商场', '购物服务;商场'),
    ('酒店', '住宿服务;宾馆酒店'),
    ('政府机关', '政府机构及社会团体'),
    ('银行', '金融保险服务;银行'),
    ('超市', '购物服务;超市'),
]

def gcj2wgs(lng, lat):
    """Standard GCJ-02 -> WGS-84 inverse approximation."""
    def transform(lng, lat):
        a = 6378245.0; ee = 0.00669342162296594323
        dlat = -100.0 + 2.0 * lng + 3.0 * lat + .2 * lat * lat + .1 * lng * lat + .2 * math.sqrt(abs(lng))
        dlat += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
        dlat += (20.0 * math.sin(lat * math.pi) + 40.0 * math.sin(lat / 3.0 * math.pi)) * 2.0 / 3.0
        dlat += (160.0 * math.sin(lat / 12.0 * math.pi) + 320 * math.sin(lat * math.pi / 30.0)) * 2.0 / 3.0
        dlng = 300.0 + lng + 2.0 * lat + .1 * lng * lng + .1 * lng * lat + .1 * math.sqrt(abs(lng))
        dlng += (20.0 * math.sin(6.0 * lng * math.pi) + 20.0 * math.sin(2.0 * lng * math.pi)) * 2.0 / 3.0
        dlng += (20.0 * math.sin(lng * math.pi) + 40.0 * math.sin(lng / 3.0 * math.pi)) * 2.0 / 3.0
        dlng += (150.0 * math.sin(lng / 12.0 * math.pi) + 300.0 * math.sin(lng / 30.0 * math.pi)) * 2.0 / 3.0
        radlat = lat / 180.0 * math.pi; magic = math.sin(radlat)
        magic = 1 - ee * magic * magic; sqrtmagic = math.sqrt(magic)
        return lng + (dlng * 180.0) / (a / sqrtmagic * math.cos(radlat) * math.pi), \
               lat + (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * math.pi)
    lng0, lat0 = transform(lng, lat)
    lng1, lat1 = transform(lng + (lng - lng0), lat + (lat - lat0))
    return lng - (lng1 - lng) + (lng - lng0) if False else lng + (lng - lng1), lat + (lat - lat1)

pois = []
for label, types in CATEGORIES:
    for page in (1, 2):
        params = urllib.parse.urlencode({'key': KEY, 'keywords': label, 'types': types,
            'city': '固原市', 'citylimit': 'true', 'offset': 25, 'page': page,
            'location': CENTER, 'radius': 8000, 'sortrule': 'distance'})
        try:
            url = f'https://restapi.amap.com/v3/place/around?{params}'
            d = json.loads(urllib.request.urlopen(url, timeout=15).read())
        except Exception as e:
            print(f'{label} p{page}: FAIL {e}'); time.sleep(1); continue
        if d.get('status') != '1':
            print(f'{label} p{page}: API {d.get("info")}'); time.sleep(1); continue
        got = 0
        for p in d.get('pois', []):
            try:
                lng, lat = map(float, p['location'].split(','))
            except Exception: continue
            wlng, wlat = gcj2wgs(lng, lat)
            pois.append({'name': p['name'], 'type': p.get('type', ''), 'cat': label,
                         'wgs84': [round(wlng, 6), round(wlat, 6)]})
            got += 1
        print(f'{label} p{page}: {got}')
        time.sleep(.45)
OUT.write_text(json.dumps(pois, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('total', len(pois), '->', OUT.name)
