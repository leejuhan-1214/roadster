import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {buildingColliders,containsFootprint} from '../dist/js/city-building-collision.js';

const diamond={id:'diamond',height:10,points:[[0,-10],[10,0],[0,10],[-10,0]]};
const concave={id:'courtyard',height:8,points:[[0,0],[20,0],[20,5],[5,5],[5,20],[0,20]]};
const noControls={stabilize:false,coastRegen:false};
test('convex building facade exactly follows rotated footprint, without strips or false corner support',()=>{
  const pieces=buildingColliders(diamond);assert.equal(pieces.length,1);
  const sim=new PhysicsSim();sim.setObstacles(pieces);
  assert.equal(sim.surfaceHeightAt(9,9,20),0,'AABB corner outside facade is open air');
  assert.equal(sim.surfaceHeightAt(4,4,20),10);
  for(const z of [-9,-6,-3,0,3,6,9])assert.equal(sim.surfaceHeightAt(0,z,20),10,'slice boundaries have continuous roof support');
});
test('concave courtyard stays empty while both wings retain complete roof support',()=>{
  const pieces=buildingColliders(concave);assert.ok(pieces.length>=2);
  const sim=new PhysicsSim();sim.setObstacles(pieces);
  for(const p of [[10,10],[18,18],[6,6]])assert.equal(sim.surfaceHeightAt(...p,20),0);
  for(const p of [[2,18],[18,2],[2,2],[5,5],[3,5]])assert.equal(sim.surfaceHeightAt(...p,20),8);
  sim.state.pos.set(12,3,12);sim.state.vel.set(0,0,0);sim.params.gravity=0;
  sim.step(.002,noControls);assert.deepEqual(sim.obstacleContacts,[]);
});
test('collision acts at the visible slanted wall and dissipates a fast oblique impact',()=>{
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.setObstacles(buildingColliders(diamond));
  sim.state.pos.set(8,5,8);sim.state.vel.set(-40,0,-40);sim.contactCount=0;
  const energy=()=>.5*sim.mass*sim.state.vel.lengthSq()+.5*sim.state.omega.clone().multiply(sim.inertia).dot(sim.state.omega);
  const before=energy();let collided=false;
  for(let i=0;i<200;i++){
    sim.step(.002,noControls);collided ||= sim.obstacleContacts.length>0;
    // The car's centre must remain outside this face, including its support extent.
    const center=sim.bodyBoxCenter.clone().sub(sim.cg).applyQuaternion(sim.state.q).add(sim.state.pos);
    const normal=new Vector3(1,0,1).normalize();
    const axes=[new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)].map(v=>v.applyQuaternion(sim.state.q));
    const support=axes.reduce((s,a,j)=>s+sim.bodyHalf[j]*Math.abs(a.dot(normal)),0);
    assert.ok(center.dot(normal)-support>=10/Math.sqrt(2)-1e-5,'chassis never penetrates the facade');
  }
  assert.ok(collided);assert.ok(energy()<before);
});
test('four tires settle across a convex-decomposition roof seam without dropping through',()=>{
  const sim=new PhysicsSim({aeroEnabled:false});sim.setObstacles(buildingColliders(concave));
  sim.state.pos.set(2.5,12,2.5);sim.contactCount=0;
  for(let i=0;i<3000;i++)sim.step(.002,noControls);
  assert.equal(sim.contactCount,4);assert.ok(Math.abs(sim.state.pos.y-(8+sim.restHeight))<.003);
  assert.ok(sim.wheels.every(w=>w.surfaceY===8&&w.load>0));
  assert.ok(Math.abs(sim.state.vel.y)<.01);
});
test('malformed nonconvex prism is rejected instead of creating arbitrary invisible walls',()=>{
  const sim=new PhysicsSim();
  assert.throws(()=>sim.setObstacles([{kind:'prism',center:[10,4,10],size:[20,8,20],footprint:concave.points}]),TypeError);
  assert.ok(containsFootprint(diamond.points,0,0));assert.ok(!containsFootprint(diamond.points,9,9));
});
