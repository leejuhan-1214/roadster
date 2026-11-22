import test from 'node:test';import assert from 'node:assert/strict';import {Scene} from 'three';import {PhysicsSim} from '../dist/js/physics.js';import {TireEffects,tireSlipIntensity} from '../dist/js/tire-effects.js';
test('smoke requires loaded sliding tires, not just the Shift key',()=>{assert.equal(tireSlipIntensity({load:0,slip:1},5,20),0);assert.equal(tireSlipIntensity({load:5000,slip:0},0,20),0);assert.equal(tireSlipIntensity({load:5000,slip:1},0,0),0);assert.ok(tireSlipIntensity({load:5000,slip:0},3,20)>.5);});
test('skid marks lie directly on the track and its raised kerb',()=>{
  const sim=new PhysicsSim(),effects=new TireEffects(new Scene());
  sim.reset('rolling');sim.state.vel.x=8;
  for(const [i,w] of sim.wheels.entries()){w.load=4000;w.slip=.8;w.surfaceY=i%2?.028:0;}
  for(let i=0;i<3;i++){
    sim.state.time=i*.04;sim.state.pos.x=i*.32;effects.update(sim,sim,true);
  }
  assert.equal(effects.marks.count,4);
  for(let i=0;i<sim.wheels.length;i++){
    effects.marks.getMatrixAt(i,effects.dummy.matrix);
    assert.ok(Math.abs(effects.dummy.matrix.elements[13]-sim.wheels[i].surfaceY-.0035)<1e-6);
  }
});
test('physical drift emits bounded smoke and connected marks; pause and reset are stable',()=>{const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});sim.reset('rolling');const effects=new TireEffects(new Scene());effects.update(sim,sim,true);for(let i=0;i<600;i++){sim.step(.002,{throttle:.6,steer:.3,handbrake:1,stabilize:false});if(i%8===0)effects.update(sim,sim,true);}assert.ok(effects.marks.count>30);assert.ok(effects.particles.some(p=>p.life>0));effects.update(sim,sim,true);const count=effects.next;effects.update(sim,sim,true);assert.equal(effects.next,count);assert.equal(effects.particles.length,160);sim.reset('ground');effects.update(sim,sim,true);assert.equal(effects.marks.count,0);assert.ok(effects.particles.every(p=>p.life===0));});
