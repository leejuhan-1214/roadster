import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3,Quaternion} from 'three';
import {FlightScene} from '../dist/js/scene.js';
import {SimulationVisualClock} from '../dist/js/simulation-visual-clock.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {RenderStateBuffer} from '../dist/js/render-state.js';

function fixture(){
  const scene=Object.create(FlightScene.prototype);
  Object.assign(scene,{scene:new Scene(),mode:'lab',elapsed:100,vehicle:{},hasCustomModel:true,jets:[],forceArrows:[]});
  scene.createParticles();
  const state={time:3,pos:new Vector3(0,2,0),vel:new Vector3(),q:new Quaternion()};
  return {scene,view:{state,thrusters:[{pos:new Vector3(),dir:new Vector3(0,1,0),force:14000}],bodyPosition:state.pos}};
}

test('paused exhaust keeps its shader phase and grounded particle state unchanged',()=>{
  const {scene,view}=fixture();const particle=scene.particlesData[0];
  particle.life=particle.maxLife=1;particle.vel.set(3,-1,4);
  scene.particlePositions.set([1,.03,2]);scene.particleSizes[0]=.4;scene.particleAlphas[0]=.3;
  const before={velocity:particle.vel.toArray(),position:Array.from(scene.particlePositions.slice(0,3)),size:scene.particleSizes[0],life:particle.life,index:scene.particleIndex};
  scene.updateJets(view,0,false);
  assert.equal(scene.jets[0].material.uniforms.time.value,3,'plume phase follows simulation time, not wall time');
  assert.deepEqual({velocity:particle.vel.toArray(),position:Array.from(scene.particlePositions.slice(0,3)),size:scene.particleSizes[0],life:particle.life,index:scene.particleIndex},before);
  scene.elapsed+=10;scene.updateJets(view,0,false);
  assert.equal(scene.jets[0].material.uniforms.time.value,3);
});
test('exhaust emission follows elapsed simulation time at normal and tenth speed',()=>{
  const full=fixture(),slow=fixture(),fullClock=new SimulationVisualClock(),slowClock=new SimulationVisualClock();
  fullClock.advance(0);slowClock.advance(0);
  for(let frame=1;frame<=100;frame++){
    for(const [world,clock,time]of [[full,fullClock,frame*.01],[slow,slowClock,frame*.001]]){
      world.view.state.time=time;const tick=clock.advance(time,time);
      world.scene.updateJets(world.view,tick.dt,false,tick.time);
    }
  }
  assert.equal(full.scene.particleIndex,100);assert.equal(slow.scene.particleIndex,10);
  assert.equal(full.scene.jets[0].material.uniforms.time.value,1);
  assert.equal(slow.scene.jets[0].material.uniforms.time.value,.1);
  const count=slow.scene.particleIndex;
  for(let frame=0;frame<50;frame++){slow.scene.elapsed+=.02;const tick=slowClock.advance(.1,.1);slow.scene.updateJets(slow.view,tick.dt,false,tick.time);}
  assert.equal(slow.scene.particleIndex,count);
});

test('clock holds short interpolation rewinds and detects a real solver reset',()=>{
  const clock=new SimulationVisualClock();assert.equal(clock.advance(1,1).dt,0);
  const rewind=clock.advance(.998,1);assert.equal(rewind.dt,0);assert.equal(rewind.reset,false);assert.equal(rewind.time,1);
  assert.ok(Math.abs(clock.advance(1.002,1.004).dt-.002)<1e-12);
  const reset=clock.advance(0,0);assert.equal(reset.reset,true);assert.equal(reset.dt,0);assert.equal(reset.time,0);
  assert.equal(clock.advance(.002,.002).dt,.002);
});

test('new trial clears previously emitted particles and accumulated fractions',()=>{
  const {scene,view}=fixture();scene.physicsVisualClock=new SimulationVisualClock();scene.physicsVisualClock.advance(3,3);
  scene.updateJets(view,.107,false,3);assert.equal(scene.particleIndex,10);assert.ok(scene.particlesData.some(p=>p.life>0));
  scene.resetPhysicalEffects();
  assert.equal(scene.particleIndex,0);assert.deepEqual(scene.jetEmissionCarry,[]);assert.ok(scene.particlesData.every(p=>p.life===0));
  assert.ok(scene.particleAlphas.every(alpha=>alpha===0));assert.equal(scene.particlePoints.visible,false);
  assert.equal(scene.physicsVisualClock.advance(.002,.002).dt,0,'do not advect from the preceding trial');
  const tick=scene.physicsVisualClock.advance(.004,.004);assert.equal(tick.dt,.002);
});

test('render buffer captures and interpolates the same simulation timestamp as the car',()=>{
  const sim=new PhysicsSim();sim.state.time=7;const buffer=new RenderStateBuffer(sim);
  assert.equal(buffer.sample(.2).time,7);
  buffer.beforeStep();sim.step(.002,{});buffer.afterStep(sim);
  assert.ok(Math.abs(buffer.sample(.25).time-7.0005)<1e-12);assert.equal(sim.state.time,7.002);
  buffer.reset(sim);for(const alpha of [0,.5,1])assert.equal(buffer.sample(alpha).time,7.002);
  sim.reset();buffer.reset(sim);assert.equal(buffer.sample(.5).time,0);
});