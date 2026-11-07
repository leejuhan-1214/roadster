import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsSim, ATMOSPHERE } from '../dist/js/physics.js';
const road=(params={})=>new PhysicsSim({driveMode:'electric',batteryKWh:200,aeroEnabled:false,...params});
const advance=(sim,seconds,input={})=>{for(let i=0;i<Math.round(seconds/.002);i++)sim.step(.002,input);};
const rollingStart=(sim,vx,vz=0)=>{sim.state.vel.set(vx,0,vz);sim.wheels.forEach(w=>{w.omega=vx/sim.params.wheelRadius;});};
test('electric reset has 80% SOC and excludes gas, fan and nozzle inputs without mutating controls',()=>{
 const sim=road();assert.equal(sim.state.gas,0);assert.equal(sim.state.pressure,ATMOSPHERE);assert.equal(sim.telemetry().batterySOC,.8);assert.equal(sim.telemetry().gasPct,0);
 const input={lift:1,boost:true,fan:true,wing:true,altHold:true,airMoveForward:1,thrusterCommands:Array(10).fill(1)};advance(sim,.2,input);
 assert.equal(sim.totalThrust,0);assert.equal(sim.fanForce,0);assert.ok(sim.thrusters.every(t=>t.force===0));assert.equal(input.boost,true);assert.notEqual(sim.telemetry().status,'GAS DEPLETED');
 sim.params.driveMode='experimental';sim.reset();assert.ok(sim.state.gas>0);assert.equal(sim.telemetry().batterySOC,1);
});
test('all four road wheels receive motor torque with an explicit assumed front/rear split and reverse',()=>{
 const forward=road();forward.step(.002,{throttle:1});assert.ok(forward.wheels.every(w=>w.driveTorque>0));assert.ok(Math.abs(forward.wheels[2].driveTorque/forward.wheels[0].driveTorque-2)<1e-12);
 advance(forward,1,{throttle:1});assert.ok(forward.state.vel.x>2);const reverse=road();advance(reverse,1,{throttle:-1});assert.ok(reverse.state.vel.x < -2);assert.ok(reverse.telemetry().forwardSpeed<0);
});
test('lift-off regeneration slows a rolling vehicle more than coast and returns bounded battery energy',()=>{
 const coast=road(),regen=road();rollingStart(coast,20);rollingStart(regen,20);const before=regen.state.batteryJ;
 const energyBefore=.5*regen.mass*regen.state.vel.lengthSq()+regen.wheels.reduce((e,w)=>e+.5*regen.params.wheelInertia*w.omega*w.omega,0);
 advance(coast,5,{regen:false});advance(regen,5,{regen:true});assert.ok(regen.state.vel.x<coast.state.vel.x-5);assert.ok(regen.state.batteryJ>before);assert.ok(regen.telemetry().regenKW>0);assert.ok(regen.state.vel.x>=0);
 const energyAfter=.5*regen.mass*regen.state.vel.lengthSq()+regen.wheels.reduce((e,w)=>e+.5*regen.params.wheelInertia*w.omega*w.omega,0);assert.ok(regen.state.batteryJ-before<energyBefore-energyAfter);
});
test('zero road friction removes rolling resistance lateral grip and tire braking',()=>{
 const sim=road({friction:0});rollingStart(sim,20,3);advance(sim,2,{brake:1,regen:true});assert.ok(Math.abs(sim.state.vel.x-20)<1e-8);assert.ok(Math.abs(sim.state.vel.z-3)<1e-8);assert.equal(sim.telemetry().frictionForceN,0);assert.ok(sim.wheels.every(w=>w.tireForceN===0));
});
test('tire braking is grip limited and brake input overrides accelerator',()=>{
 const dry=road(),ice=road({friction:.15});rollingStart(dry,20);rollingStart(ice,20);advance(dry,3,{throttle:1,brake:1,regen:false});advance(ice,3,{brake:1,regen:false});assert.ok(dry.state.vel.x<2);assert.ok(ice.state.vel.x>12);assert.ok(dry.state.pos.x<ice.state.pos.x);assert.ok(dry.wheels.every(w=>w.driveTorque===0));assert.ok(dry.telemetry().brakeForceN>0);
});
test('low-speed HOLD settles contact without powered reverse or airborne grip',()=>{
 const sim=road();rollingStart(sim,.5,.1);let minimum=Infinity,reverseDistance=0;for(let i=0;i<1000;i++){sim.step(.002,{regen:true});minimum=Math.min(minimum,sim.state.vel.x);reverseDistance+=Math.max(0,-sim.state.vel.x)*.002;}assert.ok(sim.telemetry().horizontalSpeed<1e-3);/* Suspension pitch can move the center of mass slightly back while the contact patch settles. */assert.ok(minimum>-.01);assert.ok(reverseDistance<.002);assert.ok(sim.wheels.every(w=>w.driveTorque===0 && Math.abs(w.omega)<1e-8));
 const air=road({contactEnabled:false,gravity:0});rollingStart(air,.5,.1);advance(air,2,{brake:1});assert.ok(Math.abs(air.state.vel.x-.5)<1e-10);assert.ok(Math.abs(air.state.vel.z-.1)<1e-10);assert.equal(air.telemetry().frictionForceN,0);
});
test('combined cornering propulsion and rolling force stay inside each tire friction circle',()=>{
 const sim=road({friction:.45});rollingStart(sim,15,2);for(let i=0;i<500;i++){sim.step(.002,{throttle:1,steer:.7});for(const w of sim.wheels)assert.ok(w.tireForceN<=.45*w.load+1e-7);assert.ok(Number.isFinite(sim.telemetry().frictionForceN));}
});
test('full battery disables lift-off recovery while friction brakes remain available',()=>{
 const full=road(),coast=road();full.state.batteryJ=full.params.batteryKWh*3.6e6;coast.state.batteryJ=coast.params.batteryKWh*3.6e6;rollingStart(full,20);rollingStart(coast,20);advance(full,2,{regen:true});advance(coast,2,{regen:false});assert.ok(Math.abs(full.state.vel.x-coast.state.vel.x)<1e-8);assert.equal(full.telemetry().regenKW,0);assert.equal(full.telemetry().batterySOC,1);advance(full,3,{brake:1});assert.ok(full.state.vel.x<1);
});
test('horizontal speed excludes vertical velocity and forward speed preserves direction',()=>{
 const sim=road();sim.state.vel.set(-3,12,4);const t=sim.telemetry();assert.equal(t.horizontalSpeed,5);assert.equal(t.speed,5);assert.equal(t.forwardSpeed,-3);assert.equal(t.totalSpeed,13);for(const name of ['frictionForceN','brakeForceN','regenKW','drivePowerKW','batterySOC'])assert.ok(Number.isFinite(t[name]));
});
