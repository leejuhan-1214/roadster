import test from 'node:test';import assert from 'node:assert/strict';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {gasProperties,nominalAirMass,rechargeAirTank} from '../dist/js/air-systems.js';
const dt=.002,near=(a,b,tol,label='')=>assert.ok(Math.abs(a-b)<=tol,label+': '+a+' != '+b);
const make=()=>new PhysicsSim(vehiclePhysics(vehicleProfile('roadster'),{},DEFAULTS));
const gasU=sim=>sim.state.gas*gasProperties(sim.state.gas,sim.params.tankVolume,sim.state.temp,sim.params).u;
const advance=(sim,seconds,input={})=>{for(let i=0;i<Math.round(seconds/dt);i++)sim.step(dt,{stabilize:false,...input});};
const park=sim=>{const s=sim.state;sim.params.contactEnabled=true;sim.params.gravity=9.80665;s.pos.set(0,sim.restHeight,0);s.vel.set(0,0,0);s.omega.set(0,0,0);s.q.identity();sim.contactCount=4;for(const t of sim.thrusters){t.opening=0;t.command=0;t.mdot=0;t.force=0;}for(const w of sim.wheels){w.omega=0;w.spinAngle=0;}};
// Establish a stated test initial condition and its bookkeeping reference. This
// is fixture preparation, not an in-simulation mass or temperature correction.
const prescribe=(sim,fraction,temp)=>{const s=sim.state;s.gas=sim.initialGas*fraction;s.temp=temp;s.pressure=gasProperties(s.gas,sim.params.tankVolume,temp,sim.params).pressure;s.gasUsed=sim.initialGas-s.gas;s.expelledEnthalpy=sim.initialEnergy-gasU(sim);};
function checkBalance(sim){const s=sim.state,t=sim.telemetry();
 assert.ok(t.massBalanceError<1e-8);assert.ok(t.tankEnergyBalanceError<.01);
 const wallDelta=sim.params.tankWallHeatCapacityJK*(s.tankWallTemp-sim.params.initialTemperature);
 near(gasU(sim)+s.expelledEnthalpy+wallDelta+s.ambientHeatOutJ-s.inletEnthalpyJ,sim.initialEnergy,.01,'gas+wall+ambient energy');
 near(s.compressorEnergyJ,s.externalCompressorEnergyJ,1e-6,'all compressor energy is external');
}
test('actual reference Roadster engine uses real30.334kg gas and sourced rig mass',()=>{
 const sim=make();assert.equal(sim.params.realGas,true);assert.equal(sim.params.calibratedHardware,true);assert.equal(sim.params.compressorExternalPower,true);
 near(sim.initialGas,30.334060485563114,1e-6);near(sim.initialGas,nominalAirMass(sim.params),1e-10);
 near(sim.mass,vehicleProfile('roadster').referenceMass+82.6+sim.initialGas,1e-6);
 checkBalance(sim);
});
test('actual engine full tank reaches thermal cutoff, recovers at idle and recharges on external energy',()=>{
 const sim=make(),s=sim.state,battery=s.batteryJ;sim.params.contactEnabled=false;sim.params.aeroEnabled=false;sim.params.gravity=0;s.pos.y=100;
 let cut=false;for(let i=0;i<15000;i++){sim.step(dt,{stabilize:false,thrusterCommands:[1,1,1,1,0,0,0,0,0,0]});if(s.thermalLimited){cut=true;break;}}
 assert.ok(cut,'actual nozzle demand must encounter real thermal limit');assert.ok(s.gas>0&&s.gas<sim.initialGas);assert.ok(s.temp>=263.15-1e-7);checkBalance(sim);
 const cold=s.temp,gas=s.gas;for(const t of sim.thrusters){t.opening=0;t.mdot=0;}advance(sim,1);
 assert.ok(s.temp>cold);near(s.gas,gas,1e-10,'closed idle does not add gas');checkBalance(sim);
 park(sim);const before=s.gas;advance(sim,2,{compressor:true,brake:1});
 assert.ok(s.gas>before);assert.ok(s.externalCompressorEnergyJ>0);near(s.batteryJ,battery,1e-5,'external station cannot drain traction battery');
 assert.equal(sim.electricPowerW,0);assert.ok(sim.compressorPowerW>0);assert.ok(s.pressure<=25.101325e6+.1);checkBalance(sim);
});
test('actual engine can fill1% tank with empty traction battery without bypassing pressure or energy limits',()=>{
 const sim=make(),s=sim.state;prescribe(sim,.01,293.15);s.batteryJ=0;park(sim);const gas=s.gas;
 advance(sim,1,{compressor:true,brake:1});
 assert.ok(s.gas-gas>.006&&s.gas-gas<.0061);near(s.batteryJ,0,1e-8);near(s.externalCompressorEnergyJ,7500,.01);
 assert.ok(s.pressure<=25.101325e6+.1);checkBalance(sim);
});
test('last tiny fill to99% advances wall heat once even when returned status is ready',()=>{
 const sim=make(),s=sim.state;prescribe(sim,.99-1e-9,295);park(sim);
 const expected=rechargeAirTank({...s},sim.params,dt,{enabled:true,capacityKg:sim.initialGas,powerBudgetW:800000});
 assert.equal(expected.status,'ready');assert.equal(expected.heatAdvanced,true);assert.ok(expected.tankHeatOutJ>0);
 sim.step(dt,{compressor:true,brake:1,stabilize:false});
 near(s.temp,expected.temp,1e-9,'single gas heat step');near(s.tankWallTemp,expected.tankWallTemp,1e-9,'single wall heat step');
 near(s.gas,expected.gas,1e-12);near(s.pressure,expected.pressure,.001);assert.equal(sim.compressorState,'ready');checkBalance(sim);
});

test('actual engine pressure-limited hot top-off waits for heat rejection without pressure overshoot',()=>{
 const sim=make(),state=sim.state,p=sim.params,gas=sim.initialGas*.98;let lo=293.15,hi=315;
 for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(gasProperties(gas,p.tankVolume,mid,p).pressure<p.tankPressureMPa*1e6)lo=mid;else hi=mid;}
 prescribe(sim,.98,(lo+hi)/2);park(sim);let cooling=false;const before=state.gas;
 for(let i=0;i<1000;i++){sim.step(dt,{compressor:true,brake:1,stabilize:false});if(sim.compressorState==='cooling')cooling=true;assert.ok(state.pressure<=p.tankPressureMPa*1e6+.01);}
 assert.ok(cooling);assert.ok(state.gas>before);assert.ok(state.gas-before<.0121);checkBalance(sim);
});
