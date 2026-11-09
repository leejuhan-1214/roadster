import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {matchesSource} from '../dist/js/model-geometry.js';
import {tireAxle} from '../dist/js/wheel-alignment.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

for(const profile of VEHICLES)test(profile.id+': real tire axes agree with rotating hubs',async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  for(const wheel of vehicle.wheels){
    const tires=wheel.userData.spinGroup.children.filter(object=>profile.adapter?matchesSource(object,profile.adapter,'tire'):
      /tire|tyre|Thread|Sidewall/i.test((Array.isArray(object.material)?object.material:[object.material]).map(m=>m.name).join(' ')+object.name));
    assert.ok(tires.length>0,'the actual tire mesh must be identified, not rim geometry');
    const geometries=tires.map(o=>o.geometry),axis=tireAxle(geometries);
    assert.ok(axis,'a nondegenerate tire has a measurable axle');
    assert.ok(axis.angleTo(new THREE.Vector3(0,0,1))<.011,'parked steering or camber would cause wobble around the simulated Z axle');
    // Check the transformed axle through a complete rolling cycle. A skewed
    // source axle would sweep a cone instead of staying coaxial with the hub.
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const rotated=axis.clone().applyAxisAngle(new THREE.Vector3(0,0,1),angle);
      assert.ok(rotated.angleTo(new THREE.Vector3(0,0,1))<.011);
    }
  }
});
