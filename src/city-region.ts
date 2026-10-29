/** Runtime coordinates must match public/city/metadata.json and the POI catalog. */
export const CITY_REGION = {
  id: 'guyuan', name: '固原', revision: 'guyuan-2026-09-12-v1',
  origin: [106.273, 36.020] as const, factors: [89990, 111320] as const,
  extent: [-6569.27, -4452.8, 7829.13, 4452.8] as const,
  features: {coastal: false, bambooCafe: false},
};
export function inCity(x:number,z:number):boolean {
  const [a,b,c,d]=CITY_REGION.extent;
  return Number.isFinite(x)&&Number.isFinite(z)&&x>=a&&x<=c&&z>=b&&z<=d;
}
export function assertRegionCatalog(value:unknown):asserts value is {schemaVersion:2;region:string;coordinateRevision:string;places:unknown[]} {
  const v=value as Record<string,unknown>|null;
  if(!v||v.schemaVersion!==2||v.region!==CITY_REGION.id||v.coordinateRevision!==CITY_REGION.revision||!Array.isArray(v.places))throw Error('地点目录与当前城市坐标版本不匹配');
}
