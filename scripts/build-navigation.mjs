/** Node source road intersections; never invent a straight-line connector. */
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function buildNavigation(roads){
 const segments=[],cells=new Map(),seenPairs=new Set(),cellSize=250;
 for(const road of roads)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i];if(Math.hypot(b[0]-a[0],b[1]-a[1])<.01)continue;
  const index=segments.length,s={a,b,grade:String(road.grade||0),cuts:[0,1]};segments.push(s);
  for(let x=Math.floor(Math.min(a[0],b[0])/cellSize);x<=Math.floor(Math.max(a[0],b[0])/cellSize);x++)for(let z=Math.floor(Math.min(a[1],b[1])/cellSize);z<=Math.floor(Math.max(a[1],b[1])/cellSize);z++){const key=x+','+z,list=cells.get(key)||[];list.push(index);cells.set(key,list);}
 }
 const cross=(x,y)=>x[0]*y[1]-x[1]*y[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
 const project=(p,s)=>{const d=sub(s.b,s.a),n=d[0]*d[0]+d[1]*d[1],t=((p[0]-s.a[0])*d[0]+(p[1]-s.a[1])*d[1])/n;if(t>=0&&t<=1&&Math.abs(cross(sub(p,s.a),d))/Math.sqrt(n)<.001)s.cuts.push(t);};
 for(const list of cells.values())for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
  const ai=list[i],bi=list[j],key=Math.min(ai,bi)+':'+Math.max(ai,bi);if(seenPairs.has(key))continue;seenPairs.add(key);
  const a=segments[ai],b=segments[bi];if(a.grade!==b.grade)continue;
  const r=sub(a.b,a.a),s=sub(b.b,b.a),q=sub(b.a,a.a),den=cross(r,s);
  if(Math.abs(den)<1e-9){project(a.a,b);project(a.b,b);project(b.a,a);project(b.b,a);continue;}
  const t=cross(q,s)/den,u=cross(q,r)/den;
  if(t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9){a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));}
 }
 const nodes=[],edges=[],lookup=new Map(),edgeKeys=new Set();
 const node=(p,grade)=>{const rounded=p.map(n=>Math.round(n*100)/100),key=grade+':'+rounded.join(',');if(!lookup.has(key)){lookup.set(key,nodes.length);nodes.push(rounded);}return lookup.get(key);};
 for(const s of segments){const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);let previous;
  for(const t of cuts){const p=[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t],id=node(p,s.grade);if(previous!==undefined&&id!==previous){const key=Math.min(id,previous)+':'+Math.max(id,previous);if(!edgeKeys.has(key)){edges.push([previous,id]);edgeKeys.add(key);}}previous=id;}
 }
 return {schemaVersion:1,method:'source intersections by grade; centimetre rounding; no invented connectors',nodes,edges};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const city=JSON.parse(await fs.readFile('public/city/city.json','utf8')),graph=buildNavigation(city.roads);
 const parents=graph.nodes.map((_,i)=>i),find=i=>parents[i]===i?i:parents[i]=find(parents[i]);for(const [a,b] of graph.edges)parents[find(a)]=find(b);
 const project=(point,a,b)=>{const p=graph.nodes[a],q=graph.nodes[b],dx=q[0]-p[0],dz=q[1]-p[1],t=Math.max(0,Math.min(1,((point[0]-p[0])*dx+(point[1]-p[1])*dz)/(dx*dx+dz*dz)));const x=p[0]+dx*t,z=p[1]+dz*t;return {x,z,d:Math.hypot(x-point[0],z-point[1]),yaw:Math.atan2(dx,dz),a};};
 const nearest=(point,component)=>graph.edges.map(([a,b])=>project(point,a,b)).filter(p=>component===undefined||find(p.a)===component).sort((a,b)=>a.d-b.d)[0];
 const component=find(nearest([city.spawn.x,city.spawn.z]).a);
 for(const mark of city.landmarks){const current=nearest(mark.arrival);if(find(current.a)===component)continue;const connected=nearest(mark.arrival,component);if(!connected||connected.d>600)throw Error(`No connected road within 600m of ${mark.name}`);mark.arrival=[Number(connected.x.toFixed(2)),Number(connected.z.toFixed(2))];mark.yaw=connected.yaw;mark.arrivalNote=`Nearest connected source road; adjusted ${connected.d.toFixed(1)}m from former isolated-road arrival. Not a surveyed entrance.`;console.log('Connected arrival:',mark.id,connected.d.toFixed(1)+'m');}
 await fs.writeFile('public/city/navigation.json',JSON.stringify(graph)+'\n');
 await fs.writeFile('public/city/city.json',JSON.stringify(city)+'\n');
 console.log('Noded navigation:',graph.nodes.length,'nodes,',graph.edges.length,'edges');
}
