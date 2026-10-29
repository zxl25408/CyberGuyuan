# 固原漫游：项目事实与资产入口

当前场景为固原 Babylon.js 城市，入口 `src/main.ts` / `src/city-world.ts`。

- 当前坐标原点 `[106.273,36.020]`，经纬差分别乘 `89990`、`111320`，单位为米，水平比例1:1。权威运行区域声明为 `src/city-region.ts`，来源元数据位于 `public/city/metadata.json`。
- `public/city/city.json` 为当前基础城市。道路/建筑源于仓库记录的 OSM 数据；楼高与不少模型细节是原型估计，不能称为实测或完整实景复原。
- `data/map-places.json` 必须符合当前区域与坐标版本。当前目录来自基础地图的11个地标。`data/guyuan-tour.json` 为四站导览。
- 地点导航停靠点可以与地标中心不同；不是实测入口。构建道路资产后运行 `npm run city:navigation`，按源道路交点与高度层生成路网，不得凭空添加穿越建筑/水域的连接。
- 旧深圳建模资料和模块仍保留在仓库。`landmark-detail.json`、深圳海岸、莲花山等资产不能自动当作当前固原输入。相应测试明确标记旧数据依赖，算法纯测试保留。
- Blender 的 `scripts/city_mesh.py` 导入会初始化场景，普通数据检查不要导入它。真正的实景对象建模与验收可参考 `skills/landmark-reconstruction/SKILL.md`；不能把照片估计、OSM 标签或插值地形当作实测。
- 验证入口：`npm test`、`npm run build`、`npm run city:smoke`。截图与性能数据必须对应当前资产，不得只凭构建成功宣称外观或性能通过。

个人笔记、收藏、照片、路线与位置在浏览器中保存，不能提交到仓库。运行和恢复说明见 `UPGRADE.md`。
