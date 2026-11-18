import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {resolveRivalContact} from '../dist/js/race-contact.js';

test('a faster car meeting the back of a moving rival keeps its sideways velocity',()=>{
  const sim=new PhysicsSim({bodyLength:4.4,bodyWidth:1.9});
  sim.state.pos.set(-4.3,sim.restHeight,0);
  sim.state.vel.set(18,0,.8);
  const rival={x:0,z:0,speed:10,heading:0};
  resolveRivalContact(sim,rival,.002);
  assert.equal(sim.state.vel.x,10);
  assert.equal(sim.state.vel.z,.8);
  assert.ok(sim.state.pos.x < -4.3);
});

test('two cars on neighboring lines can overtake; a high airborne car clears its rival',()=>{
  const sim=new PhysicsSim(),rival={x:0,z:0,speed:12,heading:0};
  for(const [x,y,z] of [[0,sim.restHeight,3],[0,sim.restHeight+2,0]]){
    sim.state.pos.set(x,y,z);sim.state.vel.set(22,0,0);
    resolveRivalContact(sim,rival,.002);
    assert.deepEqual(sim.state.pos.toArray(),[x,y,z]);
    assert.equal(sim.state.vel.x,22);
  }
});
