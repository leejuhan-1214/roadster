import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicle} from '../dist/js/vehicle.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit,updateVehicleExplosion} from '../dist/js/vehicle-fit.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('ambient compressor and four suction rotors are separate functional diagrams',()=>{
  const v=createVehicle();
  try{
    assert.equal(v.fans.length,4);
    assert.equal(v.compressor.parent,v.tank);
    assert.equal(v.compressor.userData.schematic,true);
    assert.ok(v.compressor.getObjectByName('ambient inlet filter'));
    assert.ok(v.compressor.getObjectByName('tank inlet check valve'));
    assert.ok(v.compressor.getObjectByName('intercooler and aftercooler schematic'));
    for(let i=1;i<=4;i++)assert.ok(v.compressor.getObjectByName('compression stage '+i));
    assert.ok(v.compressor.userData.statusLight.material.emissive);
    for(const fan of v.fans){
      const housingQuaternion=fan.quaternion.clone();
      assert.equal(fan.userData.rotor.parent,fan);
      assert.equal(fan.userData.intake.parent,fan);
      fan.userData.rotor.rotation.x=1.7;
      assert.ok(fan.quaternion.equals(housingQuaternion),'housing does not spin with the rotor');
    }
  }finally{disposeVehicle(v);}
});

for(const profile of VEHICLES.filter(p=>['roadster','bmw','tesla-cybertruck'].includes(p.id))){
  test(profile.id+': air diagrams survive assessment preparation and fit the source envelope',async()=>{
    const gltf=await loadModelGeometry(profile);
    const v=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
    try{
      prepareAssessmentVehicle(v);configureVehicleFit(v,profile);
      assert.equal(v.fans.length,4);assert.equal(v.compressor.parent,v.tank);
      assert.equal(v.tank.parent,v.root);
      const envelope=v.nozzleFit.skinBounds.clone().expandByScalar(.001);
      const fans=v.fans.map(f=>new THREE.Box3().setFromObject(f));
      for(const box of fans)assert.ok(envelope.containsBox(box),'fan/duct stays within source bounds');
      assert.ok(envelope.containsBox(new THREE.Box3().setFromObject(v.tank)),'tank/compressor diagram stays within source bounds');
      for(let i=0;i<fans.length;i++)for(let j=i+1;j<fans.length;j++)assert.equal(fans[i].intersectsBox(fans[j]),false,'separate rear fan ducts');
      const position=v.tank.position.clone(),scale=v.tank.scale.clone();
      updateVehicleExplosion(v,1,{inspect:true});updateVehicleExplosion(v,0,{inspect:true});
      assert.ok(v.tank.position.distanceTo(position)<1e-8);assert.ok(v.tank.scale.equals(scale));
      assert.ok(v.catalog.find(e=>e.id==='tank').title.includes('압축기'));
      assert.ok(v.catalog.find(e=>e.id==='thrusters').title.includes('흡입 팬'));
    }finally{disposeVehicle(v);}
  });
}
