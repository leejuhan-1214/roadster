import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SOURCE_COCKPITS,createSourceCockpit} from '../dist/js/source-cockpit.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {configureVehicleFit,updateVehicleExplosion} from '../dist/js/vehicle-fit.js';

async function source(id){const profile=VEHICLES.find(v=>v.id===id),gltf=await loadModelGeometry(profile);return {profile,vehicle:id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile)};}
const arraysEqual=(a,b)=>assert.deepEqual([...a],[...b]);

for(const id of Object.keys(SOURCE_COCKPITS))test(id+' preserves the artist cabin and rotates only the original steering wheel',async()=>{
  const {vehicle}=await source(id),sourceGeometry=new Set(),sourceMaterials=new Set(),poses=[];
  vehicle.root.traverse(o=>{if(!o.isMesh)return;sourceGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])sourceMaterials.add(m);poses.push({o,parent:o.parent,position:o.position.clone(),quaternion:o.quaternion.clone(),visible:o.visible});});
  const materials=[...sourceMaterials].map(m=>({m,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,color:m.color?.getHex(),metalness:m.metalness,roughness:m.roughness}));
  let geometryDisposed=0;for(const geometry of sourceGeometry)geometry.addEventListener('dispose',()=>geometryDisposed++);
  const cockpit=createSourceCockpit(vehicle);assert.ok(cockpit,id+' inspected source cabin exists');
  assert.equal(cockpit.kind,'source');assert.equal(cockpit.modelId,id);assert.ok(cockpit.sourceMeshCount>15);assert.ok(cockpit.wheelMeshCount>=1);
  assert.ok(cockpit.wheelRadius>.11&&cockpit.wheelRadius<.34);assert.ok(cockpit.steeringAxis.x>.4);
  assert.ok(cockpit.seat.eye.x<cockpit.wheelCenter.x-.4);assert.ok(cockpit.seat.eye.y>cockpit.wheelCenter.y+.19);assert.ok(cockpit.seat.eye.z<-.15);
  assert.ok(cockpit.bodyBounds.containsPoint(cockpit.seat.eye),id+' driver eye stays inside body');
  const originals=new Map();vehicle.root.traverse(o=>{if(o.isMesh&&o.userData.kind==='model')originals.set(o.name,o);});
  let clonedGlass=0;cockpit.root.traverse(o=>{if(!o.isMesh)return;const original=originals.get(o.name);assert.ok(original);if(o.userData.ownedSourceGeometry){arraysEqual(o.geometry.attributes.position.array,original.geometry.attributes.position.array);assert.notEqual(o.geometry,original.geometry);}else assert.ok(sourceGeometry.has(o.geometry),'geometry remains the exact artist geometry');for(const m of Array.isArray(o.material)?o.material:[o.material]){assert.ok(!sourceMaterials.has(m),'clone owns its material');if(m.transparent&&m.opacity===.075){clonedGlass++;assert.equal(m.depthWrite,false);}}});
  assert.ok(clonedGlass>0,'driver can see through original glazing');
  if(id==='roadster'){const dash=cockpit.root.getObjectByName('roadster008_interior_0').material;assert.equal(dash.color.getHex(),0x15191c);assert.equal(dash.metalness,0);assert.equal(dash.roughness,.86);assert.ok(Math.abs(cockpit.wheelCenter.x-cockpit.seat.eye.x-.78)<1e-12);assert.equal(cockpit.mirrorSurface.name,'roadster011_mirror_0');assert.ok(cockpit.mirrorSurface.material.isMeshBasicMaterial);for(const value of cockpit.mirrorSurface.geometry.attributes.uv.array)assert.ok(value>=-1e-6&&value<=1.000001);}
  if(id==='tesla-model'){
    assert.ok(cockpit.display);assert.equal(cockpit.display.meshName,'LCDs_LCDs0_0');assert.ok(cockpit.display.normal.x<-.9);
    assert.ok(cockpit.display.size.x>.3&&cockpit.display.size.x<.4);assert.ok(cockpit.display.size.y>.2&&cockpit.display.size.y<.3);
    assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(cockpit.display.quaternion).distanceTo(cockpit.display.normal)<1e-12);
  }
  if(['roadster','ferrari','ford-mustang','lamborghini-gallardo-lp560'].includes(id)){
    cockpit.root.updateMatrixWorld(true);
    for(const pitch of [cockpit.seat.pitch]){
      for(const yaw of (id==='roadster'?[-.12,0,.12]:[0])){
        const direction=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw));
        const hits=new THREE.Raycaster(cockpit.seat.eye,direction,.03,id==='roadster'?4:1.3).intersectObject(cockpit.root,true);
        assert.ok(hits.every(h=>h.object.material.transparent&&h.object.material.opacity<.1),'normal forward gaze sees through windscreen without hitting opaque cabin');
      }
    }
  }
  cockpit.root.updateMatrixWorld(true);const child=cockpit.steering.children[0],before=child.matrixWorld.clone();
  cockpit.steering.quaternion.setFromAxisAngle(cockpit.steeringAxis,.35);cockpit.root.updateMatrixWorld(true);
  assert.notDeepEqual(child.matrixWorld.elements,before.elements);
  for(const p of poses){assert.equal(p.o.parent,p.parent);assert.equal(p.o.visible,p.visible);assert.ok(p.o.position.equals(p.position));assert.ok(p.o.quaternion.equals(p.quaternion));}
  for(const m of materials){assert.equal(m.m.opacity,m.opacity);assert.equal(m.m.transparent,m.transparent);assert.equal(m.m.depthWrite,m.depthWrite);assert.equal(m.m.side,m.side);assert.equal(m.m.color?.getHex(),m.color);assert.equal(m.m.metalness,m.metalness);assert.equal(m.m.roughness,m.roughness);}
  let ownedDisposed=0;cockpit.mirrorSurface?.geometry.addEventListener('dispose',()=>ownedDisposed++);cockpit.dispose();if(id==='roadster')assert.equal(ownedDisposed,1);assert.equal(geometryDisposed,0,'source geometry survives cockpit disposal');assert.equal(cockpit.root.children.length,0);disposeVehicle(vehicle);
});

test('a cached exploded Roadster creates the same assembled cockpit without changing inspection',async()=>{
  const {vehicle,profile}=await source('roadster');configureVehicleFit(vehicle,profile);
  const a=createSourceCockpit(vehicle);assert.ok(a);a.root.updateMatrixWorld(true);
  const assembled=new Map();a.root.traverse(o=>{if(o.isMesh)assembled.set(o.name,[...o.matrixWorld.elements]);});
  updateVehicleExplosion(vehicle,.83,{inspect:true});const positions=vehicle.fitLayout.entries.map(e=>e.object.position.clone());
  const b=createSourceCockpit(vehicle);assert.ok(b);b.root.updateMatrixWorld(true);assert.ok(b.seat.eye.distanceTo(a.seat.eye)<1e-12);
  b.root.traverse(o=>{if(o.isMesh)arraysEqual(o.matrixWorld.elements,assembled.get(o.name));});
  vehicle.fitLayout.entries.forEach((e,i)=>assert.ok(e.object.position.equals(positions[i])));
  a.dispose();b.dispose();disposeVehicle(vehicle);
});

test('unreviewed exterior-only assets use the reference reconstruction',()=>{assert.equal(createSourceCockpit({profileId:'bmw'}),null);assert.equal(createSourceCockpit({profileId:'urus'}),null);});

test('material arrays preserve independent slots and shared textures on release',()=>{
  const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial(),map=new THREE.Texture(),glass=new THREE.MeshStandardMaterial({name:'Glass',map,opacity:.5});
  let textureDisposed=0;map.addEventListener('dispose',()=>textureDisposed++);
  const body=new THREE.Mesh(new THREE.BoxGeometry(4,1.5,2),[paint,glass]);body.name='body';body.userData.kind='model';root.add(body);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.18,.02,8,32),paint);wheel.geometry.rotateY(Math.PI*.5);wheel.name='roadster014_Metal_-_Black_rough_0';wheel.position.set(.5,.1,-.4);wheel.userData.kind='model';root.add(wheel);
  const source=createSourceCockpit({profileId:'roadster',root,paintMaterials:[paint]});assert.ok(source);
  const cloned=source.root.getObjectByName('body');assert.equal(cloned.material.length,2);assert.notEqual(cloned.material[0],paint);assert.notEqual(cloned.material[1],glass);assert.equal(cloned.material[1].map,map);assert.equal(cloned.material[1].opacity,.075);
  assert.equal(glass.opacity,.5);source.dispose();assert.equal(textureDisposed,0);assert.equal(glass.map,map);assert.equal(body.parent,root);
  body.geometry.dispose();wheel.geometry.dispose();paint.dispose();glass.dispose();map.dispose();
});
