import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';

const box=(id,x,z,width=8,depth=8)=>({id,center:[x,4,z],size:[width,8,depth]});

test('tile updates retain prepared core and unchanged tile grids, plus impact history',()=>{
  const sim=new PhysicsSim(),core=Array.from({length:500},(_,i)=>box('core-'+i,1000+i*10,1000));
  sim.setObstacles(core);
  const coreIndex=sim.obstacleIndex,coreBox=sim.obstacles[0];
  const west=[box('west',-256,0)];
  assert.equal(sim.setObstacleChunk('-1,0',west),true);
  const westGroup=sim.obstacleChunks.get('-1,0'),impact={id:'west',speed:2};
  sim.obstacleContacts=['west'];sim.lastObstacleImpact=impact;
  sim.setObstacleChunk('0,0',[box('east',256,0)]);
  assert.equal(sim.obstacleIndex,coreIndex);assert.equal(sim.obstacles[0],coreBox);
  assert.equal(sim.obstacleChunks.get('-1,0'),westGroup);
  assert.equal(sim.setObstacleChunk('-1,0',west),false);
  assert.deepEqual(sim.obstacleContacts,['west']);assert.equal(sim.lastObstacleImpact,impact);
  assert.equal(sim.obstacles.length,502);
  assert.equal(sim.removeObstacleChunk('0,0'),true);assert.equal(sim.removeObstacleChunk('missing'),false);
  assert.equal(sim.obstacles.length,501);assert.equal(sim.obstacleIndex,coreIndex);
  assert.equal(sim.obstacleChunks.get('-1,0'),westGroup);
});

test('tile bounds use entire footprints crossing tile edges and preserve seam roof support',()=>{
  const sim=new PhysicsSim();sim.setObstacles([]);
  const west={id:'west-roof',kind:'prism',center:[-8,4,0],size:[32,8,20],footprint:[[-24,-10],[8,-10],[8,10],[-24,10]]};
  const east={id:'east-roof',kind:'prism',center:[20,4,0],size:[24,8,20],footprint:[[8,-10],[32,-10],[32,10],[8,10]]};
  sim.setObstacleChunk('-1,0',[west]);sim.setObstacleChunk('0,0',[east]);
  for(const x of [-24,-.001,0,7.999,8,8.001,32])assert.equal(sim.surfaceHeightAt(x,0,20),8);
  sim.setObstacleChunk('0,0',[{...east,center:[20,6,0],size:[24,12,20]}]);
  assert.equal(sim.surfaceHeightAt(7.999,0,20),8);
  assert.equal(sim.surfaceHeightAt(8,0,20),12);
  sim.removeObstacleChunk('-1,0');assert.equal(sim.surfaceHeightAt(-.001,0,20),0);
  assert.equal(sim.surfaceHeightAt(8,0,20),12);
});

test('failed tile replacement keeps previous colliders and setObstacles clears all tiles',()=>{
  const sim=new PhysicsSim();sim.setObstacles([box('base',100,0)]);
  sim.setObstacleChunk('current',[box('wall',0,0)]);
  const group=sim.obstacleChunks.get('current'),list=sim.obstacles;
  assert.throws(()=>sim.setObstacleChunk('current',[{center:[0,0,0],size:[-1,2,3]}]),TypeError);
  assert.equal(sim.obstacleChunks.get('current'),group);assert.equal(sim.obstacles,list);
  assert.equal(sim.surfaceHeightAt(0,0,20),8);
  sim.reset();assert.equal(sim.surfaceHeightAt(0,0,20),8);
  sim.setObstacles([]);assert.equal(sim.obstacleChunks.size,0);assert.equal(sim.obstacles.length,0);
  assert.equal(sim.surfaceHeightAt(0,0,20),0);
});

test('streamed groups produce the same collision resolution as one complete static index',()=>{
  const core=[{id:'wall',center:[8,3,0],size:[.2,6,15]}];
  const nearby=[{id:'platform',center:[-20,.5,0],size:[10,1,10]}];
  const distant=Array.from({length:500},(_,i)=>box('far'+i,200+(i%25)*18,200+Math.floor(i/25)*18));
  const a=new PhysicsSim({aeroEnabled:false}),b=new PhysicsSim({aeroEnabled:false});
  a.setObstacles(core);a.setObstacleChunk('near',nearby);a.setObstacleChunk('far',distant);
  b.setObstacles([...core,...nearby,...distant]);
  for(const sim of [a,b]){sim.state.vel.x=12;for(const wheel of sim.wheels)wheel.omega=12/sim.params.wheelRadius;}
  for(let i=0;i<500;i++){a.step(.002,{});b.step(.002,{});}
  assert.ok(a.state.pos.distanceTo(b.state.pos)<1e-10);
  assert.ok(a.state.vel.distanceTo(b.state.vel)<1e-10);
  assert.equal(a.collisionCount,b.collisionCount);assert.equal(a.lastObstacleImpact.id,'wall');
});
