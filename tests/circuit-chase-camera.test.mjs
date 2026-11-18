import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FlightScene } from '../dist/js/scene.js';

function rig(){
  const view=Object.create(FlightScene.prototype);
  Object.assign(view,{mode:'city',stationRace:{},cameraName:'chase',
    camera:new THREE.PerspectiveCamera(52,1050/680,.25,1050),
    cameraTarget:new THREE.Vector3(),cameraPosition:new THREE.Vector3(),
    controls:{target:new THREE.Vector3(),update(){}}});
  const sim={bodyPosition:new THREE.Vector3(12,1,-50),
    state:{pos:new THREE.Vector3(400,0,600),vel:new THREE.Vector3(55,0,0),q:new THREE.Quaternion()}};
  view.frameCityStart(sim);
  return {view,sim};
}

test('a car doing 198 km/h holds its chase framing across refresh rates, even when interpolated motion pauses',()=>{
  for(const hz of [20,60,120]){
    const {view,sim}=rig();
    for(let i=0;i<hz*4;i++){
      sim.bodyPosition.x+=55/hz;
      view.updateCamera(sim,1/hz);
    }
    assert.ok(Math.abs((sim.bodyPosition.x-view.camera.position.x)-9.3)<.001);
    view.camera.updateMatrixWorld(true);
    const rear=sim.bodyPosition.clone().add(new THREE.Vector3(-1.6,.55,0));
    const left=rear.clone().add(new THREE.Vector3(0,0,-.95)).project(view.camera);
    const right=rear.clone().add(new THREE.Vector3(0,0,.95)).project(view.camera);
    assert.ok(Math.abs(left.x-right.x)*1050/2>110);
    const eye=view.camera.position.clone();
    for(let i=0;i<hz;i++)view.updateCamera(sim,1/hz);
    assert.ok(view.camera.position.distanceTo(eye)<.001);
  }
});

test('airborne motion follows the rendered pose and resets and manual camera changes discard old anchors',()=>{
  const {view,sim}=rig();
  const stationary=rig();
  const move=new THREE.Vector3(2,1.5,-.7);
  sim.bodyPosition.add(move);
  view.updateCamera(sim,1/60);
  stationary.view.updateCamera(stationary.sim,1/60);
  assert.ok(view.camera.position.clone().sub(stationary.view.camera.position).distanceTo(move)<1e-8);
  assert.ok(view.cameraTarget.clone().sub(stationary.view.cameraTarget).distanceTo(move)<1e-8);
  sim.bodyPosition.set(-800,1,200);
  view.frameCityStart(sim);
  view.updateCamera(sim,1/60);
  assert.ok(view.camera.position.distanceTo(sim.bodyPosition)<10);
  view.setCamera('orbit');
  sim.bodyPosition.x+=500;
  view.updateCamera(sim,1/60);
  const orbitEye=view.camera.position.clone();
  view.setCamera('chase');
  view.updateCamera(sim,1/60);
  assert.ok(view.camera.position.distanceTo(orbitEye)<1);
});
