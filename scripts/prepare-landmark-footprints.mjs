import fs from 'node:fs';
const base = new URL('../docs/research/', import.meta.url);
const raw = JSON.parse(fs.readFileSync(new URL('gangnam-landmark-osm.json', base), 'utf8').replace(/^\uFEFF/, ''));
const elements = new Map(raw.elements.map(e => [`${e.type}/${e.id}`, e]));
const origin = [37.4979, 127.0276];
const project = n => [Math.round((n.lon-origin[1])*111320*Math.cos(origin[0]*Math.PI/180)*100)/100, Math.round(-(n.lat-origin[0])*111320*100)/100];
const hull = input => {
  const points=[...new Map(input.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[],upper=[];
  for(const p of points){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(const p of [...points].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1),lower[0]];
};
const orientedBounds = points => {
  let best=null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],theta=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(theta),s=Math.sin(theta);
    const u=points.map(p=>p[0]*c+p[1]*s),v=points.map(p=>-p[0]*s+p[1]*c);
    const loU=Math.min(...u),hiU=Math.max(...u),loV=Math.min(...v),hiV=Math.max(...v),area=(hiU-loU)*(hiV-loV);
    if(!best||area<best.area){const cu=(loU+hiU)/2,cv=(loV+hiV)/2;best={area,center:[cu*c-cv*s,cu*s+cv*c],width:hiU-loU,depth:hiV-loV,rotationY:-theta};}
  }
  return best;
};
const definitions = [];
for (const id of [8311183,8311184,8311185,19640833,7747040]) {
  const relation = elements.get(`relation/${id}`);
  if (!relation) throw new Error(`Missing relation ${id}`);
  const members = relation.members.filter(m => m.type === 'way' && m.role === 'outer');
  const parts = members.map(m => elements.get(`way/${m.ref}`)?.nodes?.slice());
  if (parts.some(p => !p)) throw new Error(`Missing member of ${id}`);
  const rings = [];
  while (parts.length) {
    let nodes = parts.shift();
    while (nodes[0] !== nodes.at(-1)) {
      const match = parts.findIndex(p => p[0] === nodes.at(-1) || p.at(-1) === nodes.at(-1));
      if (match < 0) throw new Error(`Open footprint ${id}`);
      const tail = parts.splice(match,1)[0];
      if (tail.at(-1) === nodes.at(-1)) tail.reverse();
      nodes.push(...tail.slice(1));
    }
    rings.push(nodes.map(nodeId => project(elements.get(`node/${nodeId}`))));
  }
  const points = hull(rings.flat());
  const obb=orientedBounds(points);
  const center=obb.center.map(n=>Math.round(n*100)/100);
  definitions.push({id,name:relation.tags.name,height:Number(relation.tags.height),levels:relation.tags['building:levels'],center,points,rings,orientedBounds:obb,componentIds:members.map(m=>m.ref),source:`https://www.openstreetmap.org/relation/${id}`,license:'ODbL-1.0',note:'points is a convex envelope of all outer rings for positioning only; use each original ring for exact geometry/collisions, not this envelope.'});
}
const city = JSON.parse(fs.readFileSync(new URL('../dist/assets/city/gangnam.json', import.meta.url), 'utf8'));
for (const id of [504227059,504227064]) {
  const b = city.buildings.find(b => b.id === id);
  definitions.push({...b,source:`https://www.openstreetmap.org/way/${id}`,license:'ODbL-1.0',note:'Separate tagged building/wing; height only known when present in original OSM tag.'});
}
fs.writeFileSync(new URL('gangnam-landmark-footprints.json',base), JSON.stringify(definitions,null,2)+'\n');
console.log(definitions.map(({id,name,height,center,points})=>({id,name,height,center,vertices:points.length})));
