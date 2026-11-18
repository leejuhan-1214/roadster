import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Group,Raycaster,Vector3} from 'three';
import {circuitUrbanTrackStages,CIRCUIT_BASIN} from '../dist/js/circuit-urban-track.js';
import {sampleCourse,runoffWidth} from '../dist/js/station-race-course.js';
import {PhysicsSim} from '../dist/js/physics.js';

test('bridge and station gallery retain ground lanes and their visible structures match contacts',()=>{
  const root=new Group(),obstacles=[],sim=new PhysicsSim();
  Array.from(circuitUrbanTrackStages(root,obstacles));root.updateMatrixWorld(true);sim.setObstacles(obstacles);
  const water=root.getObjectByName('Tidal basin water'),waterBox=new Box3().setFromObject(water);
  assert.equal(waterBox.min.x,CIRCUIT_BASIN.minX);assert.equal(waterBox.max.z,CIRCUIT_BASIN.maxZ);
  assert.ok(Math.abs(waterBox.max.y-CIRCUIT_BASIN.waterY)<1e-6);
  const down=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  function visibleTop(name,x,z){
    down.ray.origin.set(x,100,z);
    return down.intersectObject(root.getObjectByName(name),false)[0]?.point.y;
  }
  for(const x of [249,291,335,379,421]){
    const top=visibleTop('Tide bridge steel arches, deck and quay',x,0);
    assert.ok(top>25);assert.ok(Math.abs(top-sim.surfaceHeightAt(x,0,100))<.001);
  }
  for(const x of [187.2,219.8,265.2,376.6,480.1]){
    const top=visibleTop('Tide bridge steel arches, deck and quay',x,-13.75);
    assert.ok(Number.isFinite(top));assert.ok(Math.abs(top-sim.surfaceHeightAt(x,-13.75,100))<.22);
  }
  for(let distance=164;distance<506;distance+=3){
    for(const lateral of [-7,0,7])assert.equal(sim.surfaceHeightAt(distance,lateral,1),0);
  }
  for(let d=878;d<=1016;d+=1.8){
    for(const l of [-7.8,0,7.8]){
      const {x,z}=sampleCourse(d,l);
      assert.equal(sim.surfaceHeightAt(x,z,2),0);
      if(!l)assert.equal(sim.surfaceHeightAt(x,z,100),0,'the gallery has an open central slot');
    }
  }
  for(const side of [-1,1]){
    const pose=sampleCourse(947,side*8);
    const top=visibleTop('Copper station gallery canopies and glazing',pose.x,pose.z);
    assert.ok(Math.abs(top-10.32)<.001);
    assert.ok(Math.abs(sim.surfaceHeightAt(pose.x,pose.z,100)-top)<.001);
    for(let i=0;i<8;i++){
      const station=888+i*16.8;
      assert.ok(25.7-.85>8+runoffWidth(station-1.4,side)+.44,'columns leave the full run-off open');
    }
  }
  assert.equal(new Set(obstacles.map(o=>o.id)).size,obstacles.length);
  assert.equal(root.children.length,5,'continuous static architecture uses five draw calls in total');
});
