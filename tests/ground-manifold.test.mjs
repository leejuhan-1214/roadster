import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';

const kinetic=s=>.5*s.mass*s.state.vel.lengthSq()+.5*s.state.omega.clone().multiply(s.inertia).dot(s.state.omega);
function placeOnGround(s,depth=.01){
  let lowest=Infinity;
  for(const x of [-s.bodyHalf[0],s.bodyHalf[0]])for(const y of [s.bodyBoxCenter.y-s.bodyHalf[1],s.bodyBoxCenter.y+s.bodyHalf[1]])for(const z of [-s.bodyHalf[2],s.bodyHalf[2]]){
    lowest=Math.min(lowest,new Vector3(x,y,z).sub(s.cg).applyQuaternion(s.state.q).y);
  }
  s.state.pos.y=-lowest-depth;
}

test('a simultaneous level body impact has no arbitrary roll, pitch or sideways impulse',()=>{
  for(const mu of [0,1.15])for(const yaw of [0,.47,1.6]){
    const s=new PhysicsSim({gravity:0,aeroEnabled:false,friction:mu});
    s.state.q.setFromAxisAngle(new Vector3(0,1,0),yaw);placeOnGround(s);s.state.vel.set(0,-5,0);
    const energy=kinetic(s),mass=s.mass;s._resolveGround();
    assert.ok(s.state.omega.length()<1e-7);assert.ok(Math.hypot(s.state.vel.x,s.state.vel.z)<1e-7);
    assert.ok(Math.abs(s.state.vel.y-.25)<1e-7);
    assert.ok(Math.abs(s.groundCorrectionImpulseNs-mass*5.25)<1e-4);
    assert.ok(Math.abs(kinetic(s)/energy-.05**2)<1e-8);
  }
});

test('body impacts dissipate kinetic energy and keep zero-friction tangent momentum',()=>{
  for(const angle of [-1.3,-.3,0,.3,1.3])for(const mu of [0,.4]){
    const s=new PhysicsSim({gravity:0,aeroEnabled:false,friction:mu});
    s.state.q.setFromAxisAngle(new Vector3(1,0,1).normalize(),angle);placeOnGround(s);
    s.state.vel.set(4,-6,3);s.state.omega.set(.3,-.2,.4);const energy=kinetic(s);
    s._resolveGround();assert.ok(kinetic(s)<=energy+1e-6);
    assert.ok([...s.state.vel,...s.state.omega,...s.state.q].every(Number.isFinite));
    if(mu===0){assert.equal(s.state.vel.x,4);assert.equal(s.state.vel.z,3);}
  }
  const speeds=[0,.4].map(mu=>{const s=new PhysicsSim({gravity:0,aeroEnabled:false,friction:mu});placeOnGround(s);s.state.vel.set(4,-6,3);s._resolveGround();return Math.hypot(s.state.vel.x,s.state.vel.z);});
  assert.ok(speeds[1]<speeds[0]);
});

test('slow body contact has no restitution jitter and separating contact gets no impulse',()=>{
  for(const vy of [-.1,.1]){
    const s=new PhysicsSim({gravity:0,aeroEnabled:false,friction:0});placeOnGround(s);s.state.vel.set(0,vy,0);
    s._resolveGround();assert.ok(s.state.omega.length()<1e-7);
    if(vy<0)assert.ok(Math.abs(s.state.vel.y)<1e-7);
    else {assert.equal(s.state.vel.y,vy);assert.equal(s.groundCorrectionImpulseNs,0);}
  }
});

test('symmetric 3 m drops remain level and total ground impulse converges with timestep',()=>{
  const impulses=[];
  for(const dt of [.002,.001,.0005]){
    const s=new PhysicsSim({aeroEnabled:false,friction:0,rollingResistance:0});
    s.state.pos.y=.31+s.params.wheelRadius+3;s.contactCount=0;
    let impulse=0,omega=0;
    for(let step=0;step<Math.round(3/dt);step++){
      s.step(dt,{stabilize:false});impulse+=s.groundForceN*dt+s.groundCorrectionImpulseNs;
      omega=Math.max(omega,s.state.omega.length());
    }
    assert.ok(omega<1e-5,`dt=${dt}: artificial spin ${omega}`);
    assert.ok(Math.abs(impulse-s.mass*s.params.gravity*3-s.mass*s.state.vel.y)<1e-5);
    impulses.push(impulse);
  }
  assert.ok(Math.max(...impulses)-Math.min(...impulses)<.05);
});
