import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { adaptRoadsterScene } from '../dist/js/roadster-model.js';
import { createVehicle } from '../dist/js/vehicle.js';

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

test('the nine invented educational assemblies remain explicit and preserve simulation references', () => {
  const hypotheses = vehicle.catalog.filter(entry => entry.kind === 'hypothesis');
  assert.deepEqual(hypotheses.map(entry => entry.id).sort(), ['battery', 'drive-front', 'drive-rear-left', 'drive-rear-right', 'power-electronics', 'suspension', 'tank', 'thrusters', 'wing']);
  for (const entry of hypotheses) {
    assert.equal(vehicle.detailParts.get(entry.id), vehicle.parts.get(entry.id));
    assert.equal(entry.category, 'hypothesis');
    assert.match(entry.title, /가정/);
    assert.equal(entry.sourceUrl, '');
    assert.ok(vehicle.parts.get(entry.id).userData.hypothetical);
  }
  assert.equal(vehicle.wing, vehicle.parts.get('wing'));
  assert.equal(vehicle.tank, vehicle.parts.get('tank'));
  assert.equal(vehicle.battery, vehicle.parts.get('battery'));
  const rearGlass = vehicle.catalog.find(entry => entry.sourceObjectName === 'roadster.046');
  assert.equal(vehicle.detailParts.get(rearGlass.id).parent, vehicle.parts.get('body'));
});
