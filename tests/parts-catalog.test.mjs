import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { adaptRoadsterScene } from '../dist/js/roadster-model.js';
import { installRoadsterDisplayLod } from '../dist/js/roadster-display-lod.js';
import { createVehicle } from '../dist/js/vehicle.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';

// Load the actual licensed model and binary geometry. Only image-backed materials
// are replaced, since these Node tests intentionally do not create a DOM/WebGL.
let vehicle, gltf, document;
before(async () => {
  const asset = new URL('../dist/assets/tesla-roadster-2020/', import.meta.url);
  document = JSON.parse(await readFile(new URL('scene.gltf', asset), 'utf8'));
  const fixture = structuredClone(document);
  for (const buffer of fixture.buffers) {
    buffer.uri = `data:application/octet-stream;base64,${(await readFile(new URL(buffer.uri, asset))).toString('base64')}`;
  }
  if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class extends Event {
    constructor(type, init = {}) { super(type); Object.assign(this, init); }
  };
  const loader = new GLTFLoader().register(() => ({
    name: 'node-material-fixture',
    loadMaterial: index => Promise.resolve(new THREE.MeshStandardMaterial({ name: fixture.materials[index].name })),
  }));
  gltf = await loader.parseAsync(JSON.stringify(fixture), '');
  vehicle = adaptRoadsterScene(gltf.scene, createVehicle(), gltf.parser);
});

test('assembled batches preserve every reduced triangle, attribute, material and wheel pivot',async t=>{
  const bytes=await readFile(new URL('../dist/assets/tesla-roadster-2020/exterior-indices.bin',import.meta.url));
  installRoadsterDisplayLod(vehicle,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const source=[...vehicle.detailParts.values()].filter(mesh=>mesh.userData.kind==='model')
    .map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,parent:mesh.parent,layers:mesh.layers.mask}));
  assert.equal(source.length,105);
  assert.equal(source.reduce((sum,{geometry})=>sum+geometry.index.count/3,0),608850);
  const originalIndices=new Map();
  for(let i=0;i<bytes.readUInt32LE(4);i++){
    const entry=8+24*i,length=bytes.readUInt32LE(entry+12),width=bytes.readUInt32LE(entry+16),start=bytes.readUInt32LE(entry+20);
    const indices=Array.from({length},(_,j)=>bytes.readUIntLE(start+j*width,width));
    originalIndices.set(bytes.readUInt32LE(entry),indices);
  }
  // Compare the actual submitted triangles, including all UVs, normals and
  // tangents. Artist submeshes with one material/pivot keep their draw order.
  function fingerprints(draws,expected){
    const hashes=new Map();
    for(const {mesh} of draws){
      const geometry=mesh.geometry,attributes=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b));
      const key=[mesh.parent.id,mesh.material.id,...attributes.map(([n])=>n)].join('|');
      if(!hashes.has(key))hashes.set(key,createHash('sha256'));
      const indices=expected&&originalIndices.get(mesh.userData.sourceMeshIndex)||geometry.index.array;
      const size=attributes.reduce((s,[,a])=>s+a.itemSize,0);
      const data=new Float32Array(size*indices.length);
      let target=0;
      for(const vertex of indices)for(const [,a] of attributes)
        for(let c=0;c<a.itemSize;c++)data[target++]=a.array[vertex*a.itemSize+c];
      hashes.get(key).update(Buffer.from(data.buffer));
    }
    return new Map([...hashes].map(([key,h])=>[key,h.digest('hex')]));
  }
  const expected=fingerprints(source,true);
  vehicle.setExteriorDisplayLod(true);
  try{
    const drawn=source.filter(({mesh})=>mesh.layers.isEnabled(0));
    assert.equal(drawn.reduce((sum,{mesh})=>sum+mesh.geometry.index.count/3,0),48592);
    assert.deepEqual(fingerprints(drawn,false),expected);
    assert.ok(drawn.length<=70);
    t.diagnostic('assembled source draws '+source.length+' → '+drawn.length);
    for(const {mesh,material,parent} of source){
      assert.equal(mesh.material,material);assert.equal(mesh.parent,parent);
      if(material.transparent)assert.ok(mesh.layers.isEnabled(0),'glass retains independent sorting');
    }
  }finally{vehicle.setExteriorDisplayLod(false);}
  for(const {mesh,geometry,layers} of source){
    assert.equal(mesh.geometry,geometry);assert.equal(mesh.layers.mask,layers);
  }
});

test('cached batches restore part visibility and dispose active and inactive geometry exactly once',async()=>{
  const bytes=await readFile(new URL('../dist/assets/tesla-roadster-2020/exterior-indices.bin',import.meta.url));
  for(const active of [false,true]){
    const model=adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser);
    const parts=[...model.detailParts.values()].filter(mesh=>mesh.userData.kind==='model');
    const originals=new Map(parts.map(mesh=>[mesh,mesh.geometry]));
    const geometry=new Set(originals.values());
    installRoadsterDisplayLod(model,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    model.setExteriorDisplayLod(true);
    const packed=parts.find(mesh=>mesh.layers.isEnabled(0)&&mesh.geometry.attributes.position!==originals.get(mesh).attributes.position);
    assert.ok(packed);
    for(const mesh of parts)geometry.add(mesh.geometry);
    const skipped=parts.find(mesh=>!mesh.layers.isEnabled(0));
    skipped.visible=false;
    model.setExteriorDisplayLod(false);
    assert.equal(skipped.visible,false,'inspection visibility survives switching geometry');
    assert.ok(skipped.layers.isEnabled(0));
    model.setExteriorDisplayLod(active);
    const releases=new Map([...geometry].map(g=>[g,0]));
    for(const g of geometry)g.addEventListener('dispose',()=>releases.set(g,releases.get(g)+1));
    disposeVehicle(model);
    assert.ok([...releases.values()].every(n=>n===1));
  }
});

test('every original Roadster mesh has a stable selectable entry without inventing a vehicle BOM', () => {
  assert.equal(document.meshes.length, 105);
  assert.equal(vehicle.sourceMeshCount, 105);
  assert.equal(vehicle.sourceObjectCount, 85);
  assert.equal(vehicle.parts.size, 15);
  assert.equal(vehicle.detailParts.size, 114);
  assert.equal(vehicle.catalog.length, 114);
  const models = vehicle.catalog.filter(entry => entry.kind === 'model');
  assert.equal(models.length, 105);
  assert.equal(new Set(models.map(entry => entry.sourceObjectKey)).size, 85);
  for (let index = 0; index < document.meshes.length; index++) {
    const id = `model-${String(index).padStart(3, '0')}`;
    const entry = models.find(item => item.id === id), mesh = vehicle.detailParts.get(id);
    assert.ok(entry && mesh?.isMesh, `missing source mesh ${index}`);
    assert.equal(mesh.userData.partId, id);
    assert.equal(entry.sourceName, document.meshes[index].name);
    assert.deepEqual(entry.materialNames, document.meshes[index].primitives.map(p => document.materials[p.material].name));
    assert.ok(entry.sourceAncestry.length > 0);
    assert.match(entry.geometryNote, /시각 메시/);
    assert.match(entry.geometryNote, /전수 부품목록이 아닙니다/);
  }
  vehicle.root.traverse(object => {
    if (object.isMesh) assert.ok(vehicle.detailParts.has(object.userData.partId), `unselectable ${object.name}`);
  });
});

test('material surfaces from each of the 85 original objects explode together and restore exactly', () => {
  const objects = new Map();
  for (const entry of vehicle.catalog.filter(item => item.kind === 'model')) {
    const mesh = vehicle.detailParts.get(entry.id), data = mesh.userData;
    assert.ok(data.basePosition.isVector3 && data.explodeOffset.isVector3);
    assert.notEqual(mesh.position, data.basePosition);
    assert.ok([...data.basePosition.toArray(), ...data.explodeOffset.toArray()].every(Number.isFinite));
    const [start, end] = data.explodeStage;
    assert.ok(start >= 0 && end <= 1 && end > start);
    const original = objects.get(data.sourceObjectKey);
    if (original) {
      assert.deepEqual(data.explodeOffset.toArray(), original.explodeOffset.toArray());
      assert.deepEqual(data.explodeStage, original.explodeStage);
      assert.equal(mesh.parent, original.parent, 'one artist object must not split across moving assemblies');
    } else objects.set(data.sourceObjectKey, { ...data, parent: mesh.parent });
    const geometry = mesh.geometry.getAttribute('position').array.slice();
    mesh.position.copy(data.basePosition).add(data.explodeOffset);
    mesh.position.copy(data.basePosition);
    assert.ok(mesh.position.equals(data.basePosition));
    assert.deepEqual(mesh.geometry.getAttribute('position').array, geometry);
  }
});

test('each wheel retains rotating tire/rim/disc surfaces and a non-spinning caliper', () => {
  for (const wheel of vehicle.wheels) {
    const spin = wheel.userData.spinGroup;
    const spinMeshes = spin.children.filter(object => object.isMesh);
    assert.equal(spinMeshes.length, 6);
    const discs = spinMeshes.filter(mesh => mesh.userData.materialNames.includes('Brake_Disc'));
    const calipers = wheel.children.filter(mesh => mesh.isMesh && mesh.userData.materialNames.includes('calipers'));
    assert.equal(discs.length, 1);
    assert.equal(calipers.length, 1);
    assert.ok(spinMeshes.some(mesh => mesh.userData.materialNames.includes('Rims')));
    assert.ok(spinMeshes.some(mesh => mesh.userData.materialNames.includes('Thread')));
    assert.ok(spinMeshes.some(mesh => mesh.userData.materialNames.includes('Sidewall')));
    vehicle.root.updateMatrixWorld(true);
    const discBefore = discs[0].getWorldQuaternion(new THREE.Quaternion());
    const caliperBefore = calipers[0].getWorldQuaternion(new THREE.Quaternion());
    spin.rotation.z += .8;
    vehicle.root.updateMatrixWorld(true);
    assert.ok(discs[0].getWorldQuaternion(new THREE.Quaternion()).angleTo(discBefore) > .79);
    assert.ok(calipers[0].getWorldQuaternion(new THREE.Quaternion()).angleTo(caliperBefore) < 1e-7);
    spin.rotation.z = 0;
  }
});

test('generated sections distinguish the concept powertrain from experimental equipment and retain simulation references', () => {
  const educational = vehicle.catalog.filter(entry => entry.kind !== 'model');
  assert.deepEqual(educational.map(entry => entry.id).sort(), ['battery', 'drive-front', 'drive-rear-left', 'drive-rear-right', 'power-electronics', 'suspension', 'tank', 'thrusters', 'wing']);
  for (const entry of educational) {
    assert.equal(vehicle.detailParts.get(entry.id), vehicle.parts.get(entry.id));
    const reference=vehicle.parts.get(entry.id).userData.powertrainSection===true;
    assert.equal(entry.category,reference?'powertrain':'hypothesis');
    assert.equal(entry.kind,reference?'reference':'hypothesis');
    assert.match(entry.title, /가정|단면/);
    if(vehicle.parts.get(entry.id).userData.powertrainSection)assert.match(entry.sourceUrl,/petersen\.org/);
    else if(entry.id!=='suspension')assert.equal(entry.sourceUrl,'');
    assert.equal(vehicle.parts.get(entry.id).userData.hypothetical,!reference);
  }
  assert.equal(vehicle.wing, vehicle.parts.get('wing'));
  assert.equal(vehicle.tank, vehicle.parts.get('tank'));
  assert.equal(vehicle.battery, vehicle.parts.get('battery'));
  const rearGlass = vehicle.catalog.find(entry => entry.sourceObjectName === 'roadster.046');
  assert.equal(vehicle.detailParts.get(rearGlass.id).parent, vehicle.parts.get('body'));
});
