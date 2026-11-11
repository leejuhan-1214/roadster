import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';

const STEP=.002,keys=(...codes)=>new Set(codes);
// Preserve the original DB11 support geometry that exposed this bug, even when
// its imported collision bounds change. The hull can rest below all four tires.
const LOW_HULL={...CITY_DRIVE_PARAMS,aeroEnabled:false,roadRoughness:0,dryMass:1950,
  wheelbase:2.8,trackWidth:1.625863944128892,wheelRadius:.286649633958205,
  bodyLength:4.786814212799072,bodyWidth:2.1437960863113403,
  bodyHeight:1.2989422678947449,bodyCenterY:.043977707624435425,
  liftX:.812,liftY:-.3382942531562851,liftZ:.663466773033142,
  boostX:-2.1712818123536914,boostY:-.2807578593492508,boostZ:.4815484642982483,
  yawX:1.3600597763061522,yawY:-.2807578593492508,yawZ:.7623351144790649};
function advance(sim,control,input,seconds){
  for(let n=0;n<seconds/STEP;n++)sim.step(STEP,control.update(input,sim,STEP));
}

test('a hull-supported car never spends cold gas merely to remain parked',()=>{
  for(const roadRoughness of [0,.15]){
    const sim=new PhysicsSim({...LOW_HULL,roadRoughness}),control=new DrivingController();
    const gas=sim.state.gas;let bodyOnlySteps=0;
    for(let n=0;n<2500;n++){
      const input=control.update(keys(),sim,STEP);
      assert.equal(input.stabilize,false,'ground support must not request flight stabilization');
      assert.equal(input.airborne,false);
      sim.step(STEP,input);
      if(sim.bodyGroundContacts>0&&sim.contactCount===0)bodyOnlySteps++;
    }
    assert.ok(bodyOnlySteps>1000,'exercise real hull-only contact in the rigid-body solver');
    assert.equal(sim.state.gas,gas);assert.equal(sim.state.gasUsed,0);assert.equal(sim.totalThrust,0);
    assert.ok(sim.state.pos.y-sim.restHeight>.08,'world height alone previously selected flight controls');
    const drive=control.update(keys('KeyW'),sim,.1);
    assert.ok(drive.throttle>0);assert.equal(drive.airMoveForward,0);
    assert.equal(drive.flightAssist,false);assert.equal(drive.stabilize,false);
    assert.equal(control.toggleLandingAssist(sim),false,'a settled hull has already landed');
    assert.equal(control.landingStatus,'complete');
  }
});

test('a raised road does not convert a brief loss of wheel contact into flight',()=>{
  const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false}),control=new DrivingController();
  sim.setObstacles([{id:'raised-road',center:[0,19.5,0],size:[100,1,100]}]);
  sim.state.pos.y=sim.restHeight+20.02;sim.contactCount=0;
  sim.bodyGroundContacts=0;sim.groundCorrectionImpulseNs=0;
  const drive=control.update(keys('KeyW'),sim,.1);
  assert.equal(drive.airborne,false);assert.equal(drive.stabilize,false);
  assert.ok(drive.throttle>0);assert.equal(drive.airMoveForward,0);
  advance(sim,control,keys(),2);
  assert.equal(sim.contactCount,4);assert.ok(Math.abs(sim.state.pos.y-sim.restHeight-20)<.003);
  advance(sim,control,keys('KeyW'),2);
  assert.ok(sim.state.vel.x>10,'wheel propulsion remains active on the raised road');
  assert.equal(sim.state.gasUsed,0);
  // The same road still permits actual flight above it.
  sim.state.pos.y+=1;sim.contactCount=0;sim.bodyGroundContacts=0;sim.groundCorrectionImpulseNs=0;
  const flight=control.update(keys('KeyA'),sim,STEP);
  assert.equal(flight.airborne,true);assert.equal(flight.airMoveRight,-1);
  assert.equal(flight.flightAssist,true);assert.equal(flight.throttle,0);
  sim.groundCorrectionImpulseNs=10;
  const touchdown=control.update(keys(),sim,STEP);
  assert.equal(touchdown.airborne,false);assert.equal(touchdown.stabilize,false);
});

test('explicit Space and H still launch a hull-supported vehicle through nozzle forces',()=>{
  for(const command of ['Space','KeyH']){
    const sim=new PhysicsSim(LOW_HULL),control=new DrivingController();
    advance(sim,control,keys(),.5);
    assert.equal(sim.contactCount,0);assert.ok(sim.bodyGroundContacts>0);
    const height=sim.state.pos.y,gas=sim.state.gas;
    advance(sim,control,keys(command),1.2);
    assert.ok(sim.state.pos.y>height+.3,command+' must produce actual lift');
    assert.ok(sim.state.gas<gas-10,command+' must consume actual finite gas');
    assert.equal(sim.bodyGroundContacts,0);assert.equal(sim.contactCount,0);
  }
});

test('airborne A/D retain horizontal vectoring after the ground support correction',()=>{
  for(const command of ['KeyA','KeyD']){
    const sim=new PhysicsSim({...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false});
    const control=new DrivingController({flightSteering:'strafe'});
    sim.reset('flight');sim.state.pos.y=sim.restHeight+20;sim.state.vel.set(0,0,0);
    const gas=sim.state.gas;
    advance(sim,control,keys(command),.6);
    assert.equal(sim.contactCount,0);assert.equal(sim.bodyGroundContacts,0);
    assert.equal(control.airborne,true);assert.equal(sim.lastInput.airMoveRight,command==='KeyA'?-1:1);
    assert.ok(Math.abs(sim.state.vel.z)>.25,'nozzle force must translate the vehicle');
    assert.ok(sim.state.gas<gas);assert.ok(Math.abs(sim.state.q.y)<.01,'A/D must not become yaw commands');
  }
});
