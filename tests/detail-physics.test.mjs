import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { PhysicsSim, DEFAULTS } from '../dist/js/physics.js';
const advance=(s,t,input={stabilize:false})=>{for(let i=0;i<Math.round(t/.002);i++)s.step(.002,input);};

test('forward CG changes static axle load and preserves weight balance',()=>{
  const middle=new PhysicsSim(),front=new PhysicsSim({cgX:.3});
  advance(middle,5); advance(front,5);
  const a=middle.telemetry(), b=front.telemetry(),weight=front.mass*DEFAULTS.gravity;
  assert.ok(Math.abs(a.frontAxleLoad-a.rearAxleLoad)<1e-8);
  assert.ok(b.frontAxleLoad>a.frontAxleLoad+2000);
  assert.ok(b.rearAxleLoad<a.rearAxleLoad-2000);
  assert.ok(Math.abs(b.frontAxleLoad+b.rearAxleLoad-weight)<.01);
  // The small suspension pitch adds a geometric correction to the textbook level chassis formula.
  const expectedFrontFraction=.5+.3/DEFAULTS.wheelbase;
  assert.ok(Math.abs(b.frontAxleLoad/weight-expectedFrontFraction)<.003);
});

test('higher CG increases acceleration load transfer without inventing extra engine force',()=>{
  const low=new PhysicsSim(), high=new PhysicsSim({cgY:.3});
  advance(low,4,{throttle:.5,stabilize:false}); advance(high,4,{throttle:.5,stabilize:false});
  const a=low.telemetry(),b=high.telemetry();
  assert.ok(b.rearAxleLoad>a.rearAxleLoad+900);
  assert.ok(b.frontAxleLoad<a.frontAxleLoad-900);
  assert.ok(Math.abs(high.state.acceleration.x-low.state.acceleration.x)<.02);
});

test('shifted CG changes actual thruster moment and inertia changes angular acceleration',()=>{
  const shifted=new PhysicsSim({cgX:.3,gravity:0,contactEnabled:false,aeroEnabled:false});
  shifted.step(.002,{stabilize:false,thrusterCommands:[.2,.2,.2,.2]});
  assert.ok(Math.abs(shifted.lastTorque.z+.3*shifted.totalThrust)<1e-9);
  assert.ok(shifted.state.omega.z<0,'balanced body-mounted lift ahead of shifted CG pitches the nose down');
  const normal=new PhysicsSim({gravity:0,contactEnabled:false,aeroEnabled:false});
  const doubled=new PhysicsSim({gravity:0,contactEnabled:false,aeroEnabled:false,inertiaRoll:1800});
  for(const s of [normal,doubled]) s.step(.002,{stabilize:false,thrusterCommands:[.5]});
  assert.ok(Math.abs(doubled.state.omega.x/normal.state.omega.x-.5)<1e-12);
  assert.ok(Math.abs(doubled.state.vel.y-normal.state.vel.y)<1e-12);
});

test('Ackermann front wheels share a turn centre, with mirror symmetry',()=>{
  const left=new PhysicsSim(),right=new PhysicsSim();
  left.step(.002,{steer:1,stabilize:false});right.step(.002,{steer:-1,stabilize:false});
  const [inner,outer]=left.wheels;
  assert.ok(inner.steer>outer.steer&&outer.steer>0);
  const innerRadius=DEFAULTS.wheelbase/Math.tan(inner.steer);
  const outerRadius=DEFAULTS.wheelbase/Math.tan(outer.steer);
  assert.ok(Math.abs(outerRadius-innerRadius-DEFAULTS.trackWidth)<1e-12);
  assert.ok(Math.abs(right.wheels[1].steer+inner.steer)<1e-12);
  assert.ok(Math.abs(right.wheels[0].steer+outer.steer)<1e-12);
  assert.ok(left.wheels.slice(2).every(w=>w.steer===0));
});

test('geometry and CG reference transforms keep mounts consistent through rotation',()=>{
  const s=new PhysicsSim({cgX:.3,cgY:.2,cgZ:-.1,wheelbase:3.2,trackWidth:2});
  assert.ok(Math.abs(s.wheels[0].pos.x-s.wheels[2].pos.x-3.2)<1e-12);
  assert.ok(Math.abs(s.wheels[1].pos.z-s.wheels[0].pos.z-2)<1e-12);
  s.state.q.copy(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.6));
  const fromCG=s.thrusters[0].pos.clone().applyQuaternion(s.state.q).add(s.state.pos);
  const fromBody=s.thrusters[0].mountPosition.clone().applyQuaternion(s.state.q).add(s.bodyPosition);
  assert.ok(fromCG.distanceTo(fromBody)<1e-12);
  const airborne=new PhysicsSim({cgX:.3,cgY:.2,cgZ:-.1});airborne.reset('drop');
  advance(airborne,5);
  assert.ok([...airborne.state.pos,...airborne.state.omega].every(Number.isFinite));
  for(const x of [-1.95,1.95])for(const y of [-.32,.55])for(const z of [-.87,.87]) {
    const corner=new Vector3(x,y,z).applyQuaternion(airborne.state.q).add(airborne.bodyPosition);
    assert.ok(corner.y>=-1e-6);
  }
});
