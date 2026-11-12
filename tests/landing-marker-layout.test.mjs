import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun} from '../dist/js/landing-experiment.js';
import {LandingVisual} from '../dist/js/landing-visual.js';

test('height ruler and labels stay beside the body through orbit and chassis yaw without changing measured heights',()=>{
  const sim=new PhysicsSim();createLandingRun(sim,{height:3,method:'brake',brakeHeight:1.5});
  const visual=new LandingVisual();visual.setExperiment({height:3,method:'brake',brakeHeight:1.5});
  try{for(const yaw of [0,.7,1.5])for(const angle of [0,.8,1.6,2.4,3.2,4,4.8,5.6]){
    sim.state.q.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
    const camera=new THREE.PerspectiveCamera(43,1.2,.08,1500);
    camera.position.set(Math.cos(angle)*12,7,Math.sin(angle)*12);camera.lookAt(sim.state.pos);camera.updateMatrixWorld(true);
    visual.update(sim,{state:sim.state,wheels:sim.wheels},camera,'lab');visual.root.updateMatrixWorld(true);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);right.y=0;right.normalize();
    let edge=-Infinity;
    for(const x of [-1,1])for(const z of [-1,1])edge=Math.max(edge,new THREE.Vector3(x*sim.params.bodyLength/2,0,z*sim.params.bodyWidth/2).applyQuaternion(sim.state.q).dot(right));
    assert.ok(visual.ruler.position.dot(right)>edge+.7,'ruler clears the visible horizontal body extent');
    assert.ok(visual.heightLabel.getWorldPosition(new THREE.Vector3()).dot(right)>edge+.9,'height label clears body');
    assert.equal(visual.heightMarker.position.y,3);assert.equal(visual.brakeMarker.position.y,1.5);
    assert.equal(visual.ruler.position.y,0);assert.equal(visual.clearanceLine.position.y,0);
    assert.equal(visual.clearanceLine.scale.y,Math.max(0,visual.metrics.clearance));
  }}finally{visual.dispose();}
});