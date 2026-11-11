import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';

const corrected={
  'ferrari-f40':'material','lamborghini-countach-lp500s':'CARO',
  'lamborghini-gallardo-lp560':'gallardo_paint','land-rover-range-rover-velar':'MeshesrangeRoverVelarobject0001Mtl',
  'nissan-proto':'Material.001','audi-a1':'bodyh','audi-a3':'paint','audi-tt':'varnish',
  'aston-martin-db11':'amdb11','dodge-challenger':'Carosserie','honda-cr-v':'paintBlue',
  'hyundai-i30':'paint','kia-sportage':'material','mini-countryman':'varnish',
  'nissan-sentra':'wire_008008136_3','peugeot-206':'body__prim_env_4_spec',
  'renault-clio':'Carroserie','renault-duster':'varnish','toyota-prius':'Color.002',
  'land-rover-defender':'Material.002','toyota-ae86':'Material.001','chevrolet-camaro':'Meshpart6Mtl',
};

for(const profile of VEHICLES)test(profile.id+': color controls reach the body while preserving trim and wheel materials',async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  const paint=new Set(vehicle.paintMaterials),paintedMeshes=[],untouched=new Map(),bounds=new THREE.Box3();
  assert.ok(paint.size>0,'body paint must be selectable');
  vehicle.root.updateMatrixWorld(true);
  vehicle.root.traverse(object=>{
    if(!object.isMesh)return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const painted=materials.some(m=>paint.has(m));
    if(painted){
      paintedMeshes.push(object);
      bounds.union(new THREE.Box3().setFromObject(object));
      for(let n=object;n;n=n.parent)assert.ok(!vehicle.wheels.includes(n),'road wheel must retain original material: '+object.name);
      assert.doesNotMatch(object.name,/steer|driving_wheel|pedal|seat|interior|cockpit|carpet/i,'interior parts must retain original material');
      for(const m of materials)if(paint.has(m))assert.doesNotMatch(m.name,/glass|windscreen|windshield/i);
    }
    for(const m of materials)if(!paint.has(m)&&m.color)untouched.set(m,m.color.clone());
  });
  const size=bounds.getSize(new THREE.Vector3());
  const length=profile.length||4.6,width=profile.width||1.9;
  assert.ok(size.x>=length*.50,'paint must cover body length, not a small rim or trim: '+size.x);
  assert.ok(size.z>=width*.50,'paint must cover body width, not a thin trim strip: '+size.z);
  if(corrected[profile.id])assert.ok([...paint].some(m=>m.name===corrected[profile.id]),'verified exterior material is missing');
  if(profile.id==='lamborghini-urus')assert.deepEqual(paintedMeshes.map(m=>m.name),['yellow_body_0'],'shared black/chrome/body atlas variants must remain separate');
  if(profile.id==='volkswagen-beetle')assert.deepEqual(paintedMeshes.map(m=>m.name),['base_lp_lambert1_0'],'luggage, seats and mirrors share the atlas but are not body paint');
  if(profile.id==='fiat-uno')assert.ok(paintedMeshes.every(m=>/^(chassis\d*|capo|porta_malas|grade_frontal_cor|tanque)__0$/.test(m.name)),'one shared material must be split by actual painted exterior object');
  for(const color of ['#2479da','#f0f2f3','#b51627']){
    const target=new THREE.Color(color);
    for(const material of paint)material.color.set(color);
    for(const material of paint)assert.ok(material.color.equals(target));
    for(const [material,original]of untouched)assert.ok(material.color.equals(original),'paint must not leak through a shared material cache');
  }
  disposeVehicle(vehicle);
});
