import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun} from '../dist/js/landing-experiment.js';
import {measureEconomyPlan} from '../dist/js/landing-economy.js';
import {LandingPlanner} from '../dist/js/landing-preparation.js';

function planningWorker(t){
  let worker;
  class TestWorker{
    constructor(url,options){
      assert.equal(options.type,'module');
      assert.match(url.pathname,/landing-plan-worker\.js$/);
      worker=this;
    }
    postMessage(request){this.request=structuredClone(request);}
    terminate(){this.closed=true;}
    complete(){this.onmessage({data:measureEconomyPlan(this.request.initial,this.request.targetSpeed)});}
  }
  const previous=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  Object.defineProperty(globalThis,'Worker',{value:TestWorker,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'Worker',previous);else delete globalThis.Worker;});
  return ()=>worker;
}
const options={height:20,method:'eco',targetSpeed:.5};
test('interactive plan matches the synchronous plan from the actual release conditions',async t=>{
  const getWorker=planningWorker(t),params={dryMass:1900,tankPressureMPa:35.875};
  const sim=new PhysicsSim(params),baseline=createLandingRun(new PhysicsSim(params),options);
  sim.state.gas=10;sim.state.temp=180;
  const planner=new LandingPlanner();
  const pending=planner.prepare(sim,options,new AbortController().signal);
  const worker=getWorker();
  assert.equal(worker.request.initial.gas,baseline.initialGas);
  assert.ok(Math.abs(worker.request.initial.height-baseline.height)<1e-12);
  assert.equal(worker.request.initial.temperature,baseline.initialTemperature);
  worker.complete();
  const run=await pending;
  for(const key of Object.keys(baseline).filter(key=>key.startsWith('eco')&&key!=='ecoPlanTimeMs')){
    assert.deepEqual(run[key],baseline[key],key);
  }
  assert.equal(sim.state.time,0);
  assert.equal(planner.idleWorker,worker);
  const repeat=await planner.prepare(sim,options,new AbortController().signal);
  assert.equal(repeat.ecoPlannedBrakeHeight,run.ecoPlannedBrakeHeight);
  assert.equal(repeat.ecoPlanTimeMs,0);
  const different=planner.prepare(sim,{...options,height:21},new AbortController().signal);
  assert.equal(getWorker(),worker);
  assert.ok(Math.abs(worker.request.initial.height-21)<1e-12);
  worker.complete();assert.equal((await different).height,21);
});
test('stopping an experiment cancels planning and releases the worker',async t=>{
  const getWorker=planningWorker(t),controller=new AbortController();
  const planner=new LandingPlanner();
  const pending=planner.prepare(new PhysicsSim(),options,controller.signal);
  controller.abort();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(getWorker().closed,true);
  assert.equal(getWorker().onmessage,null);
});
test('the same plan remains available when a module worker cannot load',async t=>{
  const getWorker=planningWorker(t),sim=new PhysicsSim();
  const planner=new LandingPlanner();
  const pending=planner.prepare(sim,options,new AbortController().signal);
  getWorker().onerror({preventDefault(){}});
  const run=await pending;
  assert.equal(run.ecoPlannedBrakeHeight,createLandingRun(new PhysicsSim(),options).ecoPlannedBrakeHeight);
  assert.equal(getWorker().closed,true);
});
