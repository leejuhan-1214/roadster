import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {StationRace} from '../dist/js/station-race.js';
import {resolveRivalContact,resolveRivalPair} from '../dist/js/race-contact.js';

function parked(car,x=0,z=0,speed=0){
  Object.assign(car,{x,z,distance:x,lateral:z,trackHeading:0,trackScale:1,heading:0,speed,
    vx:speed,vy:0,vz:0,yawRate:0,slipSpeed:0,laneOffset:0,yawSlipRate:0,yawOffset:0,heave:0});
  return car;
}
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,a+' differs from '+b);
const momentum=(sim,car)=>[sim.mass*sim.state.vel.x+car.mass*car.vx,sim.mass*sim.state.vel.y+car.mass*car.vy,
  sim.mass*sim.state.vel.z+car.mass*car.vz];
const energy=(sim,car)=>.5*(sim.mass*sim.state.vel.lengthSq()+car.mass*(car.vx**2+car.vz**2+car.vy**2)
  +sim.state.omega.clone().multiply(sim.state.omega).dot(sim.inertia)+car.yawInertia*car.yawRate**2);

test('one continuous bumper rub records its first substantial impact and retains peak readings',()=>{
  const race=new StationRace();
  const note=(speed,time)=>race.noteContact('player','nova',{speed,impulse:speed*100},time);
  note(.05,1);note(.2,1.02);
  assert.equal(race.collisionCount,0);
  note(1.2,1.04);note(2.7,1.06);note(.01,1.08);
  assert.equal(race.collisionCount,1);
  assert.deepEqual(race.lastCollision,{a:'player',b:'nova',time:1.04,speed:2.7,impulse:270});
  note(1.5,1.3);
  assert.equal(race.collisionCount,2);
});

test('a rear-end impact transfers momentum in three components and dissipates kinetic energy',()=>{
  const sim=new PhysicsSim({bodyLength:4.4,bodyWidth:1.9}), car=parked(new StationRace().rivals[0],0,0,10);
  sim.state.pos.set(-4.3,sim.restHeight,0);sim.state.vel.set(18,0,.8);
  const before=momentum(sim,car), kinetic=energy(sim,car);
  const hit=resolveRivalContact(sim,car,.002);
  assert.ok(hit.impulse>100 && hit.normal.x<-.99);
  assert.ok(sim.state.vel.x<18 && sim.state.vel.x>10);
  assert.ok(car.vx>10 && car.vx>sim.state.vel.x);
  assert.ok(car.distance>0 && sim.state.pos.x< -4.3);
  momentum(sim,car).forEach((p,i)=>close(p,before[i]));
  assert.ok(energy(sim,car)<kinetic);
});

test('off-centre impacts change yaw, transfer lateral motion, and do not repeatedly inject rebound',()=>{
  const sim=new PhysicsSim({bodyLength:4.4,bodyWidth:1.9}), car=parked(new StationRace().rivals[0],0,0,7);
  sim.state.pos.set(-4.17,sim.restHeight,.98);sim.state.vel.set(20,0,-1.5);
  const px=sim.state.pos.clone(),ox=car.x,oz=car.z;
  const angular=()=>sim.inertia.y*sim.state.omega.y+car.yawInertia*car.yawRate+
    sim.mass*(px.z*sim.state.vel.x-px.x*sim.state.vel.z)+car.mass*(oz*car.vx-ox*car.vz);
  const before=angular();
  resolveRivalContact(sim,car,.002);
  close(angular(),before);
  assert.ok(Math.abs(sim.state.omega.y)>.1 && Math.abs(car.yawRate)>.2);
  assert.ok(Math.abs(car.vz)>.01);
  let last=energy(sim,car);
  for(let i=0;i<20;i++){
    resolveRivalContact(sim,car,.002);
    assert.ok(energy(sim,car)<last+.000001);last=energy(sim,car);
  }
});

test('an AI-AI pile-up displaces both cars and the controller carries the changed velocity and position into following steps',()=>{
  const race=new StationRace();race.update(3,race.startPose);
  const [a,b,c]=race.rivals;
  parked(a,-.5,0,18);parked(b,3.83,.18,5);parked(c,8.18,.18,2);
  for(const car of race.rivals){car.gridLateral=car.lateral;car.lane=car.lateral;}
  // Stand apart from the player so all contacts here are car-to-car AI impacts.
  for(let i=0;i<100;i++)race.update(.002,race.startPose);
  assert.ok(race.collisionCount>=2);
  assert.ok(a.speed<18 && b.speed>5 && c.speed>2,'all three reacted');
  assert.ok(Math.abs(a.yawOffset)+Math.abs(b.yawOffset)>.01);
  assert.ok(c.distance>8.6,'rank follows actual forward displacement');
  const earlySlip=a.slipSpeed;
  for(let i=0;i<2500;i++)race.update(.002,race.startPose);
  assert.ok(a.distance>15 && Math.abs(a.slipSpeed)<Math.max(.1,Math.abs(earlySlip)));
});

test('opponents of unequal mass receive equal and opposite impulses',()=>{
  const race=new StationRace(),[a,b]=race.rivals;
  parked(a,-4.32,0,15);parked(b,0,0,-8);
  const initial=a.mass*a.vx+b.mass*b.vx, before=a.mass*a.vx**2+b.mass*b.vx**2;
  assert.ok(resolveRivalPair(a,b,.002).speed>22);
  close(initial,a.mass*a.vx+b.mass*b.vx);
  assert.ok(a.vx<15&&b.vx>-8);
  assert.ok(a.mass*a.vx**2+b.mass*b.vx**2<before);
});

test('clear overtakes miss, and orientation determines whether a low airborne nose catches the roof',()=>{
  const sim=new PhysicsSim(), car=parked(new StationRace().rivals[0],0,0,12);
  for(const [x,y,z] of [[0,sim.restHeight,3],[0,2.1,0]]){
    sim.state.pos.set(x,y,z);sim.state.vel.set(22,0,0);
    assert.equal(resolveRivalContact(sim,car,.002),null);
    assert.deepEqual(sim.state.pos.toArray(),[x,y,z]);
  }
  sim.state.pos.set(1.75,2.1,0);
  sim.state.q.setFromAxisAngle(sim.state.pos.clone().set(0,0,1),.52);
  assert.ok(resolveRivalContact(sim,car,.002),'the tail of the pitched shell contacts the cabin');
});

test('a vertical landing is supported by the opponent roof and then clears when boosted upward',()=>{
  const race=new StationRace(),sim=new PhysicsSim({bodyLength:4.4,bodyWidth:1.9,roadRoughness:0});
  race.update(3,race.startPose);
  for(const c of race.rivals)c.acceleration=0;
  const car=race.rivals[0];
  sim.state.pos.set(car.x,3.3,car.z);sim.state.vel.set(0,-3,0);
  let strongestDown=0;
  for(let i=0;i<2000;i++){sim.step(.002,{});race.update(.002,sim.state.pos,sim);strongestDown=Math.min(strongestDown,car.vy);}
  const bodyFloor=sim.bodyPosition.y+sim.params.bodyCenterY-sim.params.bodyHeight/2;
  assert.ok(Math.abs(bodyFloor-(1.382+car.heave))<.008);
  assert.ok(car.heave<-.05 && strongestDown<-.5);
  assert.ok(Math.abs(sim.state.vel.y)<.15 && Math.hypot(sim.state.vel.x,sim.state.vel.z)<.1);
  assert.equal(sim.rivalSupport,true);
  assert.equal(race.rivalSupport,true);
  assert.equal(race.collisionCount,1);
  sim.state.vel.y=8;
  for(let i=0;i<50;i++){sim.step(.002,{});race.update(.002,sim.state.pos,sim);}
  assert.equal(resolveRivalContact(sim,car,.002),null);
  assert.equal(sim.rivalSupport,false);
  assert.equal(race.collisionCount,1);
});
