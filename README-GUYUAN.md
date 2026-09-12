# CyberGuyuan · 固原市原州区城市复现

基于 [GTA_SZ](https://github.com/linranff/GTA_SZ)（深城纪 · Open Roads）引擎魔改的
宁夏固原市原州区市区 1:1 浏览器复现。

## 快速开始

```bash
npm ci
npx playwright install msedge 2>/dev/null || true   # 有 Edge 即可
npm run dev                                          # http://localhost:5173
```

## 数据管线（全部可一键重建）

```bash
npm run city:fetch     # Overpass API 拉取 OSM 7 层数据（路网/建筑/绿地/水系/铁路/POI）
npm run city:pois      # 高德 Web API 拉取真实 POI（key 在 ~/travel-planner/config.json）
npm run city:rebuild   # = prepare + infill + glb：city.json → 程序化补楼 → GLB 资产
npm run city:smoke     # Playwright 无头浏览器冒烟测试（截图到 artifacts/guyuan/）
```

| 脚本 | 作用 |
|---|---|
| `scripts/fetch_guyuan_overpass.py` | Overpass API 抓取 BBOX `[106.20,35.98,106.36,36.06]` |
| `scripts/amap_pois.py` | 高德 POI 检索（GCJ-02→WGS-84 纠偏） |
| `scripts/prepare_guyuan_city.py` | 生成 `public/city/city.json`（原点 106.273,36.020，1:1 米制） |
| `scripts/infill_buildings.py` | OSM 楼稀疏时沿街程序化补楼（街向对齐 + 高德拉名） |
| `scripts/build_city_glb.mjs` | 纯 Node 手写 glTF 2.0 导出（Blender 免依赖），按 640m 网格合并命名 `block_<gx>_<gz>_<style>` 以接入引擎原生剔除 |
| `scripts/guyuan-smoke.mjs` | 无头 Edge 冒烟：加载→障碍统计→截图 |

## 相对原版的主要改动

- `src/city-map-geometry.ts`：坐标投影改为固原原点，经度因子 89990（=111320·cos36.02°）
- `src/main.ts`：载具行程/地标全部换成固原（市政府、西湖公园、人民医院、人民公园等）
- 深圳专属地形系统（海岸线、山体、精细立面流式）以合法空 stub 保持引擎兼容
- `vite.config.ts`：dev 服务器加 `Cache-Control: no-store`（资产热重建后防陈旧缓存）

## 已知边界

- 建筑高度为分层估算（中心 16~36m，外圈递减），待真实分区数据校准
- OSM 缺失的大楼（固原博物馆、古雁塔等）以地标占位，精修走 `landmark-detail` 管线
- 街景照片无法提取 3D 几何，不作为数据源
