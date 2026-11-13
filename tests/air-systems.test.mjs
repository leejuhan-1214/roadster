import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim,DEFAULTS,ATMOSPHERE} from '../dist/js/physics.js';
import {compressorSpecificWork,rechargeAirTank,poweredGroundFan,AIR_R,AIR_CV,AIR_CP} from '../dist/js/air-systems.js';
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const advance=(sim,t,input)=>{for(let i=0;i<Math.round(t/.002);i++)sim.step(.002,{stabilize:false,...input});};
const depleted=()=>{
  const sim=new PhysicsSim({aeroEnabled:false}),s=sim.state,oldU=s.gas*AIR_CV*s.temp;
  s.gas*=.9;s.temp*=.9**.4;s.pressure=s.gas*AIR_R*s.temp/sim.params.tankVolume;
  s.gasUsed=sim.initialGas-s.gas;s.expelledEnthalpy=oldU-s.gas*AIR_CV*s.temp;
  s.pos.y=.31+sim.params.wheelRadius-sim.mass*sim.params.gravity/(4*sim.params.springK);
  return sim;
};

test('four intercooled stages require more than reversible isothermal work and less than a single stage',()=>{
  for(const pressure of [1e6,10e6,35.875e6]){
    const four=compressorSpecificWork(pressure,DEFAULTS),one=compressorSpecificWork(pressure,{...DEFAULTS,compressorStages:1});
    assert.ok(four>AIR_R*300*Math.log(pressure/ATMOSPHERE));assert.ok(four<one);
  }
  assert.ok(compressorSpecificWork(ATMOSPHERE,DEFAULTS)>0,'intake losses do not create free compressor mass');
});

test('parked charging imports mass and enthalpy, spends actual battery work and preserves tank balances',()=>{
  const sim=depleted(),s=sim.state,before={gas:s.gas,energy:s.batteryJ,used:s.gasUsed,temp:s.temp};
  advance(sim,1,{compressor:true,brake:1});const t=sim.telemetry();
  assert.equal(t.compressorState,'charging');assert.ok(t.compressorFlowKgS>0&&t.compressorFlowKgS<=.2);
  assert.ok(s.gas>before.gas&&s.temp>before.temp);near(s.batteryJ,before.energy-s.compressorEnergyJ,5e-5);
  near(t.gasConsumedKg,before.used);near(s.gas-before.gas,t.gasRefilledKg,1e-8);
  assert.ok(t.massBalanceError<1e-8&&t.tankEnergyBalanceError<1e-5);
  near(t.compressorHeatW,t.compressorPowerW);assert.ok(s.pressure<=DEFAULTS.tankPressureMPa*1e6);
});

test('recharge is opt-in and disabled while driving, airborne, commanding jets, or waiting for valves to close',()=>{
  for(const [name,prepare,input] of [
    ['off',()=>{},{brake:1}],
    ['moving',s=>s.state.vel.set(1,0,0),{compressor:true}],
    ['moving',()=>{},{compressor:true,throttle:1}],
    ['airborne',s=>{s.state.pos.y=10;s.contactCount=0;},{compressor:true}],
    ['thrusters',()=>{},{compressor:true,boost:true}],
    ['thrusters',s=>{s.thrusters[4].opening=.01;},{compressor:true}],
  ]){
    const sim=depleted();prepare(sim);sim.step(.002,{stabilize:false,...input});
    assert.equal(sim.compressorState,name);assert.equal(sim.state.gasRefilledKg,0);assert.equal(sim.compressorPowerW,0);
  }
});

test('empty battery and full tank cannot charge; parked capture does not add vehicle momentum',()=>{
  const empty=depleted();empty.state.batteryJ=0;const gas=empty.state.gas;advance(empty,.1,{compressor:true,brake:1});
  assert.equal(empty.state.gas,gas);assert.equal(empty.state.batteryJ,0);assert.equal(empty.compressorState,'battery');
  const full=new PhysicsSim();advance(full,.1,{compressor:true,brake:1});near(full.state.gas,full.initialGas);assert.equal(full.compressorState,'full');
  const sim=depleted();sim.params.gravity=0;sim.params.springK=0;sim.params.damperC=0;sim.params.friction=0;sim.params.rollingResistance=0;
  sim.state.pos.y=.31+sim.params.wheelRadius;sim.state.vel.x=.1;
  const p0=sim.mass*sim.state.vel.x;sim.step(.002,{compressor:true,stabilize:false});
  assert.ok(sim.state.gasRefilledKg>0);near(sim.mass*sim.state.vel.x,p0,1e-8);
});

test('thermal charging respects both pressure and initial mass caps through long refill',()=>{
  const params={...DEFAULTS,tankVolume:.02},capacity=params.tankPressureMPa*1e6*params.tankVolume/(AIR_R*300);
  let state={gas:capacity*.3,temp:230,pressure:capacity*.3*AIR_R*230/params.tankVolume,batteryJ:1e9},mass=0,inlet=0,heat=0;
  const initialU=state.gas*AIR_CV*state.temp,initialGas=state.gas;
  for(let i=0;i<6000;i++){
    const r=rechargeAirTank(state,params,.2,{enabled:true,capacityKg:capacity,powerBudgetW:60000});
    mass+=r.addedKg;inlet+=r.inletEnthalpyJ;heat+=r.tankHeatOutJ;
    state={gas:r.gas,temp:r.temp,pressure:r.pressure,batteryJ:state.batteryJ-r.powerW*.2};
    assert.ok(state.pressure<=params.tankPressureMPa*1e6+1e-7&&state.gas<=capacity+1e-10&&state.batteryJ>=0);
  }
  assert.ok(state.gas>capacity*.95);near(state.gas-initialGas,mass,1e-9);
  near(state.gas*AIR_CV*state.temp+heat-inlet,initialU,1e-6);
});

test('one-joule compressor and fan share battery work before motor evaluation',()=>{
  const sim=depleted();sim.state.batteryJ=1;sim.step(.002,{compressor:true,fan:true,brake:1,stabilize:false});
  assert.ok(sim.state.gasRefilledKg>0);assert.ok(sim.electricPowerW*.002<=1+1e-8);
  near(1-sim.state.batteryJ,sim.electricPowerW*.002,1e-8);assert.ok(sim.state.batteryJ>=0);
  const limited=new PhysicsSim({batteryMaxDischargeKW:90});limited.reset('rolling');
  limited.step(.002,{fan:true,throttle:1,stabilize:false});
  assert.ok(limited.electricPowerW<=90000+1e-5);assert.ok(limited.motorState.limits.drawLimitW<=10000+1e-6);
});

test('fan creates pressure downforce with battery power, never fills tank or produces airborne lift',()=>{
  const sim=new PhysicsSim(),gas=sim.state.gas,battery=sim.state.batteryJ;
  advance(sim,3,{fan:true});const t=sim.telemetry();
  assert.ok(t.fanN>17000&&t.fanPowerW>0&&t.fanPressurePa>0&&t.fanAirflowM3S>0);
  near(t.fanN,t.fanPressurePa*sim.params.fanArea);near(sim.state.gas,gas);near(t.gasRefilledKg,0);
  assert.ok(sim.wheels.reduce((sum,w)=>sum+w.load,0)>sim.mass*sim.params.gravity+17000);
  assert.ok(sim.state.batteryJ<battery);
  for(const patch of [{clearance:1},{batteryJ:0},{upY:-1}]){
    const fan=poweredGroundFan({enabled:true,clearance:0,upY:1,batteryJ:1e6,dt:.002,...patch},DEFAULTS);
    assert.equal(fan.forceN,0);assert.equal(fan.powerW,0);
  }
  const air=new PhysicsSim({gravity:0,contactEnabled:false,aeroEnabled:false});air.state.pos.y=20;air.step(.002,{fan:true,stabilize:false});
  assert.equal(air.fanForce,0);assert.equal(air.state.vel.y,0);
});
