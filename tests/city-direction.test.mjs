import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';

const STEP=.002,params={...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false};
const keys=(...codes)=>new Set(codes);
function advance(sim,driver,input,seconds){for(let i=0;i<seconds/STEP;i++)sim.step(STEP,driver.update(input,sim,STEP));}
function airborne(options={},extra={}){
  const sim=new PhysicsSim({...params,...extra}),driver=new DrivingController(options);
  sim.reset('flight');sim.state.pos.y=sim.restHeight+20;sim.state.vel.set(0,0,0);
  return {sim,driver};
}

test('A/D actually changes ground heading through loaded tires with left/right symmetry',()=>{
  const states=[];
  for(const code of ['KeyA','KeyD']){
    const sim=new PhysicsSim(params),driver=new DrivingController();
    advance(sim,driver,keys('KeyW'),1);
    const gas=sim.state.gas;
    advance(sim,driver,keys('KeyW',code),2);
    assert.equal(sim.contactCount,4);assert.equal(sim.state.gas,gas,'ground steering uses tires, not a yaw thruster');
    states.push({yaw:sim.telemetry().attitude.yaw,z:sim.state.pos.z});
  }
  assert.ok(states[0].yaw>.4&&states[0].z<-5,'A turns and travels to the driver left');
  assert.ok(states[1].yaw<-.4&&states[1].z>5,'D turns and travels to the driver right');
  assert.ok(Math.abs(states[0].yaw+states[1].yaw)<1e-9);
});

test('default airborne A/D translates left and right with level heading and finite gas',()=>{
  for(const [code,sign]of [['KeyA',-1],['KeyD',1]]){
    const {sim,driver}=airborne(),initial=sim.state.pos.clone(),q=sim.state.q.clone(),gas=sim.state.gas;
    assert.equal(driver.flightSteering,'strafe');
    const command=driver.update(keys(code),sim,STEP);
    assert.equal(command.yaw,0);assert.equal(command.airMoveRight,sign);assert.equal(command.flightAssist,true);
    assert.deepEqual(sim.state.q,q);assert.deepEqual(sim.state.pos,initial,'controller only requests forces and must not move the body directly');
    advance(sim,driver,keys(code),1.2);
    assert.ok(sign*sim.state.pos.z>2&&sign*sim.state.vel.z>4,'lift nozzle vectoring moves the whole rigid body sideways');
    assert.ok(Math.abs(sim.state.pos.x-initial.x)<.02);
    assert.ok(Math.abs(sim.telemetry().attitude.yaw)<.01,'A/D alone must keep the original heading');
    assert.ok(Math.abs(sim.state.q.x)<.025&&Math.abs(sim.state.q.z)<.025,'the chassis stays level');
    assert.ok(Math.abs(sim.state.pos.y-initial.y)<.15,'carrier thrust supports the sideways manoeuvre');
    assert.ok(sim.state.gas<gas-20);assert.equal(sim.contactCount,0);assert.equal(sim.frictionForceN,0);
    assert.ok(sign*sim.gimbalZ>.3,'the nozzle swivels in the commanded lateral direction');
  }
});

test('explicit turn mode retains A/D heading control with finite-gas carrier thrust',()=>{
  for(const [code,sign]of [['KeyA',1],['KeyD',-1]]){
    const {sim,driver}=airborne({flightSteering:'turn'}),initial=sim.state.pos.clone(),q=sim.state.q.clone(),gas=sim.state.gas;
    const command=driver.update(keys(code),sim,STEP);
    assert.equal(command.yaw,sign);assert.equal(command.airMoveRight,0);assert.equal(command.flightAssist,true);
    assert.deepEqual(sim.state.q,q);assert.deepEqual(sim.state.pos,initial,'controller only requests actuator inputs');
    advance(sim,driver,keys(code),1.2);
    assert.ok(sign*sim.telemetry().attitude.yaw>.4,'steering must change actual body direction, not just mesh wheels');
    assert.ok(Math.abs(sim.state.pos.y-initial.y)<.15,'active manoeuvre damps vertical speed');
    assert.ok(sim.state.gas<gas-20);assert.equal(sim.contactCount,0);assert.equal(sim.frictionForceN,0);
    assert.ok(sim.thrusters.slice(6).some(t=>t.force>0),'actual yaw nozzles deliver the turning torque');
  }
});

test('Q/E remains explicit heading control alongside default lateral A/D',()=>{
  for(const [code,sign]of [['KeyQ',1],['KeyE',-1]]){
    const {sim,driver}=airborne();
    const command=driver.update(keys('KeyA',code),sim,STEP);
    assert.equal(command.airMoveRight,-1);assert.equal(command.yaw,sign);
    advance(sim,driver,keys(code),.8);
    assert.ok(sign*sim.telemetry().attitude.yaw>.2,'Q/E must still request real yaw torque');
  }
});

test('airborne lateral directions follow the current body heading rather than world axes',()=>{
  const yaw=Math.PI/2;
  for(const [code,sign]of [['KeyA',-1],['KeyD',1]]){
    const {sim,driver}=airborne();sim.state.q.set(0,Math.sin(yaw/2),0,Math.cos(yaw/2));
    advance(sim,driver,keys(code),1.2);
    assert.ok(sign*sim.state.pos.x>2&&sign*sim.state.vel.x>4);
    assert.ok(Math.abs(sim.state.pos.z)<.02);
    assert.ok(Math.abs(sim.telemetry().attitude.yaw-yaw)<.01);
  }
});

test('empty tank cannot invent lateral translation or A/D yaw in either direction',()=>{
  for(const code of ['KeyA','KeyD']){
    const {sim,driver}=airborne({}, {tankPressureMPa:.101325});
    advance(sim,driver,keys(code),.6);
    assert.equal(sim.totalThrust,0);assert.equal(sim.contactCount,0);
    assert.ok(Math.hypot(sim.state.vel.x,sim.state.vel.z)<1e-9);
    assert.ok(Math.abs(sim.telemetry().attitude.yaw)<1e-9);
  }
});

test('flight assist is limited by gas and can be disabled for unassisted flight',()=>{
  const empty=airborne({}, {tankPressureMPa:.101325}),disabled=airborne({flightSteering:'strafe',flightAssist:false});
  for(const {sim,driver}of [empty,disabled]){
    const initial=sim.state.pos.y;
    advance(sim,driver,keys('KeyA'),.6);
    assert.ok(initial-sim.state.pos.y>1.5);assert.equal(sim.totalThrust,0);assert.equal(sim.frictionForceN,0);
    assert.ok(Math.abs(sim.state.vel.z)<1e-9,'an empty or disabled lift system cannot invent lateral force');
  }
});

test('city landing assist reduces horizontal velocity and completes a powered descent through real contact',()=>{
  const {sim,driver}=airborne();sim.state.pos.y=sim.restHeight+3;sim.state.vel.set(2,-1,0);
  const initialGas=sim.state.gas;
  assert.equal(driver.toggleLandingAssist(sim),true);
  let peakContactSpeed=0;
  for(let i=0;i<5000&&driver.landingAssist;i++){
    const input=driver.update(keys(),sim,STEP);sim.step(STEP,input);
    peakContactSpeed=Math.max(peakContactSpeed,sim.lastImpactSpeed||0);
  }
  assert.equal(driver.landingStatus,'complete');assert.equal(driver.landingAssist,false);
  assert.equal(sim.contactCount,4);assert.ok(Math.hypot(sim.state.vel.x,sim.state.vel.z)<.4);
  assert.ok(Math.abs(sim.state.vel.y)<.2);assert.ok(peakContactSpeed<1.5);
  assert.ok(sim.state.gas>0&&sim.state.gas<initialGas-30);
  advance(sim,driver,keys(),.5);assert.ok(Math.abs(sim.state.pos.y-sim.restHeight)<.1);
});

test('manual controls cancel landing assist; altitude target and mode preferences survive correctly',()=>{
  const {sim,driver}=airborne({flightSteering:'strafe',flightAssist:false});
  driver.toggleLandingAssist(sim);driver.update(keys('KeyD'),sim,STEP);
  assert.equal(driver.landingAssist,false);assert.equal(driver.landingStatus,'manual');
  driver.toggleLandingAssist(sim);assert.equal(driver.setAltitudeTarget(30,sim),true);
  assert.equal(driver.landingAssist,false);assert.equal(driver.altHold,true);assert.equal(driver.targetHeight,30);
  assert.equal(driver.setAltitudeTarget(-1,sim),false);assert.equal(driver.setAltitudeTarget(Infinity,sim),false);assert.equal(driver.targetHeight,30);
  driver.reset();assert.equal(driver.flightSteering,'strafe');assert.equal(driver.flightAssist,false);
  assert.equal(driver.altHold,false);assert.equal(driver.landingAssist,false);
});

test('landing assist on a rolling grounded car uses wheel braking without lifting or spending gas',()=>{
  const sim=new PhysicsSim(params),driver=new DrivingController();sim.reset('rolling');
  const gas=sim.state.gas;
  assert.equal(sim.contactCount,4);assert.equal(driver.toggleLandingAssist(sim),true);
  const command=driver.update(keys(),sim,STEP);
  assert.equal(command.throttle,0);assert.equal(command.stabilize,false);
  assert.equal(command.verticalAcceleration,-sim.params.gravity);
  for(let i=0;i<2500&&driver.landingAssist;i++)sim.step(STEP,driver.update(keys(),sim,STEP));
  assert.equal(driver.landingStatus,'complete');assert.equal(sim.contactCount,4);
  assert.ok(Math.hypot(sim.state.vel.x,sim.state.vel.z)<.4);
  assert.equal(sim.state.gas,gas,'ground stop must leave the finite tank untouched');
  assert.equal(sim.totalThrust,0);
});
