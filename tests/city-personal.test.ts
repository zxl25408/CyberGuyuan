import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SimulationClock} from '../src/city-clock.ts';
import {CITY_REGION,assertRegionCatalog} from '../src/city-region.ts';
import {freshPersonal,readPersonal} from '../src/city-personal-state.ts';
import {CareerGame} from '../src/city-career.ts';

test('simulation time agrees at 10 and 60 fps, with bounded catchup',()=>{
 const run=(fps:number)=>{const clock=new SimulationClock();let total=0;for(let i=0;i<fps;i++)clock.advance(1/fps,dt=>total+=dt);return total;};
 assert.ok(Math.abs(run(10)-1)<1e-6);assert.ok(Math.abs(run(60)-1)<1e-6);
 const c=new SimulationClock();assert.equal(c.advance(10,()=>{}),15);c.reset();assert.equal(c.advance(0,()=>{}),0);
});
test('catalog, map and tour agree on the Guyuan region',()=>{
 const cat=JSON.parse(fs.readFileSync(new URL('../data/map-places.json',import.meta.url),'utf8'));
 const city=JSON.parse(fs.readFileSync(new URL('../public/city/city.json',import.meta.url),'utf8'));
 const tour=JSON.parse(fs.readFileSync(new URL('../data/guyuan-tour.json',import.meta.url),'utf8'));
 assertRegionCatalog(cat);assert.deepEqual(city.meta.originWGS84,CITY_REGION.origin);assert.equal(tour.region,CITY_REGION.id);
 for(const s of tour.stops)assert.ok(city.landmarks.some((m:{id:string})=>m.id===s.id));
 assert.throws(()=>assertRegionCatalog({...cat,region:'shenzhen'}));
});
test('map migration discards unsafe position but retains independent notes',()=>{
 const s=freshPersonal();s.places=[{id:'park',name:'公园',x:0,z:0,note:'我的记忆'}];s.route=['park'];
 s.checkpoint={revision:'old-map',x:0,z:0,yaw:0,distance:100,light:'day',savedAt:''};
 const read=readPersonal(s);assert.equal(read.checkpoint,null);assert.equal(read.places[0].note,'我的记忆');assert.deepEqual(read.route,['park']);
});
test('personal import rejects nonfinite and foreign-city data and unsafe images',()=>{
 const s=freshPersonal();s.places=[{id:'bad',name:'坏数据',x:Infinity,z:0,note:''},{id:'safe',name:'安全',x:0,z:0,note:'',photo:'javascript:alert(1)'}];
 const read=readPersonal(s);assert.equal(read.places.length,1);assert.equal(read.places[0].photo,undefined);assert.equal(readPersonal({...s,region:'other'}).places.length,0);
});
test('active career checkpoint resumes once at the matching wallet and nearby position',()=>{
 const places={hub:[0,0],bay:[100,0],office:[200,0],park:[300,0],workshop:[400,0]} as const;
 const a=new CareerGame(structuredClone(places) as never);const frame={dt:0,position:[0,0] as [number,number],speed:0,odometer:0,debugEpoch:0};
 a.accept('hot-meal',frame);const checkpoint=a.checkpoint();const b=new CareerGame(structuredClone(places) as never,a.save);
 assert.equal(b.restoreCheckpoint(checkpoint,{...frame,debugEpoch:10}),true);assert.equal(b.active?.jobId,'hot-meal');
 assert.equal(b.restoreCheckpoint(checkpoint,{...frame,position:[1000,0]}),false);
 const changed={...checkpoint,save:{...a.save,cash:999}};assert.equal(b.restoreCheckpoint(changed,frame),false);
});
