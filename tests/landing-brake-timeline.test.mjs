import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun,landingRunInput,updateLandingRun,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {brakeTimelineEvents,brakeTimelinePlot} from '../dist/js/landing-brake-timeline.js';

function trial(method,options={}){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,brakeHeight:1.5,method,...options});
  let firstRequest=null,firstAbove=null;
  while(!run.done){
    const mass=sim.mass,orientation=sim.state.q.clone(),input=landingRunInput(run,sim);
    if(firstRequest===null&&Number.isFinite(input.verticalAcceleration))firstRequest=run.elapsed;
    sim.step(LANDING_STEP,input);updateLandingRun(run,sim);
    const sumY=sim.thrusters.reduce((sum,t)=>sum+t.dir.clone().applyQuaternion(orientation).y*t.force,0);
    const ratio=sumY/((mass+sim.mass)*.5*sim.params.gravity);
    assert.ok(Math.abs(sumY-sim.verticalThrustN)<1e-7);
    if(firstAbove===null&&run.touchdownTime===null&&ratio>1)firstAbove=run.elapsed;
    const sample=run.samples.at(-1);
    if(sample.time===run.elapsed)assert.ok(Math.abs(sample.thrustWeightRatio-ratio)<1e-10);
  }
  assert.equal(run.result.firstAboveWeightTime,firstAbove);
  assert.equal(run.result.autoBrakeTime,firstRequest);
  return run.result;
}

test('braking commands, actual nozzle support and pre-impact speed are distinct timestamps',()=>{
  const fast=trial('brake',{height:20,brakeHeight:1.5});
  assert.ok(fast.firstAboveWeightTime>fast.autoBrakeTime&&fast.firstAboveWeightTime<fast.touchdownTime);
  assert.ok(fast.firstAboveWeightRatio>1);
  for(const zoom of [false,true]){
    const svg=brakeTimelinePlot(fast,zoom);
    assert.equal((svg.match(/<polyline /g)||[]).length,2);
    for(const time of [fast.autoBrakeTime,fast.firstAboveWeightTime,fast.touchdownTime])assert.ok(svg.includes(time.toFixed(4)+' s'));
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  }
  const gentle=trial('gentle'),eco=trial('eco');
  assert.equal(gentle.autoBrakeTime,0);assert.ok(eco.autoBrakeTime>0);
});

test('coasting, zero-height releases and archived results do not invent thrust crossings',()=>{
  for(const r of [trial('free'),trial('brake',{brakeHeight:0}),trial('free',{height:0})]){
    assert.equal(r.autoBrakeTime,null);assert.equal(r.firstAboveWeightTime,null);
    assert.match(brakeTimelineEvents(r)[1].empty,/초과 표본 없음/);
    assert.doesNotMatch(brakeTimelinePlot(r,true),/NaN|Infinity|undefined/);
  }
  assert.equal(brakeTimelinePlot({method:'brake',samples:[]}), '');
});

test('upward thrust counts only the world vertical component of directed nozzle forces',()=>{
  const sim=new PhysicsSim();
  sim.reset('flight');sim.state.q.setFromAxisAngle(sim.state.pos.clone().set(0,0,1),Math.PI/3);
  const q=sim.state.q.clone();
  sim.step(LANDING_STEP,{thrusterCommands:sim.thrusters.map((_,i)=>i<4?1:0)});
  const projected=sim.thrusters.reduce((sum,t)=>sum+t.dir.clone().applyQuaternion(q).y*t.force,0);
  assert.ok(projected>0&&projected<sim.totalThrust*.6);
  assert.ok(Math.abs(projected-sim.verticalThrustN)<1e-8);
  sim.reset('ground');assert.equal(sim.verticalThrustN,0);
});
