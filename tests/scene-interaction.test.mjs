import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FlightScene, EXPLODE_STAGES, partExplodeProgress } from '../dist/js/scene.js';
import { createStageVisual, updateStageVisual, disposeStageVisual } from '../dist/js/stage-visual.js';
import { COURSE } from '../dist/js/stage.js';

// These are Node contract tests: no DOM, WebGL context, browser pointer events,
// or actual OrbitControls gesture handling is exercised here.
const nearVector = (actual, expected, tolerance = 1e-6) =>
  assert.ok(actual.distanceTo(expected) < tolerance, `${actual.toArray()} != ${expected.toArray()}`);

test('stage obstacle solids match the shared collision centres and dimensions', () => {
  const stage = createStageVisual(COURSE);
  stage.updateMatrixWorld(true);
  assert.equal(stage.userData.obstacles.size, COURSE.obstacles.length);
  for (const obstacle of COURSE.obstacles) {
    const group = stage.userData.obstacles.get(obstacle.id);
    assert.ok(group, `missing obstacle ${obstacle.id}`);
    const solid = group.children.find(child => child.isMesh && child.geometry.type === 'BoxGeometry');
    const bounds = new THREE.Box3().setFromObject(solid);
    nearVector(bounds.getCenter(new THREE.Vector3()), new THREE.Vector3(...obstacle.center));
    nearVector(bounds.getSize(new THREE.Vector3()), new THREE.Vector3(...obstacle.size));
  }
  disposeStageVisual(stage);
});

test('air ring matches the checkpoint centre, radius, and crossing-plane direction', () => {
  const stage = createStageVisual(COURSE);
  const checkpoint = COURSE.checkpoints.find(point => point.type === 'air');
  const gate = stage.userData.gates.get(checkpoint.id);
  nearVector(gate.position, new THREE.Vector3(...checkpoint.center));
  nearVector(new THREE.Vector3(0, 0, 1).applyQuaternion(gate.quaternion), new THREE.Vector3(1, 0, 0));
  assert.equal(gate.userData.frame.geometry.parameters.radius, checkpoint.radius);
  disposeStageVisual(stage);
});

test('checkpoint visuals advance in course order and distinguish current, future, and completed targets', () => {
  const stage = createStageVisual(COURSE);
  const points = COURSE.checkpoints.map(cp => stage.userData.checkpoints.get(cp.id));
  const markerColor = point => point.userData.markerMaterials[0].color.getHex();
  assert.deepEqual(points.map(p => p.userData.current), [true, false, false]);
  const futureAirColor = markerColor(points[1]);
  updateStageVisual(stage, 1, 0);
  assert.deepEqual(points.map(p => p.userData.completed), [true, false, false]);
  assert.deepEqual(points.map(p => p.userData.current), [false, true, false]);
  assert.notEqual(markerColor(points[1]), futureAirColor);
  assert.notEqual(markerColor(points[0]), markerColor(points[1]));
  assert.notEqual(markerColor(points[2]), markerColor(points[1]));
  updateStageVisual(stage, COURSE.checkpoints.length, 1);
  assert.ok(points.every(p => p.userData.completed && !p.userData.current));
  updateStageVisual(stage, 0, 0);
  assert.deepEqual(points.map(p => p.userData.completed), [false, false, false]);
  assert.deepEqual(points.map(p => p.userData.current), [true, false, false]);
  disposeStageVisual(stage);
});

test('explosion stages separate exterior parts before internal hardware and assemble reversibly', () => {
  assert.ok(partExplodeProgress('wheel-fl', .2) > 0);
  assert.equal(partExplodeProgress('tank', .2), 0);
  assert.ok(partExplodeProgress('body', .45) > partExplodeProgress('battery', .45));
  assert.equal(partExplodeProgress('thrusters', .6), 0);
  for (const id of Object.keys(EXPLODE_STAGES)) {
    assert.equal(partExplodeProgress(id, -1), 0);
    assert.equal(partExplodeProgress(id, 0), 0);
    assert.equal(partExplodeProgress(id, 1), 1);
    assert.equal(partExplodeProgress(id, 2), 1);
    const outward = Array.from({ length: 101 }, (_, i) => partExplodeProgress(id, i / 100));
    assert.ok(outward.every((value, i) => value >= 0 && value <= 1 && (!i || value >= outward[i - 1])));
    const inward = Array.from({ length: 101 }, (_, i) => partExplodeProgress(id, (100 - i) / 100));
    assert.deepEqual(inward, outward.slice().reverse(), `${id} must reassemble without hysteresis`);
  }
});

test('orbit follow translates camera and pivot together without resetting viewing angle or zoom', () => {
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 1000);
  camera.position.set(8, 4, 8);
  const controls = { target: new THREE.Vector3(0, .6, 0), update() { camera.lookAt(this.target); } };
  controls.update();
  const initialOffset = camera.position.clone().sub(controls.target);
  const initialOrientation = camera.quaternion.clone();
  const view = { mode: 'drive', cameraName: 'orbit', camera, cameraTarget: new THREE.Vector3(), controls, selectedPart: null };
  const sim = {
    state: { pos: new THREE.Vector3(25, 2, 9), vel: new THREE.Vector3(40, 0, 0) },
    bodyPosition: new THREE.Vector3(24.6, 1.8, 9.1),
  };
  for (const displacement of [new THREE.Vector3(), new THREE.Vector3(3, 7, -4), new THREE.Vector3(-60, -2, 20)]) {
    sim.bodyPosition.add(displacement);
    FlightScene.prototype.updateCamera.call(view, sim, 1 / 60);
    nearVector(camera.position.clone().sub(controls.target), initialOffset, 1e-10);
    nearVector(controls.target, sim.bodyPosition.clone().add(new THREE.Vector3(0, .15, 0)), 1e-10);
    assert.ok(camera.quaternion.angleTo(initialOrientation) < 1e-7);
  }
});

test('explode setter synchronizes an optional callback while mode changes reserve inspector zoom for assembly', () => {
  const notifications = [];
  const view = { onInspectExplode: value => notifications.push(value), controls: {}, selectedBox: { visible: true }, selectedPart: {} };
  assert.equal(FlightScene.prototype.setExplode.call(view, .4), .4);
  assert.deepEqual(notifications, []);
  assert.equal(FlightScene.prototype.setExplode.call(view, 2, true), 1);
  assert.equal(FlightScene.prototype.setExplode.call(view, -1, true), 0);
  assert.deepEqual(notifications, [1, 0]);
  FlightScene.prototype.setMode.call(view, 'inspect');
  assert.equal(view.controls.enableZoom, false);
  assert.equal(view.controls.enabled, true);
  FlightScene.prototype.setMode.call(view, 'drive');
  assert.equal(view.controls.enableZoom, true);
  assert.equal(view.selectedPart, null);
  assert.equal(view.selectedBox.visible, false);
});

test('replacing and clearing a stage removes its scene objects and disposes owned GPU resources once', () => {
  const view = { scene: new THREE.Scene(), stageVisual: null };
  FlightScene.prototype.setStage.call(view, COURSE);
  const first = view.stageVisual, resources = new Set();
  first.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material) resources.add(material);
    }
  });
  for (const material of first.userData.stageResources.materials) resources.add(material);
  const disposeCounts = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposeCounts.set(resource, disposeCounts.get(resource) + 1));
  FlightScene.prototype.setStage.call(view, COURSE);
  assert.notEqual(view.stageVisual, first);
  assert.equal(first.parent, null);
  assert.equal(first.children.length, 0);
  assert.ok([...disposeCounts.values()].every(count => count === 1));
  assert.equal(view.scene.children.length, 1);
  FlightScene.prototype.setStage.call(view, null);
  assert.equal(view.stageVisual, null);
  assert.equal(view.scene.children.length, 0);
});
