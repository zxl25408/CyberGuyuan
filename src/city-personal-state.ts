import {CITY_REGION,inCity} from './city-region.ts';
export type Quality='low'|'balanced'|'high';
export type CameraBookmark={x:number;y:number;z:number;yaw:number;pitch:number;distance:number};
export type PersonalPlace={id:string;name:string;x:number;z:number;note:string;photo?:string;camera?:CameraBookmark};
export type Checkpoint={revision:string;x:number;z:number;yaw:number;distance:number;light:'day'|'night'|'sunset';savedAt:string;career?:unknown};
export type PersonalState={version:1;region:string;quality:Quality;places:PersonalPlace[];route:string[];routeIndex:number;checkpoint:Checkpoint|null};
export const PERSONAL_KEY='cyberguyuan-personal-v1';
export function freshPersonal():PersonalState{return {version:1,region:CITY_REGION.id,quality:'balanced',places:[],route:[],routeIndex:0,checkpoint:null};}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,n:number)=>typeof v==='string'?v.slice(0,n):'';
export function readPersonal(value:unknown):PersonalState {
  const fresh=freshPersonal();
  if(!record(value)||value.version!==1||value.region!==CITY_REGION.id)return fresh;
  const places:PersonalPlace[]=[];
  for(const v of (Array.isArray(value.places)?value.places:[]).slice(0,100)){
    if(!record(v)||typeof v.x!=='number'||typeof v.z!=='number'||!inCity(v.x,v.z)||!text(v.id,120)||places.some(p=>p.id===v.id))continue;
    const place:PersonalPlace={id:text(v.id,120),name:text(v.name,120)||'我的地点',x:v.x,z:v.z,note:text(v.note,4000)};
    if(typeof v.photo==='string'&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(v.photo)&&v.photo.length<700000)place.photo=v.photo;
    if(record(v.camera)&&['x','y','z','yaw','pitch','distance'].every(k=>typeof (v.camera as Record<string,unknown>)[k]==='number'&&Number.isFinite((v.camera as Record<string,number>)[k]))){
      const c=v.camera as CameraBookmark;if(inCity(c.x,c.z)&&c.y>=-10&&c.y<=2200&&c.distance>=3&&c.distance<=3200&&Math.abs(c.pitch)<=1.43)place.camera={...c};
    }
    places.push(place);
  }
  const ids=new Set(places.map(p=>p.id)),route=Array.isArray(value.route)?value.route.filter((id):id is string=>typeof id==='string'&&ids.has(id)).slice(0,30):[];
  const c=value.checkpoint;let checkpoint:Checkpoint|null=null;
  if(record(c)&&c.revision===CITY_REGION.revision&&typeof c.x==='number'&&typeof c.z==='number'&&inCity(c.x,c.z)&&typeof c.yaw==='number'&&Number.isFinite(c.yaw)&&typeof c.distance==='number'&&Number.isFinite(c.distance)&&c.distance>=0&&['day','night','sunset'].includes(String(c.light))){checkpoint={revision:CITY_REGION.revision,x:c.x,z:c.z,yaw:c.yaw,distance:Math.min(1e9,c.distance),light:c.light as Checkpoint['light'],savedAt:text(c.savedAt,40),career:c.career};}
  return {version:1,region:CITY_REGION.id,quality:['low','balanced','high'].includes(String(value.quality))?value.quality as Quality:'balanced',places,route,routeIndex:Math.max(0,Math.min(route.length-1,Number.isInteger(value.routeIndex)?value.routeIndex as number:0)),checkpoint};
}
