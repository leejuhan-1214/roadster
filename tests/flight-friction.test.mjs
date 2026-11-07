import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsSim } from '../dist/js/physics.js';
const simFor=(params={})=>new PhysicsSim({aeroEnabled:false,...params});
const advance=(sim,seconds,input={})=>{for(let i=0;i<Math.round(seconds/.002);i++)sim.step(.002,input);};
const rollingStart=(sim,vx,vz=0)=>{sim.state.vel.set(vx,0,vz);sim.wheels.forEach(w=>{w.omega=vx/sim.params.wheelRadius;});};
test('the single flight experiment starts with its finite tank and can lift',()=>{
 const sim=simFor();assert.ok(Math.abs(sim.state.gas-375)<1e-8);assert.ok(Math.abs(sim.mass-2275)<1e-8);const gas=sim.state.gas;advance(sim,.5,{lift:1});assert.ok(sim.totalThrust>0);assert.ok(sim.state.gas<gas);assert.ok(sim.telemetry().altitude>0);
});
test('zero friction with air resistance off removes tire braking and rolling drag',()=>{
 const sim=simFor({friction:0});rollingStart(sim,20,3);advance(sim,2,{brake:1});assert.ok(Math.abs(sim.state.vel.x-20)<1e-8);assert.ok(Math.abs(sim.state.vel.z-3)<1e-8);assert.equal(sim.telemetry().frictionForceN,0);assert.ok(sim.wheels.every(w=>w.tireForceN===0));
});
test('flight experiment braking is limited by the selected surface and overrides throttle',()=>{
 const dry=simFor(),ice=simFor({friction:.15});rollingStart(dry,20);rollingStart(ice,20);advance(dry,3,{throttle:1,brake:1});advance(ice,3,{brake:1});assert.ok(dry.state.vel.x<2);assert.ok(ice.state.vel.x>12);assert.ok(dry.state.pos.x<ice.state.pos.x);assert.ok(dry.wheels.every(w=>w.driveTorque===0));assert.ok(dry.telemetry().brakeForceN>0);
});
test('combined tire forces and rolling resistance stay within each contact friction circle',()=>{
 const sim=simFor({friction:.45});rollingStart(sim,15,2);for(let i=0;i<500;i++){sim.step(.002,{throttle:1,steer:.7});for(const w of sim.wheels)assert.ok(w.tireForceN<=.45*w.load+1e-7);assert.ok(Number.isFinite(sim.telemetry().frictionForceN));}
});
test('airborne wheels never apply ground friction even with brakes or drive commands',()=>{
 const sim=simFor({contactEnabled:false,gravity:0});sim.state.pos.y+=10;rollingStart(sim,10,2);advance(sim,2,{throttle:1,brake:1,stabilize:false});assert.ok(Math.abs(sim.state.vel.x-10)<1e-10);assert.ok(Math.abs(sim.state.vel.z-2)<1e-10);assert.equal(sim.telemetry().frictionForceN,0);assert.equal(sim.contactCount,0);
});
test('body air resistance remains active in flight and can be disabled independently',()=>{
 const drag=simFor({contactEnabled:false,gravity:0,aeroEnabled:true}),vacuum=simFor({contactEnabled:false,gravity:0});for(const sim of [drag,vacuum]){sim.state.pos.y+=10;rollingStart(sim,20);advance(sim,3,{stabilize:false});}assert.ok(drag.state.vel.x<vacuum.state.vel.x-.1);assert.ok(drag.telemetry().airDragN>0);assert.equal(vacuum.telemetry().airDragN,0);assert.equal(drag.telemetry().frictionForceN,0);
});
test('horizontal velocity remains separate from vertical velocity in flight telemetry',()=>{
 const sim=simFor();sim.state.vel.set(-3,12,4);const t=sim.telemetry();assert.equal(t.horizontalSpeed,5);assert.equal(t.speed,5);assert.equal(t.forwardSpeed,-3);assert.equal(t.totalSpeed,13);for(const name of ['frictionForceN','brakeForceN','airDragN'])assert.ok(Number.isFinite(t[name]));
});
