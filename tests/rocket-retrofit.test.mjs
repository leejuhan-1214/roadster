import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {rocketThrusterLayout} from '../dist/js/rocket-layout.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
const fractions=[-1,-1/3,1/3,1];
for(const profile of VEHICLES)test(profile.id+': real body retains shape with a fitted 4+4+2 pneumatic retrofit',async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  try{
    const source=vehicle.catalog.filter(e=>e.kind==='model').map(e=>{
      const object=vehicle.detailParts.get(e.id);
      return {object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()};
    });
    prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);
    assert.equal(vehicle.nozzleFit.configuration,'4+4+2');
    assert.equal(vehicle.nozzleCovers.length,10);assert.equal(vehicle.jetMounts.length,10);
    assert.equal(vehicle.rearNozzles.length,4);assert.equal(vehicle.gimbalNozzles.length,4);
    assert.equal(vehicle.fans.length,4);
    assert.equal(vehicle.nozzleFit.rearSurfaces.length,4);assert.equal(vehicle.nozzleFit.sideSurfaces.length,2);
    for(const old of source){assert.ok(old.object.position.equals(old.position));assert.ok(old.object.quaternion.equals(old.quaternion));assert.ok(old.object.scale.equals(old.scale));}
    const p=vehicle.geometryParams,b=vehicle.nozzleFit.skinBounds,size=b.getSize(new THREE.Vector3());
    for(const key of ['liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ'])assert.ok(Number.isFinite(p[key]),key);
    assert.equal(p.propulsionProfile,'rocket10');
    const forceLayout=rocketThrusterLayout(p);
    for(let i=0;i<10;i++){
      const offset=new THREE.Vector3(...forceLayout[i].position).sub(vehicle.jetMounts[i].pos);
      assert.ok(offset.cross(new THREE.Vector3(...forceLayout[i].direction)).length()<1e-8,'exit stays on physics thrust line '+i);
    }
    for(let i=0;i<4;i++){
      const lift=vehicle.gimbalNozzles[i].parent.position;
      near(lift.x,i<2?p.liftX:-p.liftX);near(lift.y,p.liftY);near(lift.z,i%2?p.liftZ:-p.liftZ);
      const rear=vehicle.rearNozzles[i].position;
      near(rear.x,p.boostX);near(rear.y,p.boostY);near(rear.z,fractions[i]*p.boostZ);
      assert.ok(vehicle.nozzleFit.rearSurfaces[i][0]<b.min.x+size.x*.36,'rear ray must not hit the front shell');
      assert.ok(p.boostX>vehicle.nozzleFit.rearSurfaces[i][0],'rear machinery stays inboard');
    }
    assert.ok(2*p.boostZ/3>.16,'four closed rear hatches remain separated');
    for(let i=8;i<10;i++){
      near(vehicle.jetMounts[i].pos.x,p.yawX);near(vehicle.jetMounts[i].pos.y,p.yawY);
      assert.equal(Math.sign(vehicle.jetMounts[i].pos.z),i===8?1:-1);
    }
    updateNozzleCovers(vehicle,[],false);assert.ok(vehicle.nozzleCovers.every(c=>c.hinge.rotation.y===0));
    updateNozzleCovers(vehicle,Array.from({length:10},()=>({opening:1})),false);assert.ok(vehicle.nozzleCovers.every(c=>c.hinge.rotation.y<-.5));
    updateVehicleExplosion(vehicle,1,{inspect:true});
    const groups=vehicle.fitLayout.logicalGroups;
    const boxes=groups.map(g=>g.entries.reduce((box,e)=>box.union(new THREE.Box3().setFromObject(e.object)),new THREE.Box3()));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(!boxes[i].intersectsBox(boxes[j]),groups[i].id+' overlaps '+groups[j].id);
    updateVehicleExplosion(vehicle,0,{inspect:true});
    for(const entry of vehicle.fitLayout.entries)assert.ok(entry.object.position.distanceTo(entry.basePosition)<1e-8);
    const wheel=vehicle.wheels[0];wheel.position.y+=.15;const y=wheel.position.y;
    updateVehicleExplosion(vehicle,0,{inspect:false});near(wheel.position.y,y);
  }finally{disposeVehicle(vehicle);}
});
