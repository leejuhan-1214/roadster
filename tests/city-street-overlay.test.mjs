import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {roadSegments,planStreetCell,buildStreetCell,createStreetOverlay,STREET_CELL,STREET_NEAR} from '../dist/js/city-street-overlay.js';
import {PhysicsSim} from '../dist/js/physics.js';

const dir=new URL('../dist/assets/city/',import.meta.url);
const text=await readFile(new URL('street-points.json',dir),'utf8'),points=JSON.parse(text);
const core=JSON.parse(await readFile(new URL('gangnam.json',dir),'utf8'));
const cell={minX:-128,maxX:128,minZ:-128,maxZ:128};
const road=(id,name,points,extra={})=>({id,name,type:'primary',oneway:true,width:13,points,...extra});
// Northbound and southbound carriageways 18 m apart: traffic keeps right, so the sibling is on the left.
const avenue=name=>[road(1,name,[[9,100],[9,-100]]),road(2,name,[[-9,-100],[-9,100]])];

test('bundled subway entrances and signal positions match their provenance record',async()=>{
  const provenance=JSON.parse(await readFile(new URL('street-points.provenance.json',dir),'utf8'));
  assert.equal(provenance.sha256,createHash('sha256').update(text).digest('hex'));
  assert.equal(points.license,'ODbL-1.0');assert.match(points.attribution,/OpenStreetMap/);assert.ok(points.sourceTimestamp);
  assert.equal(provenance.counts.entrances,points.entrances.length);assert.equal(provenance.counts.signals,points.signals.length);
  assert.ok(points.entrances.length>300&&points.signals.length>150&&Buffer.byteLength(text)<40000);
  const b=points.bounds;
  for(const [x,z]of [...points.entrances,...points.signals])assert.ok(x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ);
  const gangnam=points.entrances.filter(e=>e[3]==='강남').map(e=>Number(e[2])).sort((p,q)=>p-q);
  assert.deepEqual(gangnam,[1,2,3,4,5,6,7,8,9,10,11,12],'Gangnam station has its twelve numbered exits');
  for(const e of points.entrances.filter(e=>e[3]==='강남'))assert.ok(Math.hypot(e[0],e[1])<420,'exits stand around the station at the origin');
});

test('the two carriageways of a divided avenue are joined at the centre line',()=>{
  const plan=planStreetCell(roadSegments(avenue('시험대로')),{},cell);
  assert.equal(plan.fills.length,2,'each carriageway paves its own half of the gap');
  for(const fill of plan.fills){assert.ok(Math.abs(fill.from+9.03)<1e-9&&Math.abs(fill.to+6.45)<1e-9,'from the kerb line to the centre, on the left');}
  assert.equal(plan.patches.length,4);assert.ok(plan.patches.every(p=>Math.abs(p.p[0])<1e-9&&p.radius===9),'junction patches sit on the centre line and stay between the carriageway axes');
  const yellow=plan.lines.filter(l=>l.color==='yellow');assert.equal(yellow.length,2,'one double centre line, drawn once');
  assert.ok(yellow.every(l=>l.s.road.id===1&&Math.abs((l.from+l.to)/2+9)<.2));
  assert.equal(plan.lines.filter(l=>l.color==='blue').length,0);
  const gangnam=planStreetCell(roadSegments(avenue('강남대로')),{},cell).lines.filter(l=>l.color==='blue');
  assert.equal(gangnam.length,2,'Gangnam-daero carries a median bus lane line each way');assert.ok(gangnam.every(l=>Math.abs((l.from+l.to)/2+5.7)<1e-9));
  // Not a pair: a wide real median, a two-way street, a minor street, a way whose midpoint is in another cell.
  assert.equal(planStreetCell(roadSegments([road(1,'넓은대로',[[20,100],[20,-100]]),road(2,'넓은대로',[[-20,-100],[-20,100]])]),{},cell).fills.length,0);
  assert.equal(planStreetCell(roadSegments(avenue('양방로').map(r=>({...r,oneway:false}))),{},cell).fills.length,0);
  assert.equal(planStreetCell(roadSegments(avenue('골목').map(r=>({...r,type:'residential'}))),{},cell).fills.length,0);
  assert.equal(planStreetCell(roadSegments(avenue('먼대로')),{},{minX:300,maxX:556,minZ:-128,maxZ:128}).fills.length,0);
  // A way mapped against the flow of traffic is turned before its left side is taken.
  const reversed=[road(1,'역방향대로',[[9,-100],[9,100]],{onewayDirection:-1}),road(2,'역방향대로',[[-9,-100],[-9,100]])];
  assert.equal(planStreetCell(roadSegments(reversed),{},cell).fills.length,2);
});

test('signal masts stand on the right-hand kerb before the signal, one per approach',()=>{
  const street=[road(5,'신호로',[[0,-80],[0,0]],{oneway:false}),road(5,'신호로',[[0,0],[0,80]],{oneway:false})];
  const plan=planStreetCell(roadSegments(street),{signals:[[0,0]]},cell);
  assert.equal(plan.masts.length,2,'a two-way street is signalled in both directions');
  for(const m of plan.masts){
    assert.ok(Math.abs(Math.abs(m.x)-7.6)<1e-9,'1.1 m outside the 13 m carriageway');assert.ok(Math.abs(Math.abs(m.z)-4)<1e-9,'4 m before the signal');
    assert.ok(m.x*m.dz<0,'on the right of its own direction of travel');assert.ok(m.reach>=4.5&&m.reach<=11);
  }
  assert.equal(plan.colliders.filter(c=>c.id.startsWith('signal-')).length,2);
  assert.equal(planStreetCell(roadSegments(street),{signals:[[0,0]]},cell,{occupied:()=>true}).masts.length,0,'no mast inside a building');
  assert.equal(planStreetCell(roadSegments([road(6,'좁은길',[[0,-80],[0,0]],{width:5,type:'residential'})]),{signals:[[0,0]]},cell).masts.length,0);
});

test('subway entrances line up with the street, keep their exit number and are solid',()=>{
  const street=roadSegments([road(7,'역앞로',[[-100,0],[100,0]],{oneway:false})]);
  const plan=planStreetCell(street,{entrances:[[10,14,'8','강남'],[30,2,'9','강남'],[300,14,'1','멀리'],[50,90,'3','']]},cell,{key:'k'});
  assert.equal(plan.entrances.length,1,'on the carriageway, outside the cell or far from any street: not built');
  const e=plan.entrances[0];assert.deepEqual([e.x,e.z,e.ref,e.station],[10,14,'8','강남']);assert.ok(Math.abs(Math.abs(e.dx)-1)<1e-9&&Math.abs(e.dz)<1e-9);
  const walls=plan.colliders.filter(c=>c.id.startsWith('subway-k-0'));assert.equal(walls.length,3);
  for(const wall of walls){assert.equal(wall.kind,'prism');assert.equal(wall.footprint.length,4);assert.ok(wall.size.every(v=>v>0)&&wall.center.every(Number.isFinite));}
  const sim=new PhysicsSim({aeroEnabled:false});
  assert.equal(sim.setObstacleChunk('street:k',plan.colliders),true,'the physics accepts the stairwell walls');
  // A car driven sideways into the stairwell from the pavement is stopped by its side wall.
  sim.state.pos.set(10,sim.restHeight,24);sim.state.q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);sim.state.vel.set(0,0,-8);
  for(const wheel of sim.wheels)wheel.omega=8/sim.params.wheelRadius;
  for(let i=0;i<900;i++)sim.step(.002,{});
  assert.ok(sim.collisionCount>0&&sim.state.pos.z>15.4,'stopped at the wall: z='+sim.state.pos.z);
});

test('the centre district gets its avenues, signals and numbered exits from real data',()=>{
  const segments=roadSegments(core.roads),near=b=>segments.filter(s=>Math.max(s.a[0],s.b[0])>=b.minX-60&&Math.min(s.a[0],s.b[0])<=b.maxX+60&&Math.max(s.a[1],s.b[1])>=b.minZ-60&&Math.min(s.a[1],s.b[1])<=b.maxZ+60);
  const total={fills:0,masts:0,entrances:0},names=new Set(),refs=new Set();
  for(let cx=-3;cx<3;cx++)for(let cz=-3;cz<3;cz++){
    const b={minX:cx*STREET_CELL,maxX:(cx+1)*STREET_CELL,minZ:cz*STREET_CELL,maxZ:(cz+1)*STREET_CELL},plan=planStreetCell(near(b),points,b,{key:cx+','+cz});
    total.fills+=plan.fills.length;total.masts+=plan.masts.length;total.entrances+=plan.entrances.length;
    for(const f of plan.fills){names.add(f.s.road.name);assert.ok(f.to>f.from&&f.to-f.from<7.6&&f.to<0,'a strip on the left, never wider than the allowed median');}
    for(const e of plan.entrances)if(e.station==='강남')refs.add(e.ref);
    const group=buildStreetCell(plan,{road:new THREE.MeshStandardMaterial(),paint:new THREE.MeshStandardMaterial(),furniture:new THREE.MeshStandardMaterial(),boxGeometry:new THREE.BoxGeometry(1,1,1)});
    group.traverse(o=>{if(o.isMesh)assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));});
    for(const mesh of group.children)if(mesh.name==='divided avenue centre pavement'){const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;for(let i=0;i<p.count;i+=5){assert.ok(Math.abs(uv.getX(i)-p.getX(i)/4)<1e-4&&Math.abs(uv.getY(i)-p.getZ(i)/4)<1e-4,'same world-aligned asphalt as the carriageway');assert.ok(p.getY(i)>.014&&p.getY(i)<.018);}}
    group.userData.dispose();
  }
  assert.ok(total.fills>60&&total.masts>10&&total.entrances>=10,JSON.stringify(total));
  for(const name of ['강남대로','테헤란로'])assert.ok(names.has(name),name+' is joined at its centre line');
  assert.ok(refs.size>=8,'most Gangnam station exits stand clear of the carriageways: '+[...refs]);
});

test('overlay cells follow the vehicle, register their solids and are released behind it',()=>{
  const root=new THREE.Group(),chunks=new Map(),calls=[];
  const city={root,bounds:{minX:-768,maxX:768,minZ:-768,maxZ:768},source:core,buildings:[]};
  const physics={setObstacleChunk:(key,list)=>calls.push(['set',key,list.length]),removeObstacleChunk:key=>calls.push(['remove',key])};
  const overlay=createStreetOverlay(city,points);
  assert.equal(root.children.includes(overlay.root),true);
  overlay.update(0,0);assert.equal(overlay.cells.size,1,'one cell per frame');assert.ok(overlay.cells.has('0,0')||overlay.cells.has('-1,-1')||overlay.cells.has('0,-1')||overlay.cells.has('-1,0'));
  for(let i=0;i<60;i++)overlay.update(0,0);
  const expected=overlay.cells.size;assert.ok(expected>=12&&expected<=25,'cells within '+STREET_NEAR+' m: '+expected);
  assert.equal(calls.length,0,'no simulation bound yet');
  overlay.bindPhysics(physics);const withSolids=[...overlay.cells.values()].filter(c=>c.colliders.length).length;
  assert.equal(calls.filter(c=>c[0]==='set').length,withSolids);assert.ok(withSolids>0);
  // Far away the old cells are dropped and their solids removed.
  for(let i=0;i<400;i++)overlay.update(4000,4000);
  assert.ok(![...overlay.cells.keys()].includes('0,0'));assert.ok(calls.filter(c=>c[0]==='remove').length>=withSolids);
  overlay.dispose();assert.equal(overlay.cells.size,0);assert.equal(root.children.includes(overlay.root),false);
});
