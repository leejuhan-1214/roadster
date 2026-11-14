import test from 'node:test';
import assert from 'node:assert/strict';
import {AIR_SYSTEM_DEFAULTS,AIR_R,AIR_CV,AIR_CP,rechargeAirTank,estimateRecharge} from '../dist/js/air-systems.js';
const params={...AIR_SYSTEM_DEFAULTS,tankVolume:.6,tankPressureMPa:35.875,initialTemperature:300};
const cap=250;
const stateAt=(fraction,temp=300,batteryJ=200*3.6e6)=>({gas:cap*fraction,temp,pressure:cap*fraction*AIR_R*temp/.6,batteryJ});
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);

test('operational 99% completion never invents mass or silently refills to 100%',()=>{
  const state=stateAt(.989999,300),r=rechargeAirTank(state,params,.2,{enabled:true,capacityKg:cap});
  close(r.gas,247.5);close(r.addedKg,247.5-state.gas);assert.equal(r.status,'ready');
  const next=rechargeAirTank({...state,...r},params,100,{enabled:true,capacityKg:cap});
  assert.equal(next.status,'ready');assert.equal(next.powerW,0);assert.equal(next.addedKg,0);close(next.gas,247.5);
  assert.equal(rechargeAirTank(stateAt(1),params,1,{enabled:true,capacityKg:cap}).status,'full');
});

test('pressure-limited top-off explicitly cools and conserves inlet enthalpy plus tank heat',()=>{
  const state=stateAt(.98,300/.98),r=rechargeAirTank(state,params,2,{enabled:true,capacityKg:cap});
  assert.equal(r.status,'cooling');assert.ok(r.tankHeatOutJ>0&&r.coolingPowerW>0&&r.addedKg>0);
  assert.ok(r.pressure<=params.tankPressureMPa*1e6+1e-6&&r.gas<=247.5);
  close(r.gas*AIR_CV*r.temp+ r.tankHeatOutJ-r.inletEnthalpyJ,state.gas*AIR_CV*state.temp);
  close(r.inletEnthalpyJ,r.addedKg*AIR_CP*params.ambientTemperature);
  close(r.powerW,r.compressionPowerW+r.coolingPowerW);
  assert.ok(r.powerW<=305000+1e-6);
});

test('active cooling cannot operate for free when electrical allowance or cooling hardware is absent',()=>{
  const state=stateAt(.9,325),p={...params,tankCoolingWPerK:0};
  const without=rechargeAirTank(state,{...p,compressorCoolingPowerKW:0},1,{enabled:true,capacityKg:cap});
  close(without.tankHeatOutJ,0);close(without.coolingPowerW,0);
  const blocked=rechargeAirTank(state,p,1,{enabled:true,capacityKg:cap,powerBudgetW:0});
  assert.equal(blocked.status,'battery');close(blocked.tankHeatOutJ,0);close(blocked.powerW,0);
  const weak=rechargeAirTank({...state,batteryJ:1},p,1,{enabled:true,capacityKg:cap});
  assert.ok(weak.coolingPowerW>0&&weak.coolingPowerW<1&&weak.powerW<=1+1e-9);
  assert.ok(weak.tankHeatOutJ<10,'cooling scales down with auxiliary power instead of retaining rated heat rejection');
});

test('remaining-time prediction matches a fine-step refill without changing the live state',()=>{
  const initial=stateAt(.5,300*.5**.4),snapshot=structuredClone(initial);
  const prediction=estimateRecharge(initial,params,{capacityKg:cap});
  assert.deepEqual(initial,snapshot);assert.equal(prediction.reason,'ready');close(prediction.targetKg,247.5);
  let state=structuredClone(initial),elapsed=0,energy=0;
  while(state.gas<247.5-1e-9&&elapsed<1200){const r=rechargeAirTank(state,params,.1,{enabled:true,capacityKg:cap});
    state={gas:r.gas,temp:r.temp,pressure:r.pressure,batteryJ:state.batteryJ-r.powerW*.1};elapsed+=.1;energy+=r.powerW*.1;
  }
  assert.ok(Math.abs(prediction.seconds-elapsed)<4);assert.ok(Math.abs(prediction.energyJ/energy-1)<.005);
  assert.ok(elapsed>400&&elapsed<700,'a multi-minute thermodynamic refill cannot become an instantaneous reset');
});

test('estimate reports battery insufficiency and the upgraded package is faster than the old thermal bottleneck',()=>{
  const state=stateAt(.5,300*.5**.4),old={...params,compressorPowerKW:60,compressorMaxFlowKgS:.2,compressorCoolingPowerKW:0,activeTankCoolingWPerK:0,activeTankCoolingMaxKW:0};
  const before=estimateRecharge(state,old,{capacityKg:cap}),after=estimateRecharge(state,params,{capacityKg:cap});
  assert.ok(after.seconds<before.seconds/4);assert.ok(after.energyJ>100e6,'refill energy remains a real battery cost');
  const short=estimateRecharge({...state,batteryJ:1e6},params,{capacityKg:cap});
  assert.equal(short.seconds,null);assert.equal(short.reason,'battery');
});
