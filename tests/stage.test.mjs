import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, StageRun, createStageRun, updateStageRun } from '../dist/js/stage.js';

const sim=(pos,velocity=[0,0,0],contacts=4)=>({state:{pos,vel:velocity,gas:37,pressure:7e6},restHeight:.6,contactCount:contacts});
function throughDrive(run){return updateStageRun(run,[5,.6,-4],sim([19,.6,-4],[8,0,0]),.02);}
function throughAir(run){return updateStageRun(run,[26,2.6,0],sim([30,2.6,0],[8,0,0],0),.02);}

test('stage start is explicit and observers never refill finite gas or move the vehicle',()=>{
  const run=new StageRun();const vehicle=sim([19,.6,-4],[8,0,0]);const snapshot=structuredClone(vehicle);
  run.update([5,.6,-4],vehicle,.02);assert.equal(run.status,'ready');assert.equal(run.progress,0);
  run.start(50);run.update([5,.6,-4],vehicle,.02);assert.equal(run.progress,1);assert.equal(run.startTime,50);
  assert.deepEqual(vehicle,snapshot);
});

test('swept ground gate catches a fast pass but enforces contact and checkpoint order',()=>{
  const run=createStageRun();throughAir(run);assert.equal(run.progress,0);
  run.update([5,.6,-4],sim([19,.6,-4],[8,0,0],0),.02);assert.equal(run.progress,0);
  throughDrive(run);assert.equal(run.progress,1);assert.equal(run.nextCheckpoint.id,'air');
});

test('air ring requires altitude, no tire contact, direction and actual plane intersection',()=>{
  const run=createStageRun();throughDrive(run);
  run.update([26,.6,0],sim([30,.6,0],[8,0,0],0),.02);assert.equal(run.progress,1);
  run.update([26,2.6,0],sim([30,2.6,0],[8,0,0],1),.02);assert.equal(run.progress,1);
  run.update([30,2.6,0],sim([26,2.6,0],[-8,0,0],0),.02);assert.equal(run.progress,1);
  run.update([26,2.6,5],sim([30,2.6,5],[8,0,0],0),.02);assert.equal(run.progress,1);
  throughAir(run);assert.equal(run.progress,2);
});

test('landing requires stable low speed contact rather than merely crossing the finish pad',()=>{
  const run=createStageRun();throughDrive(run);throughAir(run);
  run.update([35,.6,0],sim([41,.6,0],[6,0,0],4),.2);assert.equal(run.progress,2);assert.equal(run.landingHold,0);
  run.update([41,.6,0],sim([41,.6,0],[0,0,0],4),.3);assert.ok(run.landingHold>.29);
  run.update([41,.6,0],sim([41,.6,0],[0,0,0],0),.01);assert.equal(run.landingHold,0);
  for(let i=0;i<250;i++)run.update([41,.6,0],sim([41,.6,0],[0,0,0],4),.002);
  assert.equal(run.status,'complete');assert.equal(run.progress,3);assert.equal(run.milestones.length,3);
  const finished=run.elapsed;run.update([41,.6,0],sim([41,.6,0]),10);assert.equal(run.elapsed,finished);
});

test('stage time and bounds fail honestly while empty gas alone does not end electric driving',()=>{
  const run=createStageRun();const vehicle=sim([0,.6,0]);vehicle.state.gas=0;
  run.update([0,.6,0],vehicle,1);assert.equal(run.status,'running');assert.equal(vehicle.state.gas,0);
  run.update([0,.6,0],vehicle,119);assert.equal(run.status,'failed');assert.equal(run.reason,'timeout');
  run.start();run.update([0,.6,0],sim([121,.6,0]),.002);assert.equal(run.reason,'out-of-bounds');
});

test('shared structure boxes are grounded and leave the air ring opening clear',()=>{
  for(const box of COURSE.obstacles){assert.ok(box.size.every(v=>v>0));assert.ok(box.center[1]-box.size[1]/2>=-1e-10);}
  const cp=COURSE.checkpoints[1];
  for(const box of COURSE.obstacles){
    const inside=cp.center.every((v,i)=>Math.abs(v-box.center[i])<box.size[i]/2);
    assert.equal(inside,false,`${box.id} obstructs the gate centre`);
  }
});
