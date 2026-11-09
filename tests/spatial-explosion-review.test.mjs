import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

const EPS=1e-7;
const bounds=object=>new THREE.Box3().setFromObject(object);
const center=object=>bounds(object).getCenter(new THREE.Vector3());
const close=(actual,expected,message)=>assert.ok(actual.distanceTo(expected)<EPS,message);
function wheelIndex(vehicle,object){
  for(let node=object;node;node=node.parent){const index=vehicle.wheels.indexOf(node);if(index>=0)return index;}
  return -1;
}

// These are spatial contracts, independent of the layout's packing algorithm.
// In particular, artist meshes containing multiple wheels must not join opposite
// corners, and one component's material primitives must remain registered.
for(const profile of VEHICLES)test(`${profile.id}: natural disassembly preserves component identity and car orientation`,async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  try{
    configureVehicleFit(vehicle,profile);
    updateNozzleCovers(vehicle,[],true);
    updateVehicleExplosion(vehicle,0,{inspect:true});
    const layout=vehicle.fitLayout,groups=layout.logicalGroups;
    assert.ok(Array.isArray(groups)&&groups.length>4,'retain distinct logical components');
    const baseline=new Map(layout.entries.map(entry=>[entry,{
      center:center(entry.object),position:entry.object.position.clone(),
      quaternion:entry.object.quaternion.clone(),scale:entry.object.scale.clone(),
      wheel:wheelIndex(vehicle,entry.object),
    }]));
    const originalWheels=vehicle.wheels.map(center);
    const originalRootQuaternion=vehicle.root.quaternion.clone();
    const allMembers=groups.flatMap(group=>group.entries);
    assert.equal(allMembers.length,layout.entries.length,'every catalog record belongs to a logical component');
    assert.equal(new Set(allMembers).size,layout.entries.length,'no record is assigned twice');
    assert.ok(layout.entries.every(entry=>allMembers.includes(entry)));
    const anchor=groups.filter(group=>group.isAnchor);
    assert.equal(anchor.length,1,'one recognizable shell anchors the disassembly');
    close(anchor[0].delta,new THREE.Vector3(0,layout.groundLift,0),'the shell only receives the shared ground clearance lift');

    // A vehicle may enter inspection after steering and wheel rotation. The
    // exploded arrangement should be determined by the original car, not motion.
    vehicle.wheels.forEach((wheel,i)=>{
      wheel.rotation.y=.2+i*.1;
      wheel.userData.spinGroup.rotation.z=.8+i;
      wheel.position.y+=.05*(i+1);
    });
    updateVehicleExplosion(vehicle,1,{inspect:true});
    const fullCenters=new Map(layout.entries.map(entry=>[entry,center(entry.object)]));
    for(const group of groups){
      const cornerSet=new Set(group.entries.map(entry=>baseline.get(entry).wheel).filter(i=>i>=0));
      assert.ok(cornerSet.size<=1,`${group.id} must not combine opposite wheel corners`);
      if(cornerSet.size)assert.ok(group.entries.every(entry=>baseline.get(entry).wheel>=0),'wheel groups exclude body geometry');
      for(const entry of group.entries){
        close(fullCenters.get(entry).clone().sub(baseline.get(entry).center),group.delta,`${entry.id} stays registered to its logical component`);
        assert.ok(entry.object.quaternion.angleTo(baseline.get(entry).quaternion)<EPS,`${entry.id} keeps its orientation`);
        close(entry.object.scale,baseline.get(entry).scale,`${entry.id} keeps its shape`);
      }
    }
    assert.ok(vehicle.root.quaternion.angleTo(originalRootQuaternion)<EPS,'layout does not rotate the whole car');

    const finalWheels=vehicle.wheels.map(center);
    for(let i=0;i<4;i++){
      assert.ok(finalWheels[i].x*(i<2?1:-1)>0,`wheel ${i} stays on its original axle side`);
      assert.ok(finalWheels[i].z*(i%2?1:-1)>0,`wheel ${i} stays on its original left/right side`);
      const wheelMembers=layout.entries.filter(entry=>baseline.get(entry).wheel===i);
      assert.ok(wheelMembers.length>0);
      const wheelDelta=finalWheels[i].clone().sub(originalWheels[i]);
      for(const entry of wheelMembers)close(fullCenters.get(entry).clone().sub(baseline.get(entry).center),wheelDelta,`wheel ${i} remains one aligned assembly`);
    }

    const halfLength=vehicle.assemblyBounds.getSize(new THREE.Vector3()).x/2;
    for(const group of groups){
      if(Math.abs(group.center.x)>halfLength*.45){
        assert.ok(group.target.x*group.center.x>0,`${group.id} retains its front/rear location`);
      }
    }
    updateVehicleExplosion(vehicle,.35,{inspect:true});
    updateVehicleExplosion(vehicle,1,{inspect:true});
    for(const entry of layout.entries)close(center(entry.object),fullCenters.get(entry),`${entry.id} is deterministic`);
    updateVehicleExplosion(vehicle,0,{inspect:true});
    for(const entry of layout.entries){
      close(entry.object.position,baseline.get(entry).position,`${entry.id} reassembles exactly`);
      close(center(entry.object),baseline.get(entry).center,`${entry.id} recovers its original placement`);
    }
  }finally{disposeVehicle(vehicle);}
});
