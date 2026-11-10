import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCityPlan,createCityWorld,pointInPolygon} from '../dist/js/city-world.js';
const data=JSON.parse(await readFile(new URL('../dist/assets/city/gangnam.json',import.meta.url),'utf8'));
const plan=createCityPlan(data);

test('Gangnam city uses a bounded, attributed road and building extract',()=>{
  assert.equal(data.license,'ODbL-1.0');assert.match(data.attribution,/OpenStreetMap/);
  assert.ok(data.sourceTimestamp);assert.ok(plan.roads.length>400);assert.ok(plan.buildings.length>1500);
  assert.ok(plan.roads.some(r=>r.name==='강남대로'));assert.ok(plan.roads.some(r=>r.name==='테헤란로'));
  assert.ok(plan.bounds.maxX-plan.bounds.minX>1400&&plan.bounds.maxX-plan.bounds.minX<1600);
  for(const s of plan.segments)for(const p of [s.a,s.b])assert.ok(p[0]>=plan.bounds.minX-1e-6&&p[0]<=plan.bounds.maxX+1e-6&&p[1]>=plan.bounds.minZ-1e-6&&p[1]<=plan.bounds.maxZ+1e-6);
});

test('city spawn is on a real road, faces its direction and clears building solids',()=>{
  const [x,,z]=plan.spawn.position;
  const matching=plan.segments.filter(s=>{
    const t=(x-s.a[0])*s.dx+(z-s.a[1])*s.dz;if(t<0||t>s.length)return false;
    return Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)<s.road.width/2;
  });
  assert.ok(matching.length);assert.ok(matching.some(s=>Math.abs(Math.cos(plan.spawn.heading)-s.dx)<1e-8&&Math.abs(-Math.sin(plan.spawn.heading)-s.dz)<1e-8));
  for(const b of plan.buildings)assert.ok(!pointInPolygon(x,z,b.points));
  for(const box of plan.obstacles){const [cx,,cz]=box.center,[w,,d]=box.size;assert.ok(Math.abs(x-cx)>w/2+2.6||Math.abs(z-cz)>d/2+2.6,'spawn chassis must not intersect '+box.id);}
});

test('building convex collision pieces retain the original OSM boundary and volume',()=>{
  const buildings=new Map(plan.buildings.map(b=>[String(b.id),b]));
  const areas=new Map();
  const polygonArea=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0))/2;
  for(const box of plan.obstacles){
    const b=buildings.get(box.id.split('-')[1]),[x,y,z]=box.center,[w,h,d]=box.size;
    assert.ok([...box.center,...box.size].every(Number.isFinite));assert.ok(w>0&&h>0&&d>0);
    assert.equal(h,b.height);assert.equal(y,h/2);
    assert.equal(box.kind,'prism');
    for(const p of box.footprint)assert.ok(b.points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-8),'collision vertex belongs to source boundary');
    areas.set(b.id,(areas.get(b.id)||0)+polygonArea(box.footprint));
  }
  for(const b of plan.buildings)assert.ok(Math.abs((areas.get(b.id)||0)-polygonArea(b.points))<1e-5,'no missing strips or filled courtyard at '+b.id);
});

test('complete city batches finite geometry and spatial lookup retains local collision shapes',()=>{
  const city=createCityWorld(data);
  try{
    let meshes=0,vertices=0;
    city.root.traverse(o=>{if(!o.isMesh)return;meshes++;const p=o.geometry.attributes.position;vertices+=p.count;for(const n of p.array)assert.ok(Number.isFinite(n));});
    assert.ok(meshes<40,'static city should not need thousands of draw calls');assert.ok(vertices<500000);
    for(const name of ['OSM road network','real road sidewalks']){
      const g=city.root.getObjectByName(name).geometry,p=g.attributes.position,uv=g.attributes.uv;
      for(let i=0;i<p.count;i++){
        assert.ok(Math.abs(uv.getX(i)-p.getX(i)/4)<1e-5,'overlapping road patches share world X texture coordinates');
        assert.ok(Math.abs(uv.getY(i)-p.getZ(i)/4)<1e-5,'junctions share world Z texture coordinates');
      }
    }
    const texture=city.root.getObjectByName('OSM road network').material.map.image;
    const rowMeans=Array.from({length:texture.height},(_,y)=>{
      let sum=0;for(let x=0;x<texture.width;x++)sum+=texture.data[(y*texture.width+x)*4];return sum/texture.width;
    });
    const changes=rowMeans.slice(1).map((mean,i)=>mean-rowMeans[i]);
    assert.ok(changes.filter(d=>d>0).length>15&&changes.filter(d=>d<0).length>15,'asphalt grain must not form a repeating monotonic row gradient');
    assert.ok(Math.max(...rowMeans)-Math.min(...rowMeans)<4,'row brightness stays close to the same asphalt mean');
    const [x,,z]=city.spawn.position,near=city.obstaclesNear(x,z,50);
    assert.ok(near.length>0&&near.length<1000);
    for(const box of city.obstacles){const [bx,,bz]=box.center;if(Math.abs(bx-x)<50&&Math.abs(bz-z)<50)assert.ok(near.includes(box));}
    assert.match(city.nearestRoadName(x,z),/강남/);
  }finally{city.dispose();}
});
