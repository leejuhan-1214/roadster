import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Vector3} from 'three';
import {decodeRegionalPack,indexRegionalTiles} from '../dist/js/city-regional-packs.js';
import {roadSegments} from '../dist/js/city-median.js';
import {createCityWorld} from '../dist/js/city-world.js';
import {createStreetOverlay} from '../dist/js/city-street-overlay.js';
import {blocksStationApproach,createStationPortals,planStationPortal} from '../dist/js/station-portals.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {CITY_DRIVE_PARAMS,DrivingController} from '../dist/js/driving-input.js';

const street=roadSegments([{type:'primary',width:16,points:[[-100,0],[100,0]],oneway:false}]);
const from=(g,forward,lateral=0,y=.65)=>({x:g.x+g.dx*forward-g.dz*lateral,y,z:g.z+g.dz*forward+g.dx*lateral});
const portalsFor=gates=>createStationPortals(new Map([['cell',{gates}]]));

test('City Hall, Jamsil and Gimpo Airport show local exits before and after their road geometry arrives',async()=>{
  const dir=new URL('../dist/assets/city/',import.meta.url);
  const points=JSON.parse(await readFile(new URL('street-points.json',dir),'utf8'));
  const manifest=JSON.parse(await readFile(new URL('seoul/manifest.json',dir),'utf8'));
  indexRegionalTiles(manifest);
  const cells=new Map(),portals=createStationPortals(cells,points.entrances);
  for(const [x,z,name] of [[-4371.8,-7614.3,'시청'],[6403.1,-1703.2,'잠실'],[-19980,-7170,'김포공항']]){
    cells.clear();
    const mapped=portals.nearest(x,z);
    assert.ok(mapped.label.startsWith(name+'역 '));assert.ok(mapped.distance<130);
    const e=points.entrances.find(row=>row[0]===mapped.x&&row[1]===mapped.z);
    const entry=manifest.tiles[Math.floor(e[0]/512)+'_'+Math.floor(e[1]/512)];
    const bytes=await readFile(new URL('seoul/'+entry.pack.split('?')[0],dir));
    const tile=decodeRegionalPack(JSON.parse(gunzipSync(bytes)))[entry.cell];
    const gate=planStationPortal(e,roadSegments(tile.roads));
    assert.ok(gate&&Math.hypot(gate.x-e[0],gate.z-e[1])<150);
    cells.set('near',{gates:[gate]});
    assert.equal(portals.nearest(x,z).id,gate.id);
    assert.equal(portals.crossing(from(gate,-5),from(gate,5)),gate);
  }
  cells.clear();
  for(const [x,z] of [[-28700,-23000],[16000,12000],[30,-40],[-20000,-7000]]){
    const expected=Math.min(...points.entrances.map(p=>Math.hypot(p[0]-x,p[1]-z)));
    assert.ok(Math.abs(portals.nearest(x,z).distance-expected)<1e-5);
  }
});

test('only a ground-level approach into the marked kerb or real stairwell starts a race',()=>{
  const gate=planStationPortal([8,25,'8','강남'],street,{dx:1,dz:0}),portals=portalsFor([gate]);
  assert.match(gate.label,/강남역 8번 출구/);
  for(const [a,b] of [[from(gate,-1,-8),from(gate,-1,8)],[from(gate,0,0),from(gate,0,0)],
                        [from(gate,8),from(gate,-8)],[from(gate,-5,5),from(gate,6,5)],
                        [from(gate,-6,0,5),from(gate,6,0,5)]])assert.equal(portals.crossing(a,b),null);
  assert.equal(portals.crossing(from(gate,-9),from(gate,8)),gate,'swept test across the whole opening');
  portals.suppress(gate);
  assert.equal(portals.crossing(from(gate,-1),from(gate,1)),null,'no immediate reentry');
  portals.crossing(from(gate,-12),from(gate,-21));
  assert.equal(portals.crossing(from(gate,-4),from(gate,4)),gate,'return after leaving the station');
  portals.reset();
  assert.equal(portals.crossing(from(gate.mouth,-6),from(gate.mouth,.6)),gate,'drive directly into the shelter mouth');
});

test('the full driving corridor stays clear of thin posts and adjacent station entrances',()=>{
  const entry=[6,18,'1','교대'],first=planStationPortal(entry,street);
  const mast={center:[first.x+.36,1,first.z+.45],size:[.18,2,.18]};
  const blocked=(...args)=>blocksStationApproach([mast],...args);
  assert.equal(blocked(first.x,first.z,first.dx,first.dz,4,1.55),true);
  const next=planStationPortal(entry,street,null,blocked);
  assert.ok(Math.hypot(next.x-first.x,next.z-first.z)>3);
  assert.equal(blocked(next.x-2*next.dx,next.z-2*next.dz,next.dx,next.dz,5.5,1.55),false);
  const adjacent=planStationPortal([6.4,18.2,'2','교대'],street,null,blocked,[next]);
  assert.ok(Math.hypot(next.x-adjacent.x,next.z-adjacent.z)>=7.5);
});

test('all Gangnam exits get labelled gates and the closest can be entered using wheel propulsion on the real road',async()=>{
  const load=async name=>JSON.parse(await readFile(new URL('../dist/assets/city/'+name,import.meta.url),'utf8'));
  const [data,points]=await Promise.all([load('gangnam.json'),load('street-points.json')]);
  const city=createCityWorld(data),overlay=createStreetOverlay(city,points);
  const [sx,,sz]=city.spawn.position;
  for(let i=0;i<45;i++)overlay.update(sx,sz);
  const gates=[...overlay.cells.values()].flatMap(c=>c.gates);
  assert.equal(gates.filter(g=>g.label.startsWith('강남역 ')).length,12);
  const gate=overlay.portals.nearest(sx,sz);
  assert.ok(gate.distance<80&&Number.isFinite(gate.heading),'a marked gate lies within a city block of spawn');
  const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0});
  overlay.bindPhysics(sim);sim.setObstacles(city.obstacles);
  const start=from(gate,-7);
  sim.state.pos.set(start.x,sim.restHeight,start.z);
  sim.state.q.setFromAxisAngle(new Vector3(0,1,0),gate.heading);
  const control=new DrivingController(),keys=new Set(['KeyW']),step=.002;
  let entered;
  for(let n=0;n<1250&&!entered;n++){
    const previous=sim.state.pos.clone();sim.step(step,control.update(keys,sim,step));
    entered=overlay.portals.crossing(previous,sim.state.pos);
  }
  assert.equal(entered?.id,gate.id,'driving forward from the approach should enter before touching a lamp or subway wall');
  assert.equal(sim.collisionCount,0);
  overlay.dispose();city.dispose();
});
