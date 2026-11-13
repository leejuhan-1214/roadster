import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {prepareAssessmentVehicle,LANDING_APPARATUS} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
const groupBox=g=>g.entries.reduce((box,e)=>box.union(new THREE.Box3().setFromObject(e.object)),new THREE.Box3());

for(const profile of VEHICLES)test(profile.id+': assessment explosion is compact, separated and retains wheel corners',async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  try{
    prepareAssessmentVehicle(vehicle);configureVehicleFit(vehicle,profile);
    assert.deepEqual(vehicle.catalog.filter(e=>e.kind==='hypothesis').map(e=>e.id).sort(),[...LANDING_APPARATUS].sort());
    assert.equal(vehicle.fans.length,4,'the air-system diagram retains four independent suction fans');
    const layout=vehicle.fitLayout,groups=layout.logicalGroups;
    assert.ok(groups.length>=8&&groups.length<=20,'anatomical assemblies, not a material-fragment cloud');
    const size=vehicle.explosionBounds.getSize(new THREE.Vector3()),base=vehicle.assemblyBounds.getSize(new THREE.Vector3());
    assert.ok(size.x<base.x*2.3,'length remains recognizably related to the car');
    assert.ok(size.y<7,'avoid a tall stack of source material fragments');
    assert.ok(size.z<base.z*3.2,'sideways spread stays compact');
    updateNozzleCovers(vehicle,[],true);updateVehicleExplosion(vehicle,1,{inspect:true});
    const boxes=groups.map(groupBox);
    for(let i=0;i<groups.length;i++){
      assert.ok(boxes[i].min.y>=.14,'all components clear the floor');
      for(let j=i+1;j<groups.length;j++)assert.equal(boxes[i].intersectsBox(boxes[j]),false,groups[i].id+' overlaps '+groups[j].id);
    }
    // Sample the complete animation densely: pairs starting apart must not pass
    // through one another while other fitted pairs detach from assembly contact.
    for(let step=1;step<40;step++){
      const t=step/40;
      for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
        const a=groups[i],b=groups[j];if(a.bounds.intersectsBox(b.bounds))continue;
        assert.equal(a.bounds.clone().translate(a.delta.clone().multiplyScalar(t)).intersectsBox(b.bounds.clone().translate(b.delta.clone().multiplyScalar(t))),false,a.id+' crosses '+b.id+' at '+t);
      }
    }
    for(const g of groups.filter(g=>g.wheelIndex>=0)){
      assert.ok(g.target.x*(g.wheelIndex<2?1:-1)>0);assert.ok(g.target.z*(g.wheelIndex%2?1:-1)>0);
      assert.ok(Math.abs(g.delta.y-layout.groundLift)<1e-8,'wheels retain one axle plane');
    }
    updateVehicleExplosion(vehicle,0,{inspect:true});
    for(const e of layout.entries)assert.ok(e.object.position.distanceTo(e.basePosition)<1e-8,'exact reassembly');
  }finally{disposeVehicle(vehicle);}
});
