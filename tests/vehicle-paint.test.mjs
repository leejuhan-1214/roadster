import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PAINT_OVERRIDES} from '../dist/js/vehicle-paint-profiles.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {prepareVehiclePaint,copyVehiclePaint,vehiclePaintRule} from '../dist/js/vehicle-paint.js';

const compile=material=>{const shader={uniforms:{},fragmentShader:'#include <map_fragment>\n#include <color_fragment>'};material.onBeforeCompile(shader);return shader;};
test('textured paint replaces the baked pigment while keeping original textures and shader uniforms independent',()=>{
  const texture=new THREE.DataTexture(new Uint8Array([220,30,20,255,180,24,15,255,210,26,17,255,220,30,20,255]),2,2);texture.colorSpace=THREE.SRGBColorSpace;
  const original=new THREE.MeshStandardMaterial({color:0xffffff,map:texture});
  const painted=prepareVehiclePaint(original.clone(),{mode:'surface'});painted.color.set('#426bea');const first=compile(painted);
  assert.equal(painted.map,texture);assert.deepEqual(first.uniforms.vehiclePaintBase.value.toArray(),[1,1,1]);
  assert.ok(first.uniforms.vehiclePaintReference.value>.35&&first.uniforms.vehiclePaintReference.value<.8);
  const cabin=copyVehiclePaint(painted,painted.clone());cabin.color.set('#eeeeee');const second=compile(cabin);
  assert.notEqual(first.uniforms.vehiclePaintBase.value,second.uniforms.vehiclePaintBase.value);
  assert.equal(cabin.customProgramCacheKey(),painted.customProgramCacheKey());
  assert.deepEqual(original.color.toArray(),[1,1,1]);assert.notEqual(cabin.color.getHex(),painted.color.getHex());
  assert.ok(second.fragmentShader.indexOf('vehicleSelectedColor')<second.fragmentShader.indexOf('#include <map_fragment>'));
  assert.ok(second.fragmentShader.includes('mix(vehicleSourceColor,vehicleSelectedColor*vehicleShade,vehicleMask)'));
});
test('shared atlas keeps original base color and selective mask when the selected paint changes',()=>{
  const material=prepareVehiclePaint(new THREE.MeshStandardMaterial({color:0xeeeedd}),{mode:'atlas',sourceColors:['#7aa9bb','#dd9da9'],sourceColor:'#7aa9bb'});
  const before=compile(material);material.color.set('#111111');const after=compile(material);
  assert.equal(after.uniforms.vehiclePaintAtlas.value,1);assert.deepEqual(before.uniforms.vehiclePaintBase.value.toArray(),after.uniforms.vehiclePaintBase.value.toArray());
  assert.equal(after.uniforms.vehiclePaintColors.value.length,4);assert.equal(material.opacity,1);assert.equal(material.transparent,false);
});
test('painted and unpainted meshes sharing an artist material are selected independently',()=>{
 const material=new THREE.MeshStandardMaterial({name:'body'}),profile={id:'lamborghini-urus',paintMaterials:['body']};
 assert.ok(vehiclePaintRule(profile,{name:'yellow_body_0'},material));
 for(const name of ['silver_body_0','gloss_black_body_0','matt_black_body_0'])assert.equal(vehiclePaintRule(profile,{name},material),null);
 assert.equal(vehiclePaintRule(profile,{name:'yellow_body_0'},material,true),null);
});

test('shared grayscale texture restricts new paint to body UVs, not window or lamp palettes',()=>{
 const mat=prepareVehiclePaint(new THREE.MeshStandardMaterial({map:new THREE.Texture()}),{mode:'surface',uvRects:[[.11,.11,1,1]],sourceColor:'#555555'});
 const shader=compile(mat),r=shader.uniforms.vehiclePaintUV.value[0];
 const selected=([u,v])=>u>=r.x&&v>=r.y&&u<=r.z&&v<=r.w;
 assert.equal(shader.uniforms.vehiclePaintUseUV.value,1);
 assert.ok(selected([.46,.376]));assert.equal(selected([.38,.05]),false);assert.equal(selected([.04,.05]),false);
});

test('every explicit paint correction points to an existing selectable vehicle',()=>{
 const ids=new Set(VEHICLES.map(p=>p.id));for(const id of Object.keys(PAINT_OVERRIDES))assert.ok(ids.has(id),id);
});
