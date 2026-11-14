import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/jet-vehicle.js';
import {JET_RIG_MASS,jetNozzle,jetEngineCount} from '../dist/js/jet-engine.js';

const near=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const make=(overrides={})=>new PhysicsSim({...vehiclePhysics(vehicleProfile('roadster'),{},DEFAULTS),...overrides});
const advance=(sim,seconds,input={})=>{for(let i=0;i<Math.round(seconds/.002);i++)sim.step(.002,{stabilize:false,...input});};
const fullLift={stabilize:false,jetEnabled:true,jetLiftOnly:true,thrusterCommands:[1,1,1,1,0,0,0,0,0,0]};
const fullSpool=sim=>{sim.primeJetIdle();for(const t of sim.thrusters)if(t.group==='lift')t.jetState.spool=1;};

function checkBalances(sim){
  const s=sim.state,t=sim.telemetry();
  near(s.gas+s.gasUsed,sim.initialGas);near(s.fuelKg,s.gas);near(s.fuelUsedKg,s.gasUsed);
  near(s.fuelChemicalEnergyJ,s.gasUsed*43e6,.001);
  near(s.jetAirInKg+s.gasUsed,s.jetExhaustKg,1e-7);
  assert.ok(t.massBalanceError<1e-8);assert.ok(t.jetAirMassBalanceError<1e-7);
  assert.ok(t.jetEnergyBalanceError<.001);assert.ok(t.jetFlowEnergyBalanceError<.001);
  assert.equal(s.pressure,0);assert.equal(s.gasRefilledKg,0);assert.equal(s.compressorEnergyJ,0);
}

test('app profile uses 70 reference engines, separate fuel mass and a feasible installed lift margin',()=>{
  const sim=make();
  assert.equal(sim.params.propulsionKind,'air-breathing-jet');assert.equal(sim.jetProfile,true);
  near(sim.params.dryMass,vehicleProfile('roadster').referenceMass+976);near(sim.initialGas,150);
  near(sim.mass,sim.params.dryMass+150);
  assert.equal(JET_RIG_MASS.total,976);
  assert.equal(sim.thrusters.reduce((n,t)=>n+jetEngineCount(sim.params,t.group),0),70);
  near(jetNozzle(sim.params,'lift').force*4,59840);
  assert.ok(jetNozzle(sim.params,'lift').force*4>sim.mass*sim.params.gravity);
  assert.equal(sim.telemetry().tankVolumeL,0);checkBalances(sim);
});

test('hot-idle setup changes only engine state and leaves six auxiliary engines off',()=>{
  const sim=make(),position=sim.state.pos.clone(),velocity=sim.state.vel.clone(),mass=sim.mass,battery=sim.state.batteryJ;
  assert.equal(sim.primeJetIdle(),true);assert.ok(sim.state.pos.equals(position));assert.ok(sim.state.vel.equals(velocity));
  near(sim.mass,mass);near(sim.state.batteryJ,battery);near(sim.state.jetStarterEnergyJ,0);
  assert.equal(sim.thrusters.filter(t=>t.running).length,4);
  assert.ok(sim.thrusters.slice(4).every(t=>t.jetState.phase==='off'));
  advance(sim,.1,{jetEnabled:true,jetLiftOnly:true});
  near(sim.state.gasUsed,64*.55*.8/60*.1,1e-8);checkBalances(sim);
});

test('atmospheric air passes through the engine without being added to the vehicle mass',()=>{
  const sim=make({contactEnabled:false,aeroEnabled:false,gravity:0});fullSpool(sim);
  const initialMass=sim.mass,temp=sim.state.temp;advance(sim,1,fullLift);
  assert.ok(sim.state.jetAirInKg>100);assert.ok(sim.state.gasUsed>2.7&&sim.state.gasUsed<2.74);
  near(initialMass-sim.mass,sim.state.gasUsed,1e-7);near(sim.state.temp,temp);
  assert.ok(sim.state.jetExhaustKineticEnergyJ>0);assert.ok(sim.state.jetUnmodelledHeatJ>0);
  assert.ok(sim.telemetry().fuelPowerW>1e8);checkBalances(sim);
});

test('three-dimensional ram drag is applied once using the same midpoint vehicle mass',()=>{
  const sim=make({contactEnabled:false,aeroEnabled:false,gravity:0});fullSpool(sim);
  sim.state.vel.set(30,40,-15);
  const initialMass=sim.mass,dt=.002,fuelFlow=64*3.2*.8/60,airflow=64*1.8,midMass=initialMass-fuelFlow*dt/2;
  sim.step(dt,fullLift);
  near(sim.state.acceleration.x,-airflow*30/midMass,1e-9);
  near(sim.state.acceleration.y,(59840-airflow*40)/midMass,1e-9);
  near(sim.state.acceleration.z,airflow*15/midMass,1e-9);
  near(sim.state.jetAirInKg,airflow*dt);checkBalances(sim);
});

test('intake drag also opposes rotation at the actual engine mounts',()=>{
  const sim=make({contactEnabled:false,aeroEnabled:false,gravity:0});fullSpool(sim);
  sim.state.omega.set(0,.2,0);sim.step(.002,fullLift);
  assert.ok(sim.state.omega.y<.2&&sim.state.omega.y>0);
  near(sim.state.acceleration.x,0,1e-9);near(sim.state.acceleration.z,0,1e-9);
  checkBalances(sim);
});

test('closed engine and compressor input cannot create thrust, fuel or recharge energy',()=>{
  const sim=make({contactEnabled:false,aeroEnabled:false,gravity:0}),initialMass=sim.mass;
  advance(sim,.2,{jetEnabled:false,compressor:true});
  near(sim.totalThrust,0);near(sim.mass,initialMass);near(sim.state.gasUsed,0);
  near(sim.state.compressorEnergyJ,0);assert.equal(sim.compressorState,'not-applicable');checkBalances(sim);
  fullSpool(sim);advance(sim,.1,fullLift);const remaining=sim.state.gas;
  advance(sim,.1,{jetCutoff:true,jetEnabled:false,compressor:true});
  near(sim.state.gas,remaining);near(sim.totalThrust,0);checkBalances(sim);
});

test('last fuel is never overdrawn and an empty tank cannot initialize a live engine',()=>{
  const sim=make({fuelCapacityKg:.0001,contactEnabled:false,aeroEnabled:false,gravity:0});fullSpool(sim);
  sim.step(.002,fullLift);near(sim.state.gas,0);near(sim.state.gasUsed,.0001);
  sim.step(.002,fullLift);near(sim.totalThrust,0);near(sim.jetAirflowKgS,0);
  assert.equal(sim.primeJetIdle(),false);checkBalances(sim);
  const empty=make({fuelCapacityKg:0});assert.equal(empty.primeJetIdle(),false);
  advance(empty,.01,fullLift);near(empty.totalThrust,0);near(empty.telemetry().gasPct,0);
});

test('all simultaneous starter groups share battery energy and peak power limits',()=>{
  const sim=make({contactEnabled:false,aeroEnabled:false,gravity:0,batteryMaxDischargeKW:1});
  const initialBattery=sim.state.batteryJ;
  sim.step(.002,{stabilize:false,jetEnabled:true,thrusterCommands:Array(10).fill(1)});
  near(sim.jetStarterPowerW,1000);near(initialBattery-sim.state.batteryJ,2,1e-6);near(sim.state.jetStarterEnergyJ,2);
  near(sim.totalThrust,0);checkBalances(sim);
  const drained=make({contactEnabled:false,aeroEnabled:false,gravity:0});drained.state.batteryJ=1;
  drained.step(.002,{stabilize:false,jetEnabled:true,thrusterCommands:Array(10).fill(1)});
  near(drained.state.batteryJ,0);near(drained.state.jetStarterEnergyJ,1);near(drained.totalThrust,0);
});

test('takeoff follows integrated thrust after spool-up, without an instantaneous height or velocity change',()=>{
  const sim=make(),height=sim.state.pos.y;sim.primeJetIdle();sim.step(.002,fullLift);
  assert.ok(Math.abs(sim.state.pos.y-height)<.0001);assert.ok(Math.abs(sim.state.vel.y)<.01);
  advance(sim,6,fullLift);
  assert.ok(sim.state.pos.y>height+2,`takeoff height ${sim.state.pos.y-height}`);
  assert.ok(sim.state.vel.y>0);assert.equal(sim.contactCount,0);
  assert.ok(sim.state.gasUsed>0);checkBalances(sim);
});

test('jet-only mount and collision bounds accommodate the external rig and reset clears flow',()=>{
  const sim=make({bodyLength:10,bodyWidth:5.8,liftX:4,liftZ:2.5,boostX:-6,yawX:6,yawZ:2.5});
  near(sim.params.bodyLength,10);near(sim.params.bodyWidth,5.8);near(sim.params.liftX,4);near(sim.params.boostX,-6);near(sim.params.yawX,6);
  near(sim.thrusters[8].pos.x,6);near(sim.bodyHalf[0],5);near(sim.bodyHalf[2],2.9);
  fullSpool(sim);sim.step(.002,fullLift);assert.ok(sim.jetAirflowKgS>0);sim.reset();
  near(sim.jetAirflowKgS,0);assert.ok(sim.thrusters.every(t=>t.airMassFlowKgS===0&&t.grossThrustN===0));
});
