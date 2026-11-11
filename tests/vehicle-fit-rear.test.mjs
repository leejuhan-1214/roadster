import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CITY_VEHICLES} from '../dist/js/city-fleet-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('CR-V rear ports avoid the bumper opening that exposes the front shell',async()=>{
  const profile=CITY_VEHICLES.find(p=>p.id==='honda-cr-v');
  const source=await loadModelGeometry(profile),vehicle=adaptRealVehicle(source.scene,profile);
  const params=configureVehicleFit(vehicle,profile),fit=vehicle.nozzleFit;
  const rearLimit=fit.skinBounds.min.x+(fit.skinBounds.max.x-fit.skinBounds.min.x)*.35;
  assert.ok(params.boostX<rearLimit,'boost force stays in the rear third rather than beyond the nose');
  assert.ok(Math.abs(vehicle.jetMounts[4].pos.z+vehicle.jetMounts[5].pos.z)<1e-9,'paired force points remain symmetric');
  for(let i=0;i<2;i++){
    const surface=fit.rearSurfaces[i];
    assert.ok(surface[0]<rearLimit,'actual sampled skin is at the rear');
    const bell=vehicle.root.getObjectByName('body fitted rear nozzle '+i);
    const bounds=new THREE.Box3().setFromObject(bell);
    assert.ok(bounds.min.x>surface[0]+.005,'bell remains recessed behind the actual bumper surface');
    assert.ok(bounds.max.x<rearLimit,'entire bell remains at the rear');
    assert.ok(Math.abs(surface[2])<.4,'the paired ports move inboard to avoid the rear opening');
  }
  disposeVehicle(vehicle);source.scene.traverse(o=>o.geometry?.dispose());
});
