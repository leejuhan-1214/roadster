import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PhysicsSim} from '../dist/js/physics.js';
import {DriveMapSession} from '../dist/js/drive-map-session.js';
import {DrivingController} from '../dist/js/driving-input.js';
import {RenderStateBuffer} from '../dist/js/render-state.js';
import {SEOUL_WARP_POINTS} from '../dist/js/seoul-warp-points.js';

const source=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');
const callbacks=source.slice(source.indexOf('let pendingRaceEpoch=null'),source.indexOf('async function startRace(gate)'));
const [first,second]=SEOUL_WARP_POINTS;
function driving(){
  const loads=[],cancelledTrials=[],camera=[];
  const sim=new PhysicsSim({parkedWheelMounts:true});
  sim.reset('flight');
  sim.step(.002,{thrusterCommands:sim.thrusters.map(()=>1)});
  sim.state.pos.x=91;
  const c={
    sim,driver:new DrivingController(),mapSession:new DriveMapSession(),renderStates:new RenderStateBuffer(sim),
    scene:{city:{},resetPhysicalEffects(){},tireEffects:{reset(){}},frameCityStart(s){camera.push(s.state.pos.clone());}},
    brakeTrial:{cancel:reason=>cancelledTrials.push(reason)},SEOUL_WARP_POINTS,AbortController,
    mode:'city',cityPoseReady:true,cityLoading:false,vehicleLoading:false,race:null,
    cityDistance:1234,paused:true,driveGear:'R',driveInput:{throttle:-1},accumulator:.08,
    mapPanel:{isOpen:true},drawCityMap(){},toast(){},clearDriveInputs(){},console:{warn(){}},
    prepareWarpArrival(city,sim,point,{signal}){
      return new Promise((commit,fail)=>loads.push({signal,commit:()=>commit({...point,surfaceY:0}),fail}));
    }
  };
  c.mapSession.sample(90,sim.state.pos.z);
  vm.runInNewContext(callbacks,c);
  return {c,loads,cancelledTrials,camera};
}

test('warping parks the moving vehicle without spending or refilling air and skips the jump in the route and odometer',async()=>{
  const {c,loads,cancelledTrials,camera}=driving(),s=c.sim.state;
  c.driver.altHold=true;
  const oldZ=s.pos.z;
  const initial=[s.time,s.gas,s.gasUsed,s.pressure,s.temp,s.batteryJ];
  assert.ok(s.gasUsed>0);
  const warp=c.warpToCityPoint(first.id);
  assert.equal(s.pos.x,91);
  loads[0].commit();
  assert.equal((await warp).ok,true);
  assert.deepEqual([s.time,s.gas,s.gasUsed,s.pressure,s.temp,s.batteryJ],initial);
  assert.deepEqual(s.pos.toArray(),[first.x,c.sim.restHeight,first.z]);
  assert.ok(Math.abs(c.sim.telemetry().attitude.yaw-first.heading)<1e-6);
  assert.equal(s.vel.length()+s.omega.length(),0);
  assert.ok(c.sim.wheels.every(w=>w.grounded&&w.omega===0&&w.steer===0));
  assert.ok(c.sim.thrusters.every(t=>t.opening===0&&t.force===0));
  assert.equal(c.driver.altHold,false);
  assert.equal(c.driveGear,'D');
  assert.equal(c.accumulator,0);
  assert.equal(c.paused,true);
  assert.equal(c.cityDistance,1234);
  assert.equal(c.mapSession.place.distance,1234);
  assert.deepEqual(c.mapSession.segments.map(segment=>segment.at(-1)),[[91,oldZ],[first.x,first.z]]);
  assert.deepEqual(camera[0].toArray(),s.pos.toArray());
  assert.deepEqual(cancelledTrials,['warp']);
  for(let i=0;i<20;i++)c.sim.step(.002,{});
  assert.equal(s.gasUsed,initial[2]);
  assert.equal(c.sim.contactCount,4);
});

test('closing or superseding a pending warp, an unavailable road and a race never move the car',async()=>{
  const {c,loads,cancelledTrials}=driving();
  const old=c.warpToCityPoint(first.id),next=c.warpToCityPoint(second.id);
  assert.equal(loads[0].signal.aborted,true);
  loads[0].commit();assert.equal((await old).ok,false);
  loads[1].fail(new Error('missing tile'));assert.equal((await next).ok,false);
  const closed=c.warpToCityPoint(first.id);
  c.cancelCityWarp();c.mapPanel.isOpen=false;
  loads[2].commit();assert.equal((await closed).ok,false);
  c.mapPanel.isOpen=true;c.race={};
  assert.equal((await c.warpToCityPoint(first.id)).ok,false);
  assert.equal(loads.length,3);
  assert.equal(c.sim.state.pos.x,91);
  assert.equal(c.mapSession.segments.length,1);
  assert.deepEqual(cancelledTrials,[]);
});
