import test from 'node:test';
import assert from 'node:assert/strict';
import {AIR_SYSTEM_DEFAULTS,nominalAirMass,gasProperties,exchangeTankHeat,rechargeAirTank,estimateRecharge} from '../dist/js/air-systems.js';
const params={...AIR_SYSTEM_DEFAULTS,tankVolume:.108,tankPressureMPa:25.101325,initialTemperature:293.15};
const cap=nominalAirMass(params),volume=params.tankVolume;
const stateAt=(fraction,temp=293.15,batteryJ=0)=>({gas:cap*fraction,temp,tankWallTemp:293.15,pressure:gasProperties(cap*fraction,volume,temp,params).pressure,batteryJ});
const u=s=>s.gas*gasProperties(s.gas,volume,s.temp,params).u;
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,a+' != '+b);

test('reference cylinder capacity follows real-air EOS and250bar gauge absolute conversion',()=>{
 assert.ok(cap>30.33&&cap<30.34);close(gasProperties(cap,volume,293.15,params).pressure,25e6+101325,.1);
});
test('operational99% completion adds only actual inlet mass and never silently fills100%',()=>{
 const state=stateAt(.989999),r=rechargeAirTank(state,params,1,{enabled:true,capacityKg:cap});
 close(r.gas,cap*.99);close(r.addedKg,cap*.99-state.gas);assert.equal(r.status,'ready');
 const next=rechargeAirTank({...state,...r},params,100,{enabled:true,capacityKg:cap});
 assert.equal(next.status,'ready');assert.equal(next.powerW,0);assert.equal(next.addedKg,0);
 assert.equal(rechargeAirTank(stateAt(1),params,1,{enabled:true,capacityKg:cap}).status,'full');
});
test('station flow is bounded by300L/min free-air and spends grid energy without draining vehicle battery',()=>{
 const state=stateAt(.5),r=rechargeAirTank(state,params,1,{enabled:true,capacityKg:cap,powerBudgetW:0});
 assert.equal(r.status,'charging');assert.ok(r.addedKg>.006&&r.addedKg<.0061);
 close(r.powerW,7500);close(r.externalPowerW,r.powerW);assert.equal(r.batteryPowerW,0);
 close(u(r)-u(state),r.inletEnthalpyJ-r.tankHeatOutJ,1e-6);
 assert.ok(r.aftercoolerHeatJ>0);
});
test('optional battery-powered custom compressor shares finite available energy',()=>{
 const state=stateAt(.5,293.15,1),p={...params,compressorExternalPower:false};
 const r=rechargeAirTank(state,p,1,{enabled:true,capacityKg:cap});
 assert.ok(r.addedKg>0&&r.batteryPowerW<=1+1e-10);close(r.externalPowerW,0);close(r.powerW,r.batteryPowerW);
 const blocked=rechargeAirTank({...state,batteryJ:0},p,1,{enabled:true,capacityKg:cap});assert.equal(blocked.status,'battery');
});
test('closed tank exchanges heat with a finite wall and conserves combined gas-wall energy',()=>{
 const state=stateAt(.5,250),r=exchangeTankHeat(state,params,2);
 assert.ok(r.temp>state.temp&&r.tankWallTemp<state.tankWallTemp);
 const initial=u(state)+params.tankWallHeatCapacityJK*state.tankWallTemp;
 const final=u(r)+params.tankWallHeatCapacityJK*r.tankWallTemp;
 close(final+r.ambientHeatOutJ,initial,1e-5);close(u(r)-u(state),-r.tankHeatOutJ,1e-6);
});
test('pressure-limited top-off conserves enthalpy and waits for cylinder cooling',()=>{
 let state=stateAt(.95,310); // hot fill near or above nominal operating pressure
 let gotCooling=false;
 for(let i=0;i<100;i++){const r=rechargeAirTank(state,params,1,{enabled:true,capacityKg:cap});
  close(u(r)-u(state),r.inletEnthalpyJ-r.tankHeatOutJ,2e-6);
  if(r.status==='cooling')gotCooling=true;
  if(state.pressure<=25.101325e6)assert.ok(r.pressure<=25.101325e6+.01);
  state={...state,...r};
 }
 assert.ok(gotCooling);assert.ok(state.gas<=cap*.99);
});
test('ETA matches fine-step mass-energy filling and does not mutate live state',()=>{
 const initial=stateAt(.5),snapshot=structuredClone(initial),prediction=estimateRecharge(initial,params,{capacityKg:cap});
 assert.deepEqual(initial,snapshot);assert.equal(prediction.reason,'ready');
 let state={...initial},elapsed=0,energy=0;
 while(state.gas<cap*.99-1e-10&&elapsed<20000){const r=rechargeAirTank(state,params,.5,{enabled:true,capacityKg:cap});
  state={...state,...r};elapsed+=.5;energy+=r.powerW*.5;
 }
 assert.ok(Math.abs(prediction.seconds-elapsed)<90,'coarse ETA error below90s over2hour fill');
 assert.ok(Math.abs(prediction.energyJ/energy-1)<1e-5);
 assert.ok(elapsed>7200&&elapsed<10800,'actual cylinder cooldown cannot be hidden by an instant fill');
});
