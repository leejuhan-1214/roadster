import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('AMG mixed chrome mesh keeps spokes on wheels and body badges on body',async()=>{
  const profile=VEHICLES.find(p=>p.id==='mercedes-benz-amg-gt'),gltf=await loadModelGeometry(profile);
  const original=gltf.scene.getObjectByName('Object_31'),count=original.geometry.index.count;
  const vehicle=adaptRealVehicle(gltf.scene,profile),parts=[...vehicle.detailParts.values()].filter(p=>p.name==='Object_31');
  assert.equal(parts.length,5,'the four spokes and the remaining body badges are separate assemblies');
  assert.equal(parts.reduce((n,p)=>n+p.geometry.index.count,0),count,'every source triangle is preserved once');
  for(const wheel of vehicle.wheels){
    const chrome=wheel.userData.spinGroup.getObjectByName('Object_31');
    assert.ok(chrome,'each tire rotates and explodes together with its original silver spokes');
    chrome.geometry.computeBoundingBox();
    const size=chrome.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(size.x>.45&&size.y>.45&&size.z<.1,'the complete thin spoke disc is present');
    const suspension=wheel.getObjectByName('Object_14');
    assert.equal(suspension.parent,wheel,'the suspension and steering links do not spin with the tire');
  }
  const badges=vehicle.parts.get('body').getObjectByName('Object_31');
  assert.ok(badges,'body emblems remain attached to the body');
  assert.ok(badges.geometry.boundingBox.getSize(new THREE.Vector3()).x>4,'both nose and tail badges survive');
});
