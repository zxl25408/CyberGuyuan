import './city-personal.css';
import {CITY_REGION} from './city-region.ts';
import {PERSONAL_KEY,readPersonal,type PersonalPlace,type Quality} from './city-personal-state.ts';
import type {DrivingWorld} from './city-world.ts';
import type {Landmark,V2} from './city-types.ts';
import type {RoadGraph} from './navigation.ts';
import type {CareerGame} from './city-career.ts';
type Options={world:DrivingWorld;graph:RoadGraph;career:CareerGame;selected:()=>Landmark|null;visited:Set<string>;navigate:(m:Landmark,r:V2[])=>void;openMap:(m:Landmark)=>void;closeMenus:()=>void;toast:(s:string)=>void};
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function createPersonalCity(o:Options){
 const {world,graph}=o;
 let state=readPersonal(null),stored:string|null=null;
 try{stored=localStorage.getItem(PERSONAL_KEY);state=readPersonal(JSON.parse(stored??'null'));}catch{o.toast('个人存档无法读取，可以导入备份恢复');}
 let awaitingResume=!!state.checkpoint,open=false,previousPause=false,playing=false,photo:string|undefined;
 const host=document.createElement('div');host.id='personal-city';
 host.innerHTML=`<button id="personal-open">我的固原 <kbd>N</kbd></button><section id="personal-panel" hidden role="dialog" aria-modal="true" aria-labelledby="personal-title"><header><div><small>GUYUAN / MY PLACES</small><h2 id="personal-title">留住熟悉的街道</h2></div><button data-close>返回城市</button></header><div class="personal-content"><p>当前地图：固原 · OSM 道路与原型建筑。楼高、入口和模型细节仍需实景核实。</p><div class="personal-resume" hidden><p>有上次的游玩位置。恢复时会将车辆安全停在附近道路；飞行和瞬时速度不会恢复。</p><button data-resume>继续上次游玩</button><button data-fresh>从本次位置开始</button></div><div class="personal-row"><label>画质<select id="personal-quality"><option value="low">流畅</option><option value="balanced">均衡</option><option value="high">精细</option></select></label><button data-save>保存当前位置</button><button data-export>导出个人备份</button><label>导入备份<input id="personal-import" type="file" accept=".json"></label></div><h3>固原初体验</h3><p>古雁公园 → 人民公园 → 中心公园 → 西湖公园。沿途可开车、步行或俯瞰，每站说明保存在路线笔记中。</p><button data-tour>载入四站导览</button><h3>收藏与笔记</h3><p>在城市地图中选好地点，或站在想记住的位置，再点收藏。个人内容只保存在当前浏览器，建议导出备份。</p><button data-capture>收藏选中地点 / 当前所在</button><div id="personal-places"></div><h3>我的路线</h3><p>用收藏旁的“加入路线”编排站点；每次导航只前往一站，抵达后再继续。</p><ol id="personal-route"></ol><div class="personal-row"><button data-route-start>导航下一站</button><button data-route-play>逐站观景</button><button data-route-stop>停止观景</button></div><p id="personal-status" role="status"></p></div></section><div class="touch-driving" aria-label="触摸驾驶"><button data-key="KeyA" aria-label="左转">←</button><button data-key="KeyW">前进</button><button data-key="KeyS">刹车</button><button data-key="KeyD" aria-label="右转">→</button><button data-walk>上下车</button></div>`;
 document.body.append(host);
 const panel=host.querySelector<HTMLElement>('#personal-panel')!,list=host.querySelector<HTMLElement>('#personal-places')!,routeList=host.querySelector<HTMLElement>('#personal-route')!,status=host.querySelector<HTMLElement>('#personal-status')!;
 function say(s:string){status.textContent=s;o.toast(s);}
 function persist(){try{localStorage.setItem(PERSONAL_KEY,JSON.stringify(state));return true;}catch{say('浏览器存储空间不足或不可用，请导出个人备份');return false;}}
 function toggle(value:boolean){if(value===open)return;open=value;panel.hidden=!open;if(open){o.closeMenus();previousPause=world.paused;world.paused=true;world.keys.clear();render();panel.querySelector<HTMLButtonElement>('[data-close]')!.focus();}else{world.paused=previousPause;world.canvas.focus();}}
 function destination(p:PersonalPlace):Landmark|null{const known=world.data.landmarks.find(m=>m.id===p.id);if(known)return known;const road=world.collision.nearest(p.x,p.z);if(!road||road.d>600){say('附近没有可用道路，请换一个地点');return null;}return {id:p.id,name:p.name,x:p.x,z:p.z,arrival:[road.x,road.z],yaw:road.yaw,height:0,area:'我的固原',excludeRadius:0};}
 function capture(mark?:Landmark,note=''){
  const m=mark??o.selected(),a=world.actor,id=m?.id??'personal:'+Date.now(),observer=world.observer.status;
  const place:PersonalPlace={id,name:m?.name??'我的地点',x:m?.x??a.x,z:m?.z??a.z,note};
  if(observer.active)place.camera={x:observer.focus.x,y:observer.focus.y,z:observer.focus.z,yaw:observer.yaw,pitch:observer.pitch,distance:observer.distance};
  const old=state.places.find(p=>p.id===id);
  if(old){if(note)old.note=note;if(place.camera)old.camera=place.camera;}else if(state.places.length<100)state.places.push(place);else say('最多保存100个地点，请先导出或整理');
  persist();render();return place.id;
 }
 function snapshot(){if(awaitingResume)return;const a=world.actor;state.checkpoint={revision:CITY_REGION.revision,x:a.x,z:a.z,yaw:a.yaw,distance:world.state.distance,light:world.lightMode,savedAt:new Date().toISOString(),career:world.walk?.active?undefined:o.career.checkpoint()};persist();}
 function resume(){const c=state.checkpoint;if(!c)return;const road=world.collision.nearest(c.x,c.z);if(!road||road.d>150){say('旧位置附近道路已变化，请从当前道路开始；收藏仍保留');return;}world.travel({id:'resume',name:'上次位置',x:road.x,z:road.z,arrival:[road.x,road.z],yaw:c.yaw,height:0,area:'固原',excludeRadius:0});world.state.distance=c.distance;world.setLightMode(c.light);awaitingResume=false;const restored=c.career&&o.career.restoreCheckpoint(c.career,{dt:0,position:[road.x,road.z],speed:0,odometer:c.distance,debugEpoch:world.debugEpoch,yaw:c.yaw});say(restored?'已恢复位置与进行中的合约':'已恢复游玩位置，已有资金与人物关系继续保留');render();toggle(false);}
 function render(){
  host.querySelector<HTMLElement>('.personal-resume')!.hidden=!awaitingResume;
  (host.querySelector('#personal-quality') as HTMLSelectElement).value=state.quality;
  list.innerHTML=state.places.map(p=>`<article data-place="${esc(p.id)}"><h4>${esc(p.name)}</h4>${p.photo?`<img src="${p.photo}" alt="${esc(p.name)}的个人照片">`:''}<label>地点笔记<textarea data-note="${esc(p.id)}" maxlength="4000">${esc(p.note)}</textarea></label><div class="personal-row"><button data-map="${esc(p.id)}">地图</button><button data-view="${esc(p.id)}">观景</button><button data-add-route="${esc(p.id)}">加入路线</button><button data-delete="${esc(p.id)}">删除</button><label>添加照片<input data-photo="${esc(p.id)}" type="file" accept="image/jpeg,image/png,image/webp"></label></div></article>`).join('')||'<p>这里还没有收藏。</p>';
  routeList.innerHTML=state.route.map((id,i)=>`<li>${i===state.routeIndex?'→ ':''}${esc(state.places.find(p=>p.id===id)?.name)} <button data-route-up="${i}">↑</button><button data-route-remove="${i}">移除</button></li>`).join('');
 }
 function view(p:PersonalPlace){const m=destination(p);if(!m)return;toggle(false);world.enterPhoto(m);if(p.camera){world.observer.begin({x:p.camera.x,y:p.camera.y,z:p.camera.z},p.camera.distance,-p.camera.yaw,p.camera.pitch);}}
 function next(){if(!state.route.length){say('先将收藏加入路线');return;}const p=state.places.find(p=>p.id===state.route[state.routeIndex]);if(!p)return;const m=destination(p);if(!m)return;const route=graph.route([world.state.x,world.state.z],m.arrival);if(!route.length){say('当前道路无法连通，请在地图中选择附近道路');return;}o.navigate(m,route);toggle(false);if(world.walk?.active){say('步行模式：按地图路线前往，或上车后使用自动驾驶');}else world.startAutoDrive(m);state.routeIndex=(state.routeIndex+1)%state.route.length;persist();}
 async function tour(){const r=await fetch(new URL('../data/guyuan-tour.json',import.meta.url));if(!r.ok)throw Error('导览清单未能载入');const t=await r.json() as {region:string;stops:{id:string;note:string}[]};if(t.region!==CITY_REGION.id)throw Error('导览城市不匹配');const marks=t.stops.map(s=>({mark:world.data.landmarks.find(m=>m.id===s.id),note:s.note}));if(marks.some(s=>!s.mark))throw Error('导览站点缺失，请检查地图版本');state.route=marks.map(s=>capture(s.mark!,s.note));state.routeIndex=0;persist();render();say('四站导览已载入，点击导航下一站开始');}
 function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='我的固原-个人备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 host.addEventListener('click',e=>{
  const b=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
  const id=b.dataset.map??b.dataset.view??b.dataset.addRoute??b.dataset.delete,p=state.places.find(p=>p.id===id);
  if(b.id==='personal-open')toggle(!open);
  if(b.hasAttribute('data-close'))toggle(false);
  if(b.hasAttribute('data-capture'))capture();
  if(b.hasAttribute('data-save')){awaitingResume=false;snapshot();say('当前位置已保存');render();}
  if(b.hasAttribute('data-resume'))resume();
  if(b.hasAttribute('data-fresh')){awaitingResume=false;snapshot();render();}
  if(b.hasAttribute('data-export'))exportData();
  if(b.hasAttribute('data-tour'))void tour().catch(e=>say(String(e)));
  if(p&&b.dataset.map){const m=destination(p);if(m){toggle(false);o.openMap(m);}}
  if(p&&b.dataset.view)view(p);
  if(p&&b.dataset.addRoute){if(state.route.length<30)state.route.push(p.id);persist();render();}
  if(p&&b.dataset.delete){state.places=state.places.filter(x=>x!==p);state.route=state.route.filter(id=>id!==p.id);state.routeIndex=0;persist();render();}
  if(b.dataset.routeUp!==undefined){const i=Number(b.dataset.routeUp);if(i>0)[state.route[i-1],state.route[i]]=[state.route[i],state.route[i-1]];persist();render();}
  if(b.dataset.routeRemove!==undefined){state.route.splice(Number(b.dataset.routeRemove),1);state.routeIndex=0;persist();render();}
  if(b.hasAttribute('data-route-start'))next();
  if(b.hasAttribute('data-route-play')){playing=true;state.routeIndex=0;say('观景模式：每8秒切换一站，随时停止');}
  if(b.hasAttribute('data-route-stop')){playing=false;world.exitPhoto();say('观景已停止');}
  if(b.hasAttribute('data-walk'))void world.toggleWalking();
 });
 host.addEventListener('input',e=>{const el=e.target as HTMLTextAreaElement;if(el.dataset.note){const p=state.places.find(p=>p.id===el.dataset.note);if(p){p.note=el.value;persist();}}});
 host.addEventListener('change',e=>{void(async()=>{
  const el=e.target as HTMLInputElement;
  if(el.id==='personal-quality'){state.quality=el.value as Quality;world.applyQuality(state.quality);persist();}
  if(el.id==='personal-import'&&el.files?.[0]){const f=el.files[0];if(f.size>5e6)throw Error('备份超过5MB');const raw=JSON.parse(await f.text());if(raw.version!==1||raw.region!==CITY_REGION.id)throw Error('请选择固原个人备份');const imported=readPersonal(raw);if(!confirm('用备份替换当前收藏、路线和游玩位置？建议先导出当前备份。'))return;state=imported;awaitingResume=!!state.checkpoint;world.applyQuality(state.quality);persist();render();}
  if(el.dataset.photo&&el.files?.[0]){const f=el.files[0];if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>5e6)throw Error('请选择5MB以内的 JPG/PNG/WebP 照片');const bitmap=await createImageBitmap(f);const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();photo=canvas.toDataURL('image/jpeg',.7);if(photo.length>650000)throw Error('照片压缩后仍过大，请选更小的照片');const p=state.places.find(p=>p.id===el.dataset.photo);if(p){p.photo=photo;persist();render();}}
 })().catch(e=>say(String(e)));});
 const keydown=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select'))return;if(e.code==='KeyN'&&!e.repeat){e.preventDefault();toggle(!open);}if(open&&e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();toggle(false);}};
 window.addEventListener('keydown',keydown,true);
 for(const b of Array.from(host.querySelectorAll<HTMLButtonElement>('[data-key]'))){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);world.keys.add(b.dataset.key!);world.cancelAutoDrive('touch-controls');};const release=()=>{world.keys.delete(b.dataset.key!);};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;}
 const timer=window.setInterval(()=>{if(!open&&!document.hidden&&!world.observer.active&&!world.flight?.active&&!world.tank?.active)snapshot();},5000);
 const tourTimer=window.setInterval(()=>{if(!playing||document.hidden||!state.route.length)return;const p=state.places.find(p=>p.id===state.route[state.routeIndex]);if(p)view(p);state.routeIndex=(state.routeIndex+1)%state.route.length;persist();},8000);
 const leave=()=>snapshot();window.addEventListener('pagehide',leave);
 world.applyQuality(state.quality);render();
 if(awaitingResume)window.setTimeout(()=>{if(!open)toggle(true);},900);
 return {get state(){return state;},dispose(){clearInterval(timer);clearInterval(tourTimer);window.removeEventListener('keydown',keydown,true);window.removeEventListener('pagehide',leave);host.remove();}};
}
