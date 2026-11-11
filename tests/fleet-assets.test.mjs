import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {cockpitSeat} from '../dist/js/cockpit-view.js';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

for(const profile of VEHICLES)test(`${profile.id}: actual asset, fitted ports and complete disassembly`,async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  const params=configureVehicleFit(vehicle,profile);
  assert.equal(vehicle.wheels.length,4);
  assert.equal(vehicle.nozzleCovers.length,10);
  assert.equal(vehicle.jetMounts.length,10);
  // The low-poly Peugeot 205 has exactly one body and four separate tire meshes.
  // Five is sufficient; actual wheel geometry/axes and pinned asset hashes are
  // verified separately rather than requiring an arbitrary extra body fragment.
  assert.ok(vehicle.sourceMeshCount>=5,'retain an actual body and four wheel source parts');
  assert.equal(new Set(vehicle.catalog.map(p=>p.id)).size,vehicle.catalog.length);
  assert.ok(Object.values(params).every(Number.isFinite),'geometry supplies finite physical parameters');
  const skin=vehicle.nozzleFit.skinBounds;
  assert.ok(skin.containsPoint(cockpitSeat(vehicle).eye),'driver eye remains inside this actual model body envelope');
  assert.ok(params.liftY<skin.max.y&&params.liftY>skin.min.y,'swivels are inside the hull vertical envelope');
  assert.ok(params.boostX<skin.max.x&&params.boostX>skin.min.x,'rear mounts are inside the hull length');
  assert.ok(params.yawZ<Math.max(Math.abs(skin.min.z),Math.abs(skin.max.z)),'attitude mounts are inset');
  // Check the actual hardware geometry, including the full allowed swivel cone,
  // against the locally sampled underside planes, not only the mount centres.
  for(let i=0;i<4;i++){
    const pivot=vehicle.gimbalNozzles[i],floor=vehicle.nozzleFit.liftSurfaces[i][1];
    for(const tilt of [0,25*Math.PI/180])for(let azimuth=0;azimuth<8;azimuth++){
      const a=azimuth*Math.PI/4,direction=new THREE.Vector3(Math.sin(tilt)*Math.cos(a),Math.cos(tilt),Math.sin(tilt)*Math.sin(a));
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      const actual=new THREE.Box3().setFromObject(pivot.parent);
      assert.ok(actual.min.y>=floor+.005,`lift ${i} protrudes below local skin at ${tilt} rad`);
    }
    pivot.quaternion.identity();
  }
  for(let i=0;i<2;i++){
    const actual=new THREE.Box3().setFromObject(vehicle.root.getObjectByName('body fitted rear nozzle '+i));
    assert.ok(actual.min.x>vehicle.nozzleFit.rearSurfaces[i][0]+.005,'rear bell is concealed behind the bumper');
  }
  for(let i=0;i<4;i++){
    const actual=new THREE.Box3().setFromObject(vehicle.root.getObjectByName('body fitted attitude nozzle '+i));
    const z=vehicle.nozzleFit.sideSurfaces[i][2];
    assert.ok(z>0?actual.max.z<z-.005:actual.min.z>z+.005,'attitude bell is concealed behind the side skin');
  }
  const wb=vehicle.wheels[0].position.x-vehicle.wheels[2].position.x;
  assert.ok(Math.abs(wb-(profile.wheelbase||2.8))<.03,'wheelbase is scaled to this car');
  updateNozzleCovers(vehicle,[],true);updateVehicleExplosion(vehicle,1,{inspect:true});
  const boxes=vehicle.fitLayout.logicalGroups.map(g=>({id:g.id,box:g.entries.reduce((b,e)=>b.union(new THREE.Box3().setFromObject(e.object)),new THREE.Box3())}));
  for(let i=0;i<boxes.length;i++){
    assert.ok(boxes[i].box.min.y>=.14,`${boxes[i].id} stays above the ground`);
    for(let j=i+1;j<boxes.length;j++)assert.equal(boxes[i].box.intersectsBox(boxes[j].box),false,`${boxes[i].id} overlaps ${boxes[j].id}`);
  }
  updateVehicleExplosion(vehicle,0,{inspect:true});updateNozzleCovers(vehicle,[],false);
  for(const e of vehicle.fitLayout.entries)assert.ok(e.object.position.distanceTo(e.basePosition)<1e-8,'reassembly restores the original local position');
  assert.ok(vehicle.nozzleCovers.every(c=>c.hinge.rotation.y===0));
});
