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
  assert.equal(cockpit.kind,'source');assert.equal(cockpit.modelId,id);assert.ok(cockpit.sourceMeshCount>=(id.startsWith('sd-')?3:16));assert.ok(cockpit.wheelMeshCount>=1);
  assert.ok(cockpit.wheelRadius>.11&&cockpit.wheelRadius<.34);assert.ok(cockpit.steeringAxis.x>.4);
  assert.ok(cockpit.seat.eye.x<cockpit.wheelCenter.x-.4);assert.ok(cockpit.seat.eye.y>cockpit.wheelCenter.y+.19);const rightHandDrive=['sd-trb1-vieringe-5rb','sd-trb1-spirit-rb1lt','sd-sc-lynx-220','sd-ls1-archer-r9'].includes(id);assert.ok(rightHandDrive?cockpit.seat.eye.z>.15:cockpit.seat.eye.z<-.15);
  assert.ok(cockpit.bodyBounds.containsPoint(cockpit.seat.eye),id+' driver eye stays inside body');
  const originals=new Map();vehicle.root.traverse(o=>{if(o.isMesh&&o.userData.kind==='model')originals.set(o.name,o);});
  let clonedGlass=0;cockpit.root.traverse(o=>{if(!o.isMesh||o.userData.instrumentOverlay)return;const original=originals.get(o.name);assert.ok(original);if(o.userData.ownedSourceGeometry){arraysEqual(o.geometry.attributes.position.array,original.geometry.attributes.position.array);assert.notEqual(o.geometry,original.geometry);}else assert.ok(sourceGeometry.has(o.geometry),'geometry remains the exact artist geometry');for(const m of Array.isArray(o.material)?o.material:[o.material]){assert.ok(!sourceMaterials.has(m),'clone owns its material');if(m.userData.cabinPane){clonedGlass++;assert.ok(m.transparent&&m.opacity<=.025);assert.ok(m.forceSinglePass);assert.equal(m.depthWrite,false);assert.equal(m.map,null);assert.ok(!/lamp|blink|brake|headlight|gauge/i.test(o.name),'preserve non-window lenses');}}});
  assert.ok(clonedGlass>0,'driver can see through original glazing');
  if(id==='sd-sc-fmc-gt4'||id==='sd-ls2-condor-c400r'){
    const wheelParts=cockpit.steering.children.map(mesh=>mesh.name);
    const rim=id==='sd-sc-fmc-gt4'?/^gt_steering_STEERRIM_/:/^gt_steering_STEERINGWH_/;
    assert.ok(wheelParts.some(name=>rim.test(name)),id+' uses its independently authored steering rim');
    assert.ok(wheelParts.every(name=>!/GLOVE|FORE|ARM|HAND/i.test(name)),id+' does not rotate avatar geometry');
  }
  if(id==='roadster'){const dash=cockpit.root.getObjectByName('roadster008_interior_0').material;assert.equal(dash.color.getHex(),0x15191c);assert.equal(dash.metalness,0);assert.equal(dash.roughness,.86);assert.ok(Math.abs(cockpit.wheelCenter.x-cockpit.seat.eye.x-.73)<1e-12);assert.equal(cockpit.mirrorSurface.name,'roadster011_mirror_0');assert.ok(cockpit.mirrorSurface.material.isMeshBasicMaterial);for(const value of cockpit.mirrorSurface.geometry.attributes.uv.array)assert.ok(value>=-1e-6&&value<=1.000001);}
  if(['roadster','tesla-model','lamborghini-revuelto'].includes(id)){assert.ok(cockpit.root.getObjectByName('driving telemetry display').userData.instrumentOverlay);assert.equal(typeof cockpit.update,'function');}
  if(id==='tesla-model'){
    assert.ok(cockpit.display);assert.equal(cockpit.display.meshName,'LCDs_LCDs0_0');assert.ok(cockpit.display.normal.x<-.9);
    assert.ok(cockpit.display.size.x>.3&&cockpit.display.size.x<.4);assert.ok(cockpit.display.size.y>.2&&cockpit.display.size.y<.3);
    assert.ok(new THREE.Vector3(0,0,1).applyQuaternion(cockpit.display.quaternion).distanceTo(cockpit.display.normal)<1e-12);
  }
  cockpit.root.updateMatrixWorld(true);
  const newSource=id==='mclaren-p1'||id==='lamborghini-revuelto';
  const gtRoadView=['sd-ls2-morley-r900','sd-sc-fmc-gt4'].includes(id);
  const pitches=newSource?[-.10,-.075,-.04,0,.04]:gtRoadView?[-.08,-.04,0,.04]:[cockpit.seat.pitch,0];
  const yaws=newSource?[-.23,-.14,-.10,0,.10,.14,.23]:gtRoadView?[-.14,-.07,0,.07,.14]:[-.10,0,.10];
  for(const pitch of pitches){
    for(const yaw of yaws){
      const direction=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),Math.cos(pitch)*Math.sin(yaw));
      const hits=new THREE.Raycaster(cockpit.seat.eye,direction,.03,4).intersectObject(cockpit.root,true);
      const materials=hits.map(h=>Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material);
      assert.ok(materials.some(m=>m.userData.cabinPane),id+' looks through its windscreen');
      assert.ok(materials.every(m=>m.transparent&&m.opacity<.1),id+' has a clear forward view at pitch '+pitch+' and yaw '+yaw);
    }
  }
  cockpit.root.updateMatrixWorld(true);const child=cockpit.steering.children[0],before=child.matrixWorld.clone();
  cockpit.steering.quaternion.setFromAxisAngle(cockpit.steeringAxis,.35);cockpit.root.updateMatrixWorld(true);
  assert.notDeepEqual(child.matrixWorld.elements,before.elements);
  for(const p of poses){assert.equal(p.o.parent,p.parent);assert.equal(p.o.visible,p.visible);assert.ok(p.o.position.equals(p.position));assert.ok(p.o.quaternion.equals(p.quaternion));}
  for(const m of materials){assert.equal(m.m.opacity,m.opacity);assert.equal(m.m.transparent,m.transparent);assert.equal(m.m.depthWrite,m.depthWrite);assert.equal(m.m.side,m.side);assert.equal(m.m.color?.getHex(),m.color);assert.equal(m.m.metalness,m.metalness);assert.equal(m.m.roughness,m.roughness);}
  let ownedDisposed=0;cockpit.mirrorSurface?.geometry.addEventListener('dispose',()=>ownedDisposed++);cockpit.dispose();if(SOURCE_COCKPITS[id].mirror)assert.equal(ownedDisposed,1);assert.equal(geometryDisposed,0,'source geometry survives cockpit disposal');assert.equal(cockpit.root.children.length,0);disposeVehicle(vehicle);
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

test('Roadster telemetry follows the drive and the panel sits on the original sloping console',async()=>{
  const {vehicle}=await source('roadster'),painted=[];
  const documentBefore=globalThis.document;
  const canvas={getContext:()=>({fillRect(){},fillText(value){painted.push(value);}})};
  let cockpit;
  try{
    globalThis.document={createElement:()=>canvas};
    cockpit=createSourceCockpit(vehicle);
  }finally{
    if(documentBefore===undefined)delete globalThis.document;else globalThis.document=documentBefore;
  }
  const screen=cockpit.root.getObjectByName('driving telemetry display');
  cockpit.root.updateMatrixWorld(true);
  const consoleMesh=cockpit.root.getObjectByName('roadster008_interior_0');
  const intoConsole=cockpit.display.normal.clone().negate();
  for(const x of [-.08,0,.08])for(const y of [-.125,0,.125]){
    const point=screen.localToWorld(new THREE.Vector3(x,y,0));
    const first=new THREE.Raycaster(point,intoConsole,0,.055).intersectObject(consoleMesh)[0];
    assert.ok(first,'panel stays above and within 5.5 cm of the model console');
  }
  await new Promise(resolve=>setTimeout(resolve,120));
  painted.length=0;
  cockpit.update({speed:72.6,gear:'D',powerKW:54.1,gasFraction:.816});
  for(const expected of ['D','73','54 kW','82%'])assert.ok(painted.includes(expected));
  const texture=screen.material.map;let released=0;
  texture.addEventListener('dispose',()=>released++);
  cockpit.dispose();assert.equal(released,1);disposeVehicle(vehicle);
});

test('material arrays preserve independent slots and shared textures on release',()=>{
  const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial(),map=new THREE.Texture(),glass=new THREE.MeshStandardMaterial({name:'Glass',map,opacity:.5});
  let textureDisposed=0;map.addEventListener('dispose',()=>textureDisposed++);
  const body=new THREE.Mesh(new THREE.BoxGeometry(4,1.5,2),[paint,glass]);body.name='body';body.userData.kind='model';root.add(body);
  const wheel=new THREE.Mesh(new THREE.TorusGeometry(.18,.02,8,32),paint);wheel.geometry.rotateY(Math.PI*.5);wheel.name='roadster014_Metal_-_Black_rough_0';wheel.position.set(.5,.1,-.4);wheel.userData.kind='model';root.add(wheel);
  const source=createSourceCockpit({profileId:'roadster',root,paintMaterials:[paint]});assert.ok(source);
  const cloned=source.root.getObjectByName('body');assert.equal(cloned.material.length,2);assert.notEqual(cloned.material[0],paint);assert.notEqual(cloned.material[1],glass);assert.equal(cloned.material[1].map,null);assert.equal(cloned.material[1].opacity,.02);assert.equal(cloned.material[0].transparent,paint.transparent);
  assert.equal(glass.opacity,.5);source.dispose();assert.equal(textureDisposed,0);assert.equal(glass.map,map);assert.equal(body.parent,root);
  body.geometry.dispose();wheel.geometry.dispose();paint.dispose();glass.dispose();map.dispose();
});
