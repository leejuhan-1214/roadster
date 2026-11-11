import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('Urus transmission export keeps the painted shell opaque and glazing transparent',async()=>{
 const profile=vehicleProfile('lamborghini-urus'),gltf=await loadModelGeometry(profile);
 // Geometry-only test loader omits physical-material extensions; reproduce the
 // source GLB's transmissionFactor:1 on its body and glass materials.
 gltf.scene.traverse(o=>{if(o.isMesh){const convert=m=>['body','glass'].includes(m.name)?new THREE.MeshPhysicalMaterial({name:m.name,transmission:1,transparent:true}):m;o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}});
 const source=[];gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])source.push([m,m.opacity,m.transparent,m.transmission]);});
 const vehicle=adaptRealVehicle(gltf.scene,profile);
 try{
  assert.ok(vehicle.paintMaterials.length>0);for(const m of vehicle.paintMaterials){assert.equal(m.name,'body');assert.equal(m.opacity,1);assert.equal(m.transparent,false);assert.equal(m.depthWrite,true);assert.equal(m.transmission,0);}
  const glass=[];vehicle.root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.name==='glass')glass.push(m);});
  assert.ok(glass.length>0);assert.ok(glass.every(m=>m.transparent&&m.opacity<1));
  for(const [m,opacity,transparent,transmission]of source){assert.equal(m.opacity,opacity);assert.equal(m.transparent,transparent);assert.equal(m.transmission,transmission);}
 }finally{disposeVehicle(vehicle);}
});
