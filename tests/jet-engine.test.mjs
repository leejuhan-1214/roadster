import test from 'node:test';
import assert from 'node:assert/strict';
import {JET_PARAMS,JET_RIG_MASS,isJetProfile,jetEngineCount,jetDensityRatio,jetNozzle,createJetEngineState,advanceJetEngine} from '../dist/js/jet-engine.js';

const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const running=(spool=0)=>({...createJetEngineState({idle:true}),spool});
const options={enabled:true,engineCount:1,densityRatio:1,axialSpeed:0};
const idleFlow=.55*.8/60,fullFlow=3.2*.8/60;

test('selected rig counts and static performance use the documented reference endpoints',()=>{
  assert.equal(isJetProfile(JET_PARAMS),true);
  assert.equal(isJetProfile({propulsionKind:'compressed-air'}),false);
  assert.equal(4*jetEngineCount(JET_PARAMS,'lift')+6*jetEngineCount(JET_PARAMS,'boost'),70);
  assert.equal(JET_RIG_MASS.engines,70*11);
  assert.equal(JET_RIG_MASS.total,JET_RIG_MASS.engines+JET_RIG_MASS.ancillaries);
  const idle=advanceJetEngine(running(),JET_PARAMS,0,.1,options);
  const full=advanceJetEngine(running(1),JET_PARAMS,1,.1,options);
  near(idle.grossThrustN,45*.85);near(idle.fuelFlowKgS,idleFlow);near(idle.rpm,19000);
  near(full.grossThrustN,1100*.85);near(full.fuelFlowKgS,fullFlow);near(full.rpm,61500);
  near(full.airMassFlowKgS,1.8);near(full.exhaustMassFlowKgS,1.8+fullFlow);
  near(full.chemicalEnergyJ,fullFlow*.1*43e6,1e-6);
  near(jetNozzle(JET_PARAMS,'lift').force*4,59840);
});

test('spool-up and spool-down require five seconds and preserve the caller state',()=>{
  const initial=running(),snapshot=structuredClone(initial);
  let state=initial;
  for(let i=0;i<49;i++)state=advanceJetEngine(state,JET_PARAMS,1,.1,options).state;
  near(state.spool,.98);assert.deepEqual(initial,snapshot);
  state=advanceJetEngine(state,JET_PARAMS,1,.1,options).state;near(state.spool,1);
  for(let i=0;i<49;i++)state=advanceJetEngine(state,JET_PARAMS,0,.1,options).state;
  near(state.spool,.02);
  const idle=advanceJetEngine(state,JET_PARAMS,0,.1,options);near(idle.state.spool,0);
  assert.equal(idle.state.phase,'running');assert.ok(idle.fuelFlowKgS>0,'hot idle still consumes fuel');
});

test('starter obeys both 17.28 kJ per engine and 220 W, never an impossible thirty-second start',()=>{
  let state=createJetEngineState(),energy=0,elapsed=0;
  while(elapsed<30-1e-8){const r=advanceJetEngine(state,JET_PARAMS,1,.05,options);state=r.state;energy+=r.starterEnergyJ;elapsed+=.05;assert.ok(r.starterPowerW<=220+1e-9);}
  assert.equal(state.phase,'starting');near(energy,6600,1e-6);
  while(state.phase!=='running'&&elapsed<90){const r=advanceJetEngine(state,JET_PARAMS,1,.05,options);state=r.state;energy+=r.starterEnergyJ;elapsed+=.05;assert.ok(r.starterPowerW<=220+1e-9);}
  assert.equal(state.phase,'running');near(energy,17280,1e-6);
  assert.ok(elapsed>=17280/220&&elapsed<17280/220+.051);
  near(state.spool,0);
});

test('group starting shares the configured electrical budget and cannot start from an empty battery',()=>{
  const empty=advanceJetEngine(createJetEngineState(),JET_PARAMS,1,100,{...options,engineCount:16,batteryAvailableJ:0});
  assert.equal(empty.state.phase,'starting');near(empty.starterEnergyJ,0);near(empty.fuelUsedKg,0);near(empty.forceN,0);
  const limited=advanceJetEngine(createJetEngineState(),JET_PARAMS,1,1,{...options,engineCount:16,powerBudgetW:1000});
  near(limited.starterEnergyJ,1000);near(limited.state.starterEnergyJ,62.5);
  const batteryLimited=advanceJetEngine(createJetEngineState(),JET_PARAMS,1,1,{...options,engineCount:16,batteryAvailableJ:17});
  near(batteryLimited.starterEnergyJ,17);
  let state=createJetEngineState(),energy=0,elapsed=0;
  while(state.phase!=='running'&&elapsed<320){const r=advanceJetEngine(state,JET_PARAMS,0,.2,{...options,powerBudgetW:55});state=r.state;energy+=r.starterEnergyJ;elapsed+=.2;}
  near(energy,17280,1e-6);assert.ok(elapsed>=17280/55);assert.equal(state.phase,'running');
});

test('pass-through atmospheric mass and net thrust include ram drag exactly once',()=>{
  const full=advanceJetEngine(running(1),JET_PARAMS,1,.2,{...options,engineCount:16,axialSpeed:80});
  near(full.ramDragN,16*1.8*80);
  near(full.forceN,16*(1100*.85-1.8*80));
  near(full.exhaustMassFlowKgS,full.airMassFlowKgS+full.fuelFlowKgS);
  near(full.exhaustMassFlowKgS*full.exhaustVelocityMps,full.grossThrustN);
  near(full.fuelUsedKg,16*fullFlow*.2);
  const nozzle=jetNozzle(JET_PARAMS,'lift',{axialSpeed:80});near(nozzle.force,full.forceN);
});

test('finite fuel scales the final impulse and an empty or cut-off engine provides no thrust',()=>{
  const fuel=fullFlow*.1;
  const last=advanceJetEngine(running(1),JET_PARAMS,1,1,{...options,fuelAvailableKg:fuel});
  near(last.fuelUsedKg,fuel);near(last.grossThrustN,1100*.85*.1);
  assert.equal(last.state.phase,'stopping');assert.equal(last.running,false);
  for(const opt of [{enabled:false},{cutoff:true},{fuelAvailableKg:0}]){
    const r=advanceJetEngine(running(1),JET_PARAMS,1,.1,{...options,...opt});
    near(r.forceN,0);near(r.grossThrustN,0);near(r.fuelUsedKg,0);near(r.airMassFlowKgS,0);near(r.starterEnergyJ,0);
    assert.equal(r.running,false);
  }
  const restart=advanceJetEngine(last.state,JET_PARAMS,1,.1,options);
  assert.equal(restart.state.phase,'starting');near(restart.grossThrustN,0);
});

test('atmospheric lapse gives finite nonnegative airflow and reduced high-altitude thrust',()=>{
  near(jetDensityRatio(0),1);near(jetDensityRatio(-10),1);
  near(jetDensityRatio(11000),jetDensityRatio(11000.001),2e-6);
  let previous=Infinity;
  for(const h of [0,1000,11000,20000,100000,1e9]){
    const densityRatio=jetDensityRatio(h),r=advanceJetEngine(running(1),JET_PARAMS,1,.1,{...options,densityRatio});
    for(const key of ['airMassFlowKgS','exhaustMassFlowKgS','exhaustVelocityMps','fuelUsedKg','forceN'])assert.ok(Number.isFinite(r[key])&&r[key]>=0,`${key} at ${h} m`);
    assert.ok(r.grossThrustN<=previous);previous=r.grossThrustN;
  }
  const start=advanceJetEngine(createJetEngineState(),JET_PARAMS,0,10,options);
  assert.ok(start.airMassFlowKgS>0,'starter turns the compressor before ignition');
  near(start.fuelUsedKg,0);
});
