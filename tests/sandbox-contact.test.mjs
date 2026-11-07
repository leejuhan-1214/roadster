import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {BODY_ENVELOPE,LIFT_LAYOUT} from '../dist/js/vehicle-layout.js';
import {SANDBOX,experimentObstacles} from '../dist/js/world-obstacles.js';
import {createStageVisual,disposeStageVisual} from '../dist/js/stage-visual.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {renderPixelRatio} from '../dist/js/render-quality.js';
const step=(s,n,input={stabilize:false})=>{for(let i=0;i<n;i++)s.step(.002,input);};
const kinetic=s=>.5*s.mass*s.state.vel.lengthSq()+.5*s.state.omega.clone().multiply(s.inertia).dot(s.state.omega);
test('sandbox visual solids and collision use identical boxes; comparison lane remains clear',()=>{
 const visual=createStageVisual(SANDBOX),sim=new PhysicsSim();sim.setObstacles(experimentObstacles());
 for(const o of SANDBOX.obstacles){const g=visual.userData.obstacles.get(o.id);assert.deepEqual(g.position.toArray(),o.center);assert.deepEqual(g.userData.collisionSize.toArray(),o.size);assert.ok(sim.obstacles.some(b=>b.id===o.id));}
 const clear=experimentObstacles('clear');assert.ok(clear.length>60);assert.ok(!clear.some(o=>SANDBOX.obstacles.includes(o)));disposeStageVisual(visual);
});
test('43.2 km/h demonstration hits the visible wall without passing its face and retains impact record',()=>{
 const s=new PhysicsSim({aeroEnabled:false});s.setObstacles(experimentObstacles());s.state.vel.x=12;for(const w of s.wheels)w.omega=12/s.params.wheelRadius;
 let max=-Infinity;for(let i=0;i<850;i++){s.step(.002,{stabilize:false});const q=s.state.q;for(const x of [-BODY_ENVELOPE.half[0],BODY_ENVELOPE.half[0]])for(const y of [-.49,.65])for(const z of [-1.1,1.1])max=Math.max(max,new Vector3(x,y,z).sub(s.cg).applyQuaternion(q).add(s.state.pos).x);}
 assert.ok(max<=8.60001);assert.equal(s.lastObstacleImpact.id,'impact-wall');assert.ok(s.lastObstacleImpact.speed>10);assert.ok(s.lastObstacleImpact.impulse>15000);assert.equal(s.collisionCount,1);assert.ok(s.state.vel.length()<2);const event=s.lastObstacleImpact;step(s,100);assert.equal(s.lastObstacleImpact,event);
 s.reset();assert.equal(s.collisionCount,0);assert.equal(s.lastObstacleImpact,null);
});
test('glancing wall collision preserves tangent momentum at zero friction, dissipates it with friction',()=>{
 const result=[];for(const mu of [0,.4]){const s=new PhysicsSim({gravity:0,aeroEnabled:false,friction:mu});s.state.pos.set(0,10,0);s.state.vel.set(2,0,15);s.contactCount=0;s.setObstacles([{id:'wall',center:[3,10,0],size:[.2,12,100]}]);const e=kinetic(s);step(s,350);assert.ok(kinetic(s)<=e+1e-6);assert.equal(s.collisionCount,1);result.push(s);}
 assert.ok(Math.abs(result[0].state.vel.z-15)<1e-9);assert.ok(result[1].state.vel.z<14.9&&result[1].state.vel.z>10);
});
test('two-wall corner remains finite and dissipates impact energy',()=>{
 const s=new PhysicsSim({gravity:0,aeroEnabled:false});s.state.pos.y=10;s.state.vel.set(12,0,12);s.contactCount=0;s.setObstacles([{id:'x',center:[5,10,0],size:[.3,12,30]},{id:'z',center:[0,10,5],size:[30,12,.3]}]);const e=kinetic(s);step(s,600);assert.ok(kinetic(s)<e);assert.ok([...s.state.pos.toArray(),...s.state.omega.toArray()].every(Number.isFinite));assert.ok(s.state.pos.x<4.85&&s.state.pos.z<4.85);
});
test('brake holds static friction against wind within tire limits; zero friction still slides',()=>{
 const result=[];for(const mu of [1.15,0]){const s=new PhysicsSim({friction:mu,windX:20});for(let i=0;i<2500;i++){s.step(.002,{brake:1,stabilize:false});for(const w of s.wheels)assert.ok(w.tireForceN<=mu*w.load+1e-6);}result.push(s);}
 assert.ok(Math.abs(result[0].state.vel.x)<.001);assert.ok(Math.abs(result[0].state.pos.x)<.005);assert.ok(result[0].brakeForceN>100);assert.ok(result[1].state.vel.x>.2);assert.equal(result[1].frictionForceN,0);
 const air=new PhysicsSim({gravity:0,aeroEnabled:false});air.state.pos.y=10;air.state.vel.x=.2;air.contactCount=0;step(air,500,{brake:1,stabilize:false});assert.equal(air.state.vel.x,.2);assert.equal(air.frictionForceN,0);
});
test('recessed lift exits stay inside the body width throughout the gimbal cone',()=>{
 const vehicle=createVehicle();for(const pivot of vehicle.gimbalNozzles){for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){const direction=new Vector3(Math.sin(25*Math.PI/180)*Math.cos(angle),Math.cos(25*Math.PI/180),Math.sin(25*Math.PI/180)*Math.sin(angle));pivot.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction);vehicle.root.updateMatrixWorld(true);const exit=pivot.userData.exitOffset.clone().applyMatrix4(pivot.matrixWorld);assert.ok(Math.abs(exit.z)+.091<1.1);assert.ok(exit.y-.091>-.61);assert.equal(pivot.parent.position.y,LIFT_LAYOUT.y);}}
});
test('smooth rendering stays within a 600k pixel budget without changing the CSS viewport',()=>{
 for(const [w,h,d] of [[1280,720,1.25],[870,668,1.25],[3840,2160,2],[320,700,1]]){const r=renderPixelRatio(w,h,d);assert.ok(w*h*r*r<=600000.0001);assert.ok(r<=1&&r>0);}
 assert.equal(renderPixelRatio(870,668,1.25),1);assert.equal(renderPixelRatio(1280,720,1.25,'detail'),1);
});

test('a light brake does not remove lateral tire grip',()=>{
 const results=[];for(const brake of [0,.01,1]){const s=new PhysicsSim({aeroEnabled:false,rollingResistance:0});s.state.vel.z=.4;const e=kinetic(s);for(let i=0;i<250;i++){s.step(.002,{brake,stabilize:false});for(const w of s.wheels)assert.ok(w.tireForceN<=s.params.friction*w.load+1e-6);}assert.ok(kinetic(s)<=e+1e-3);if(brake>0)for(const w of s.wheels){const r=w.pos.clone().applyQuaternion(s.state.q);r.y=w.surfaceY-s.state.pos.y;const v=s.state.vel.clone().add(new Vector3().crossVectors(s.state.omega.clone().applyQuaternion(s.state.q),r));assert.ok(Math.abs(v.z)<.001);}results.push(s.state.vel.z);}
 // CoM can briefly translate as the sprung chassis rolls; contact speed is the sticking constraint.
 assert.ok(Math.abs(results[1]-results[2])<.003);assert.ok(Math.abs(results[1])<.015);
});
