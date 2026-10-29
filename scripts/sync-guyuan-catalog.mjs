import fs from 'node:fs/promises';
const city=JSON.parse(await fs.readFile(new URL('../public/city/city.json',import.meta.url),'utf8'));
if(city.meta.originWGS84?.[0]!==106.273||city.meta.horizontalScale!==1)throw Error('Not the Guyuan source map');
const catalog={schemaVersion:2,region:'guyuan',coordinateRevision:'guyuan-2026-09-12-v1',license:'ODbL-1.0',sourceSnapshot:'public/city/city.json',
  scope:'Current Guyuan landmarks from the committed OSM-derived map. Label centroids are not entrances. Building heights and shapes remain prototype estimates.',
  places:city.landmarks.map(p=>({id:'guyuan:'+p.id,name:p.name,category:p.height===0?'park':'landmark',kind:'landmark',lon:p.lon,lat:p.lat,x:Number(((p.lon-106.273)*89990).toFixed(5)),z:Number(((p.lat-36.020)*111320).toFixed(5)),source:{provider:'Committed OSM-derived Guyuan map',id:p.id,file:'public/city/city.json',coordinateMethod:'source_landmark_centroid; not a surveyed entrance'}}))};
await fs.writeFile(new URL('../data/map-places.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');
console.log(`Guyuan catalog: ${catalog.places.length} source landmarks`);
