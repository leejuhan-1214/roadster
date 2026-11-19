import assert from 'node:assert/strict';
import test from 'node:test';
import {PhysicsSim} from '../dist/js/physics.js';
import {ROCKET_PARAMS} from '../dist/js/rocket-layout.js';
import {createLandingRun,LANDING_STEP,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {startHoverLandingRun,landingPhaseAir} from '../dist/js/landing-hover.js';

const vehicle=()=>new PhysicsSim({...ROCKET_PARAMS,dryMass:1900});
const finish=(sim,run)=>{
  while(!run.done){
    sim.step(LANDING_STEP,landingRunInput(run,sim));
    updateLandingRun(run,sim);
  }
  return run.result;
};

test('hover is continuously integrated at 20 m and every trial starts with the same spent tank and open valves',()=>{
  const sim=vehicle(),step=sim.step.bind(sim);
  let steps=0,maximumHeightError=0,maximumVerticalSpeed=0;
  sim.step=(dt,input)=>{
    const previous=sim.state.gas;
    step(dt,input);
    assert.ok(sim.state.gas<previous);
    assert.ok(sim.contactCount===0&&sim.verticalThrustN>0);
    maximumHeightError=Math.max(maximumHeightError,Math.abs(sim.state.pos.y-.31-sim.params.wheelRadius-20));
    maximumVerticalSpeed=Math.max(maximumVerticalSpeed,Math.abs(sim.state.vel.y));
    steps++;
  };
  const baseline=startHoverLandingRun(sim,{method:'brake',brakeHeight:2,height:20});
  assert.equal(steps,500);
  assert.ok(maximumHeightError<1e-10&&maximumVerticalSpeed<1e-10);
  assert.ok(baseline.hover.gasUsedKg>40&&baseline.hover.gasUsedKg<43);
  assert.ok(sim.thrusters.slice(0,4).every(t=>t.opening>0&&t.mdot>0));
  assert.ok(sim.state.temp<sim.params.initialTemperature&&sim.state.pressure<sim.params.tankPressureMPa*1e6);
  assert.equal(baseline.tankPressureMPa,sim.state.pressure/1e6);
  assert.equal(baseline.initialTemperature,sim.state.temp);
  assert.equal(sim.state.gasRefilledKg,0);
  const repeat=startHoverLandingRun(sim,{method:'eco',height:20});
  assert.deepEqual(repeat.hover,baseline.hover);
  assert.equal(repeat.gasUsed,0);
});

test('phase totals conserve tank mass, include residual valve discharge and seed a warm-valve economy prediction',()=>{
  const sim=vehicle();
  for(const method of ['free','eco']){
    const row=finish(sim,startHoverLandingRun(sim,{method,height:20}));
    const air=landingPhaseAir(row);
    assert.ok(Math.abs(air.totalKg-(row.hover.startGasKg-sim.state.gas))<1e-10);
    assert.ok(Math.abs(air.totalKg-sim.state.gasUsed)<1e-9);
    assert.equal(air.landingKg,row.initialGas-sim.state.gas);
    if(method==='free')assert.ok(air.landingKg>1&&air.landingKg<1.5);
    else{
      assert.ok(Math.abs(row.ecoPredictedTouchdownSpeed-row.touchdownSpeed)<1e-5);
      assert.ok(Math.abs(row.ecoPredictedGas-air.landingKg)<1e-4);
    }
  }
});

test('zero hover time reproduces the ordinary release and insufficient thrust cannot claim a successful hover',()=>{
  const a=vehicle(),b=vehicle(),config={height:20,method:'brake',brakeHeight:12};
  const ordinary=finish(a,createLandingRun(a,config));
  const fromRest=finish(b,startHoverLandingRun(b,{...config,hoverSeconds:0}));
  assert.equal(fromRest.hover.gasUsedKg,0);
  assert.equal(fromRest.hover.releaseGasKg,375);
  assert.equal(fromRest.touchdownSpeed,ordinary.touchdownSpeed);
  assert.equal(fromRest.gasUsed,ordinary.gasUsed);
  b.params.tankPressureMPa=.2;
  assert.throws(()=>startHoverLandingRun(b,config),/추력/);
});
