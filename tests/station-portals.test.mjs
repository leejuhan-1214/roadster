import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {roadSegments} from '../dist/js/city-median.js';
import {createCityWorld} from '../dist/js/city-world.js';
import {createStreetOverlay} from '../dist/js/city-street-overlay.js';
import {blocksStationApproach,createStationPortals,planStationPortal} from '../dist/js/station-portals.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {CITY_DRIVE_PARAMS,DrivingController} from '../dist/js/driving-input.js';

const street=roadSegments([{type:'primary',width:16,points:[[-100,0],[100,0]],oneway:false}]);
const from=(g,forward,lateral=0,y=.65)=>({x:g.x+g.dx*forward-g.dz*lateral,y,z:g.z+g.dz*forward+g.dx*lateral});
const portalsFor=gates=>createStationPortals(new Map([['cell',{gates}]]));

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
