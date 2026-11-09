import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController} from '../dist/js/driving-input.js';

const dt=.002;
const moving=(params={})=>{const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false,...params});sim.reset('rolling');return sim;};
const advance=(sim,seconds,input)=>{for(let i=0;i<seconds/dt;i++)sim.step(dt,{stabilize:false,fan:false,wing:false,...input});};
const beta=sim=>{const velocity=sim.state.vel.clone().applyQuaternion(sim.state.q.clone().invert());return Math.atan2(velocity.z,Math.abs(velocity.x));};
function state(sim){return {position:sim.state.pos.toArray(),velocity:sim.state.vel.toArray(),orientation:sim.state.q.toArray(),
  rotation:sim.state.omega.toArray(),battery:sim.state.batteryJ,gas:sim.state.gas,wheels:sim.wheels.map(w=>[w.omega,w.slip,w.forceX,w.forceY,w.forceZ])};}

test('rear handbrake locks only the rear wheels while front drive and steering stay physical',()=>{
  const sim=moving(),gas=sim.state.gas,mu=sim.params.friction;
  advance(sim,.6,{throttle:1,steer:.15,handbrake:1});
  assert.equal(sim.params.friction,mu,'drift never overwrites the selected road friction');
  assert.equal(sim.contactCount,4);assert.equal(sim.totalThrust,0);assert.equal(sim.state.gas,gas);
  for(const wheel of sim.wheels){
    assert.ok(wheel.tireForceN<=mu*wheel.load+1e-6,'combined tire forces retain their normal friction budget');
    if(wheel.isFront){assert.equal(wheel.handbrakeTorque,0);assert.ok(wheel.omega>10);assert.ok(wheel.driveTorque>0);assert.ok(wheel.steer>0);}
    else{assert.ok(wheel.handbrakeTorque>5190&&wheel.handbrakeTorque<=5200);assert.ok(Math.abs(wheel.omega)<1e-8);assert.ok(wheel.slip<-.8);assert.equal(wheel.sliding,true);}
  }
  assert.ok(sim.handbrakeForceN>1000);assert.ok(sim.telemetry().handbrakeForceN>1000);assert.ok(sim.handbrakeAmount>.99&&sim.handbrakeAmount<1);
});

test('rear locking produces signed yaw and sideslip through tire forces in both steering directions',()=>{
  const regular=moving(),left=moving(),right=moving();
  advance(regular,1.2,{throttle:1,steer:.15});
  advance(left,1.2,{throttle:1,steer:.15,handbrake:1});
  advance(right,1.2,{throttle:1,steer:-.15,handbrake:1});
  const yaw=sim=>sim.telemetry().attitude.yaw;
  assert.ok(yaw(left)>yaw(regular)*3);assert.ok(yaw(left)>.8&&yaw(right)<-.8);
  assert.ok(beta(left)>.6&&beta(right)<-.6,'the car slides sideways, not merely spins its front-wheel meshes');
  assert.ok(Math.abs(yaw(left)+yaw(right))<.01);assert.ok(Math.abs(beta(left)+beta(right))<.01);
  assert.ok(left.state.vel.length()<regular.state.vel.length(),'rear brake dissipates speed instead of adding an artificial drift boost');
});

test('releasing a short handbrake pulse restores rear rolling and permits countersteer recovery',()=>{
  const sim=moving();advance(sim,.4,{throttle:.6,steer:.15,handbrake:1});
  const driftBeta=beta(sim);assert.ok(driftBeta>.05);
  advance(sim,1.4,{throttle:.35,steer:-.08,handbrake:0});
  assert.ok(Math.abs(beta(sim))<driftBeta*.5,'rear traction and opposite steering reduce sideslip');
  assert.ok(sim.wheels.filter(w=>!w.isFront).every(w=>w.omega>10&&w.handbrakeTorque===0));
  assert.equal(sim.handbrakeForceN,0);assert.equal(sim.handbrakeAmount,0);
});

test('handbrake cannot produce chassis friction or yaw in air or on zero-friction ground',()=>{
  for(const params of [{friction:0},{contactEnabled:false,gravity:0}]){
    const sim=moving(params);if(params.contactEnabled===false)sim.state.pos.y+=10;
    const velocity=sim.state.vel.clone();
    advance(sim,.8,{throttle:.6,steer:.4,handbrake:1});
    assert.ok(Math.hypot(sim.state.vel.x-velocity.x,sim.state.vel.z-velocity.z)<1e-9);
    assert.ok(Math.abs(sim.telemetry().attitude.yaw)<1e-8);
    assert.equal(sim.frictionForceN,0);assert.equal(sim.handbrakeForceN,0);assert.equal(sim.totalThrust,0);
  }
});

test('W+A+Shift pulse enters a physical drift and releasing Shift permits W+D recovery',()=>{
  const sim=moving(),driver=new DrivingController();driver.throttle=1;driver.brake=0;
  const controls=(codes,seconds)=>{const keys=new Set(codes);for(let i=0;i<seconds/dt;i++)sim.step(dt,driver.update(keys,sim,dt));};
  controls(['KeyW','KeyA','ShiftLeft'],.4);
  assert.ok(sim.handbrakeAmount>.99&&sim.handbrakeAmount<1);assert.ok(beta(sim)>.08);assert.ok(sim.state.omega.y>.8);
  assert.ok(sim.wheels.filter(w=>!w.isFront).every(w=>w.slip<-.7),'progressive rear braking creates strong slip without requiring simultaneous wheel lock');
  // Stop countersteering once the initial yaw is arrested. Continuing to hold
  // D for two seconds would intentionally enter a new right turn, rather than
  // test whether releasing the rear brake restores a controllable trajectory.
  let counterTime=0;
  while(sim.state.omega.y>0&&counterTime<1.5){controls(['KeyW','KeyD'],dt);counterTime+=dt;}
  assert.equal(sim.handbrakeAmount,0);assert.ok(counterTime>.1&&counterTime<1.5);
  assert.ok(sim.state.omega.y<=0,'countersteer arrests the initial leftward rotation');
  controls(['KeyW'],1.4);
  assert.ok(Math.abs(beta(sim))<.03,'releasing countersteer lets tire traction align the car with its velocity');
  assert.ok(Math.abs(sim.state.omega.y)<.05,'recovery settles yaw instead of continuing a spin');
  assert.ok(sim.wheels.filter(w=>!w.isFront).every(w=>w.omega>10));assert.equal(sim.contactCount,4);
});

test('service brake overrides drift and handbrake zero preserves existing ground and landing behavior',()=>{
  for(const input of [{throttle:.7,steer:.15},{throttle:1,steer:.15,brake:1}]){
    const old=moving(),explicit=moving();advance(old,.7,input);
    advance(explicit,.7,{...input,handbrake:input.brake?1:0});
    assert.deepEqual(state(explicit),state(old));assert.equal(explicit.handbrakeAmount,0);
    assert.ok(explicit.wheels.every(w=>w.handbrakeTorque===0));
  }
  const old=new PhysicsSim(),explicit=new PhysicsSim();old.reset('drop');explicit.reset('drop');
  advance(old,.8,{});advance(explicit,.8,{handbrake:0});assert.deepEqual(state(explicit),state(old));
});

test('rear brake builds progressively rather than snapping to lock',()=>{const sim=moving();advance(sim,.002,{handbrake:1});assert.ok(sim.handbrakeAmount>0&&sim.handbrakeAmount<.03);advance(sim,.078,{handbrake:1});assert.ok(sim.handbrakeAmount>.62&&sim.handbrakeAmount<.64);advance(sim,.002,{brake:1,handbrake:1});assert.equal(sim.handbrakeAmount,0);});
