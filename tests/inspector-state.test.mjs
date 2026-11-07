import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FlightScene, isObjectVisible, updateDetailExplosion } from '../dist/js/scene.js';

// Exercise scene-state contracts without needing a DOM or WebGL context.
function inspector() {
  const view = Object.create(FlightScene.prototype);
  const root = new THREE.Group(), exterior = new THREE.Group(), wheel = new THREE.Group();
  root.add(exterior, wheel);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(.2, .6, .6));
  const tank = new THREE.Group();
  tank.add(new THREE.Mesh(new THREE.SphereGeometry(.3)));
  exterior.add(body); wheel.add(rim); root.add(tank);
  const detailParts = new Map([['model-000', body], ['model-001', rim], ['tank', tank]]);
  Object.assign(view, {
    vehicle: { root, parts: new Map([['body', exterior], ['wheel-fl', wheel], ['tank', tank]]), detailParts,
      catalog: [{id:'model-000',kind:'model'}, {id:'model-001',kind:'model'}, {id:'tank',kind:'hypothesis'}] },
    hiddenParts: new Set(), isolatedPartId: null, showHypotheses: false,
    mode: 'inspect', controls: {}, selectedBox: new THREE.BoxHelper(), selectedPart: null,
  });
  view.applyInspectorVisibility();
  return {view, body, rim, tank, exterior, wheel};
}

test('inspector hides unverified apparatus by default and restores all geometry for driving', () => {
  const {view, body, rim, tank} = inspector();
  assert.ok(body.visible && rim.visible);
  assert.equal(tank.visible, false);
  view.togglePartVisibility('model-000');
  assert.equal(body.visible, false);
  view.isolatePart('model-001');
  view.setMode('drive');
  assert.ok(body.visible && rim.visible && tank.visible);
  assert.equal(view.selectedPart, null);
  assert.equal(view.selectedBox.visible, false);
  view.setMode('inspect');
  assert.equal(body.visible, false);
  assert.equal(tank.visible, false);
  assert.equal(rim.visible, true);
});

test('focusing another detail moves isolation and unhides the target without moving its assembly', () => {
  const {view, body, rim, exterior} = inspector();
  view.isolatePart('model-000');
  view.togglePartVisibility('model-001');
  const assemblyPosition = exterior.position.clone();
  view.focusPart('model-001');
  assert.equal(view.selectedPart, rim);
  assert.equal(view.selectedPartId, 'model-001');
  assert.equal(view.isolatedPartId, 'model-001');
  assert.equal(view.hiddenParts.has('model-001'), false);
  assert.equal(body.visible, false);
  assert.equal(rim.visible, true);
  assert.ok(view.selectedBox.visible);
  assert.deepEqual(exterior.position, assemblyPosition);
  view.focusPart(null);
  assert.equal(view.selectedPart, null);
  assert.equal(view.selectedBox.visible, false);
});

test('hypothesis isolation cannot strand an empty view after the hypothesis filter is disabled', () => {
  const {view, body, rim, tank} = inspector();
  view.setHypothesesVisible(true);
  view.isolatePart('tank');
  assert.ok(tank.visible);
  assert.equal(body.visible, false);
  view.setHypothesesVisible(false);
  assert.equal(view.isolatedPartId, null);
  assert.equal(tank.visible, false);
  assert.ok(body.visible && rim.visible);
  view.togglePartVisibility('model-000');
  view.restoreParts();
  assert.equal(view.hiddenParts.size, 0);
  assert.ok(body.visible && rim.visible);
  assert.equal(tank.visible, false);
});

test('hidden parents exclude otherwise visible children from inspector picking', () => {
  const {view, body, exterior} = inspector();
  assert.ok(isObjectVisible(body));
  exterior.visible = false;
  assert.equal(body.visible, true);
  assert.equal(isObjectVisible(body), false);
  exterior.visible = true;
  view.vehicle.root.visible = false;
  assert.equal(isObjectVisible(body), false);
  view.vehicle.root.visible = true;
  assert.ok(isObjectVisible(body));
});

test('detail explosion is absolute, staged, reversible, and does not apply twice to shared apparatus', () => {
  const {view, body, rim, tank} = inspector();
  for (const part of [body, rim]) {
    part.userData.basePosition = new THREE.Vector3(.1, .2, .3);
    part.userData.explodeOffset = new THREE.Vector3(.5, .75, -.4);
    part.userData.explodeStage = [.25, .75];
  }
  tank.position.set(7, 8, 9);
  tank.userData.basePosition = new THREE.Vector3();
  tank.userData.explodeOffset = new THREE.Vector3(10, 10, 10);
  const tankPosition = tank.position.clone();
  updateDetailExplosion(view.vehicle, .25);
  assert.deepEqual(body.position, body.userData.basePosition);
  updateDetailExplosion(view.vehicle, .5);
  assert.ok(body.position.distanceTo(new THREE.Vector3(.35, .575, .1)) < 1e-10);
  assert.deepEqual(body.position, rim.position);
  updateDetailExplosion(view.vehicle, 1);
  const fullySeparated = body.userData.basePosition.clone().add(body.userData.explodeOffset);
  assert.ok(body.position.distanceTo(fullySeparated) < 1e-10);
  updateDetailExplosion(view.vehicle, 1);
  assert.ok(body.position.distanceTo(fullySeparated) < 1e-10, 'must not accumulate displacement');
  updateDetailExplosion(view.vehicle, 0);
  assert.deepEqual(body.position, body.userData.basePosition);
  assert.deepEqual(rim.position, rim.userData.basePosition);
  assert.deepEqual(tank.position, tankPosition, 'shared assembly is updated by the assembly loop only');
});

test('unknown IDs leave inspector visibility and selection unchanged', () => {
  const {view, body, rim, tank} = inspector();
  view.focusPart('model-000');
  const visibility = [body.visible, rim.visible, tank.visible];
  view.focusPart('missing');
  view.isolatePart('missing');
  view.togglePartVisibility('missing');
  assert.equal(view.selectedPart, body);
  assert.equal(view.hiddenParts.size, 0);
  assert.equal(view.isolatedPartId, null);
  assert.deepEqual([body.visible, rim.visible, tank.visible], visibility);
});
