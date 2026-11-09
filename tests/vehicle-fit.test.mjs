import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';

let vehicle;
before(async()=>{
  const asset=new URL('../dist/assets/tesla-roadster-2020/',import.meta.url);
  const fixture=JSON.parse(await readFile(new URL('scene.gltf',asset),'utf8'));
  for(const buffer of fixture.buffers)buffer.uri='data:application/octet-stream;base64,'+(await readFile(new URL(buffer.uri,asset))).toString('base64');
  if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class extends Event{constructor(type,init={}){super(type);Object.assign(this,init);}};
  const loader=new GLTFLoader().register(()=>({name:'fit-test-materials',loadMaterial:index=>Promise.resolve(new THREE.MeshStandardMaterial({name:fixture.materials[index].name}))}));
  const gltf=await loader.parseAsync(JSON.stringify(fixture),'');
  vehicle=adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser);
  configureVehicleFit(vehicle,{id:'roadster'});
});

function boxes(v){v.root.updateMatrixWorld(true);return v.fitLayout.logicalGroups.map(g=>({id:g.id,box:g.entries.reduce((b,e)=>b.union(new THREE.Box3().setFromObject(e.object)),new THREE.Box3())}));}
function overlappingPairs(v){const b=boxes(v),overlaps=[];for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++)if(b[i].box.intersectsBox(b[j].box))overlaps.push([b[i].id,b[j].id]);return overlaps;}

test('actual Roadster source components have no overlapping bounds at 100% disassembly',()=>{
  assert.equal(vehicle.fitLayout.entries.length,114);
  updateNozzleCovers(vehicle,[],true);
  updateVehicleExplosion(vehicle,1,{inspect:true});
  assert.deepEqual(overlappingPairs(vehicle),[]);
  assert.ok(vehicle.explosionBounds.getSize(new THREE.Vector3()).x<27);
  assert.ok(Math.min(...boxes(vehicle).map(e=>e.box.min.y))>=.14,'all separated parts remain above the opaque ground');
});

test('full disassembly is deterministic despite frozen wheel motion and restores all assembly positions',()=>{
  updateVehicleExplosion(vehicle,0,{inspect:true});
  const before=vehicle.fitLayout.entries.map(e=>e.object.getWorldPosition(new THREE.Vector3()));
  for(const wheel of vehicle.wheels){wheel.rotation.y=.5;wheel.userData.spinGroup.rotation.z=2.7;wheel.position.y+=.3;}
  updateVehicleExplosion(vehicle,1,{inspect:true});
  const full=vehicle.fitLayout.entries.map(e=>e.object.getWorldPosition(new THREE.Vector3()));
  updateVehicleExplosion(vehicle,.4,{inspect:true});updateVehicleExplosion(vehicle,1,{inspect:true});
  full.forEach((position,i)=>assert.ok(position.distanceTo(vehicle.fitLayout.entries[i].object.getWorldPosition(new THREE.Vector3()))<1e-8));
  updateVehicleExplosion(vehicle,0,{inspect:true});
  before.forEach((position,i)=>assert.ok(position.distanceTo(vehicle.fitLayout.entries[i].object.getWorldPosition(new THREE.Vector3()))<1e-8));
  assert.ok(vehicle.wheels.every(w=>w.rotation.y===0&&w.userData.spinGroup.rotation.z===0));
});

test('body-fitted rig has ten closed idle hatches and finite matched thrust coordinates',()=>{
  updateVehicleExplosion(vehicle,0,{inspect:true});updateNozzleCovers(vehicle,[],false);
  assert.equal(vehicle.nozzleCovers.length,10);assert.equal(vehicle.jetMounts.length,10);
  assert.ok(vehicle.nozzleCovers.every(c=>c.hinge.rotation.y===0));
  const p=vehicle.geometryParams;
  for(const key of ['liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ'])assert.ok(Number.isFinite(p[key]),key);
  for(let i=0;i<4;i++){
    const mount=vehicle.gimbalNozzles[i].parent;
    assert.equal(mount.position.x,i<2?p.liftX:-p.liftX);
    assert.equal(mount.position.y,p.liftY);
    assert.equal(mount.position.z,i%2?p.liftZ:-p.liftZ);
    assert.ok(p.liftY>vehicle.nozzleFit.liftSurfaces[i][1],'mount is inside the local floor');
  }
  assert.ok(p.boostX>Math.max(...vehicle.nozzleFit.rearSurfaces.map(p=>p[0])));
  assert.ok(p.yawZ<Math.min(...vehicle.nozzleFit.sideSurfaces.map(p=>Math.abs(p[2]))));
  updateNozzleCovers(vehicle,[{opening:1}],false);
  assert.ok(vehicle.nozzleCovers[0].hinge.rotation.y<-.5);
  assert.equal(vehicle.nozzleCovers[1].hinge.rotation.y,0);
  assert.equal(vehicle.catalog.length,114,'covers remain members of the existing hypothetical rig');
});

test('drive updates preserve moving wheel positions and rotations at assembly',()=>{
  const wheel=vehicle.wheels[0];wheel.position.y=.123;wheel.rotation.y=.25;wheel.userData.spinGroup.rotation.z=1.2;
  updateVehicleExplosion(vehicle,0,{inspect:false});
  assert.equal(wheel.position.y,.123);assert.equal(wheel.rotation.y,.25);assert.equal(wheel.userData.spinGroup.rotation.z,1.2);
});
