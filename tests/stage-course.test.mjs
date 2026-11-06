import {PhysicsSim} from '../dist/js/physics.js';
import {COURSE,createStageRun} from '../dist/js/stage.js';
import test from 'node:test';
import assert from 'node:assert/strict';

// Feasibility replay through motor, steering and finite-gas valves.
// Analogue feedback commands verify physics feasibility, not keyboard usability.
test('the complete obstacle course can be finished with finite gas and no state injection',()=>{
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const sim=new PhysicsSim();sim.setObstacles(COURSE.obstacles);const run=createStageRun();
let phase='drive',flightStart=0,peak=0,firstTouch=null,collisions=new Set();
for(let i=0;i<45000;i++){
 const p=sim.state.pos,v=sim.state.vel,t=sim.state.time,heading=sim.telemetry().attitude.yaw;
 let input={fan:false,wing:false,stabilize:true};
 if(phase==='drive'){
  const look=p.x+5;
  const z=look<12?-3:look<22?-3+(look-12)*.3:0;
  const desired=Math.atan2(-(z-p.z),5);
  input.steer=clamp(wrap(desired-heading)*3,-1,1);
  input.throttle=clamp((6.5-Math.hypot(v.x,v.z))*.5,-1,1);
  if(run.progress>=1&&p.x>20){phase='flight';flightStart=t;}
 }
 if(phase==='flight'){
  const u=t-flightStart;
  input.lift=u<.95?1:0;
  input.airMoveForward=clamp((7.0-v.x)*.3,-.6,.6);
  input.airMoveRight=clamp(-.5*p.z-.7*v.z,-.8,.8);
  input.yaw=clamp(-heading*3-sim.state.omega.y*.8,-1,1);
  if(run.progress>=2&&p.x>30){phase='land';}
 }
 if(phase==='land'){
  input.lift=v.y<-.15&&p.y-sim.restHeight<v.y*v.y/(2*2.7)+.18?1:0;
  input.airMoveForward=clamp(-v.x*.7,-1,0);
  input.airMoveRight=clamp(-.4*p.z-.7*v.z,-1,1);
  input.brake=1;
  if(sim.contactCount>0&&firstTouch===null){firstTouch={x:p.x,z:p.z,v:v.y,t};phase='stop';}
 }
 if(phase==='stop'){input.fan=true;input.steer=clamp((Math.atan2(-p.z,5)-heading)*3,-1,1);if(p.x<38){input.throttle=clamp((4.0-Math.hypot(v.x,v.z))*.5,-1,1);}else input.brake=1;}
 const previous=p.clone();sim.step(.002,input);run.update(previous,sim,.002);
 peak=Math.max(peak,sim.telemetry().altitude);
 for(const c of sim.obstacleContacts)collisions.add(c);
 if(run.status==='complete'||run.status==='failed')break;
}
assert.equal(run.status,'complete');
assert.equal(run.progress,3);assert.equal(collisions.size,0);
assert.ok(run.elapsed<12);assert.ok(peak>1.5&&peak<4);
assert.ok(firstTouch&&Math.abs(firstTouch.v)<1.5);
assert.ok(sim.state.gas>100&&sim.state.gas<sim.initialGas);
assert.ok(Math.hypot(sim.state.vel.x,sim.state.vel.z)<1.5);
});
