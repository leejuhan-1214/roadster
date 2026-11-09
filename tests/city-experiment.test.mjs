import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {CITY_SURFACES,CITY_EXPERIMENT_DEFAULTS,normalizeCityExperiment,cityExperimentParams,
  CityBrakeTrial,BRAKE_STOP_SPEED,brakeResultsCSV} from '../dist/js/city-experiment.js';

const fixture=(speed=10)=>({state:{time:0,pos:{x:0,z:0},vel:{x:speed,z:0}},
  contactCount:4,collisionCount:0,obstacleContacts:[],totalThrust:0});
const conditions={braking:true,settings:CITY_EXPERIMENT_DEFAULTS,vehicleId:'roadster'};
function stoppedTrial(){
  const sim=fixture(),trial=new CityBrakeTrial();trial.sample(sim,conditions);
  for(let i=1;i<=210;i++){
    const t=Math.min(i*.01,2);sim.state.time=i*.01;
    sim.state.vel.x=Math.max(0,10-5*t);sim.state.pos.x=10*t-2.5*t*t;
    trial.sample(sim,conditions);
  }
  return {sim,trial};
}

test('city settings whitelist physical experiments without mutating shared landing defaults',()=>{
  const source={surface:'ice',rollingResistance:'0.08',aeroEnabled:false,windX:Infinity,windZ:-100,
    roadRoughness:3,tankPressureMPa:0,gravity:0,bodyLength:100};
  const snapshot=structuredClone(source),normalized=normalizeCityExperiment(source),params=cityExperimentParams(source);
  assert.deepEqual(source,snapshot);assert.equal(normalized.surface,'ice');assert.equal(normalized.windX,0);
  assert.equal(normalized.windZ,-30);assert.equal(normalized.roadRoughness,1);assert.equal(params.friction,.15);
  assert.equal(params.aeroEnabled,false);assert.equal(params.rollingResistance,.08);
  for(const key of ['gravity','tankPressureMPa','bodyLength','surface'])assert.equal(params[key],undefined);
  assert.equal(CITY_EXPERIMENT_DEFAULTS.surface,'dry');assert.equal(CITY_EXPERIMENT_DEFAULTS.rollingResistance,.015);
  assert.deepEqual(normalizeCityExperiment(null),CITY_EXPERIMENT_DEFAULTS);
  assert.equal(normalizeCityExperiment({surface:'unknown',rollingResistance:''}).rollingResistance,.015);
  for(const surface of CITY_SURFACES)assert.equal(cityExperimentParams({surface:surface.id}).friction,surface.friction);
  assert.equal(cityExperimentParams({surface:'none',rollingResistance:.08}).friction,0,'Crr is independent; μ=0 limits all tire forces in the solver');
});

test('brake observer measures known deceleration, first stop and path without changing physics state',()=>{
  const before=fixture(),trial=new CityBrakeTrial(),snapshot=structuredClone(before);
  trial.sample(before,conditions);assert.deepEqual(before,snapshot);
  const {trial:measured}=stoppedTrial(),result=measured.getSnapshot().lastResult;
  assert.equal(measured.status,'complete');assert.equal(result.valid,true);
  assert.equal(result.initialSpeed,10);assert.ok(Math.abs(result.stoppingTime-1.98)<1e-8);
  assert.ok(Math.abs(result.stoppingDistance-9.999)<.001);assert.ok(Math.abs(result.maxDeceleration-5)<1e-8);
  assert.equal(result.stopSpeed,BRAKE_STOP_SPEED);assert.equal(result.decelerationWindow,.05);
  assert.equal(measured.getSnapshot().results.length,1,'continued B does not append zero-length repeats');
  assert.equal(Object.isFrozen(result),true);assert.equal(Object.isFrozen(result.settings),true);
});

test('one-step wall stop is rejected before zero speed can become a braking result',()=>{
  const sim=fixture(),trial=new CityBrakeTrial();trial.sample(sim,conditions);
  sim.state.time=.002;sim.state.pos.x=.01;sim.state.vel.x=0;
  sim.collisionCount=1;sim.obstacleContacts=['building-1'];trial.sample(sim,conditions);
  const result=trial.getSnapshot().lastResult;
  assert.equal(result.valid,false);assert.equal(result.reason,'collision');
  assert.equal(result.stoppingDistance,null);assert.equal(result.stoppingTime,null);
  sim.obstacleContacts=[];sim.state.vel.x=8;trial.sample(sim,conditions);
  assert.equal(trial.status,'invalid','held B cannot restart after collision');
  trial.sample(sim,{...conditions,braking:false});trial.sample(sim,conditions);
  assert.equal(trial.status,'measuring','a new B press starts a separate attempt');
});

test('conditions, contact, thrust, brake release, vehicle changes and clock reset invalidate a trial',()=>{
  const cases=[
    ['settings-changed',sim=>{}, {settings:{...CITY_EXPERIMENT_DEFAULTS,surface:'wet'}}],
    ['airborne',sim=>{sim.contactCount=0;},{}],
    ['thrust',sim=>{sim.totalThrust=150;},{}],
    ['released',sim=>{}, {braking:false}],
    ['vehicle-changed',sim=>{}, {vehicleId:'other'}],
    ['reset',sim=>{sim.state.time=-1;},{}],
  ];
  for(const [reason,mutate,options]of cases){
    const sim=fixture(),trial=new CityBrakeTrial();trial.sample(sim,conditions);
    sim.state.time=.02;sim.state.pos.x=.19;sim.state.vel.x=9;mutate(sim);
    trial.sample(sim,{...conditions,...options});
    assert.equal(trial.getSnapshot().lastResult.reason,reason);assert.equal(trial.status,'invalid');
    assert.equal(trial.getSnapshot().lastResult.stoppingDistance,null);
  }
  for(const sim of [fixture(1),{...fixture(),contactCount:0},{...fixture(),totalThrust:200}]){
    const trial=new CityBrakeTrial();trial.sample(sim,conditions);assert.equal(trial.status,'idle');
    assert.equal(trial.getSnapshot().results.length,0);
  }
});

test('nonstop and cancelled trials stay invalid while history is bounded and can be cleared',()=>{
  const sim=fixture(),trial=new CityBrakeTrial();trial.sample(sim,conditions);
  for(let t=.1;t<60.2;t+=.1){sim.state.time=t;sim.state.pos.x=t*10;trial.sample(sim,conditions);}
  assert.equal(trial.status,'invalid');assert.equal(trial.lastResult.reason,'timeout');
  for(let i=0;i<8;i++){
    trial.reset({keepResults:true});sim.state.time=0;sim.state.pos.x=0;trial.sample(sim,conditions);trial.cancel();
  }
  assert.equal(trial.getSnapshot().results.length,6);assert.equal(trial.lastResult.reason,'reset');
  trial.reset({keepResults:true});assert.equal(trial.getSnapshot().results.length,6);assert.equal(trial.status,'idle');
  trial.clear();assert.equal(trial.getSnapshot().results.length,0);assert.equal(trial.lastResult,null);
});

test('CSV separates successful stopping values from invalid observed travel and records test conditions',()=>{
  const {trial}=stoppedTrial();const valid=trial.lastResult;
  const invalid={...valid,id:2,valid:false,reason:'collision',stoppingDistance:null,stoppingTime:null,vehicleId:'test,"car"'};
  const csv=brakeResultsCSV([valid,invalid]),lines=csv.trim().split('\r\n');
  assert.equal(lines.length,3);assert.ok(csv.startsWith('\uFEFF'));
  assert.match(lines[0],/max_deceleration_50ms_m_s2/);assert.match(lines[0],/friction_mu/);
  assert.match(lines[2],/"no","장애물 충돌","36","",""/);
  assert.match(lines[2],/"test,""car"""/);assert.match(lines[1],/"dry","1.15","0.015","true"/);
});

test('actual tire physics gives longer wet braking and no artificial frictionless stop',()=>{
  function measure(surface,seconds){
    const settings={...CITY_EXPERIMENT_DEFAULTS,surface,aeroEnabled:false,roadRoughness:0};
    const sim=new PhysicsSim(cityExperimentParams(settings)),trial=new CityBrakeTrial();sim.reset('rolling');
    const command={brake:1,throttle:0,steer:0,stabilize:false,fan:false,wing:false};
    for(let i=0;i<seconds/.002;i++){
      trial.sample(sim,{braking:true,settings,vehicleId:'roadster'});
      if(trial.status==='complete'||trial.status==='invalid')break;
      sim.step(.002,command);
    }
    return {sim,trial,result:trial.getSnapshot().lastResult};
  }
  const dry=measure('dry',8),wet=measure('wet',10),none=measure('none',3);
  assert.equal(dry.result?.valid,true,JSON.stringify(dry.trial.getSnapshot()));
  assert.equal(wet.result?.valid,true,JSON.stringify(wet.trial.getSnapshot()));
  assert.ok(wet.result.stoppingDistance>dry.result.stoppingDistance*1.15);
  assert.ok(wet.result.stoppingTime>dry.result.stoppingTime);
  assert.equal(none.trial.status,'measuring');assert.equal(none.result,null);
  assert.ok(none.sim.state.vel.x>19.9);assert.equal(none.sim.frictionForceN,0);
});
