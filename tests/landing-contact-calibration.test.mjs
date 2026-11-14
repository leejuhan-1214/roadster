import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {CONTACT_DEFAULTS,suspensionResponse,suspensionStaticCompression} from '../dist/js/landing-contact.js';

const kinetic=sim=>.5*sim.mass*sim.state.vel.lengthSq()+.5*sim.state.omega.clone().multiply(sim.inertia).dot(sim.state.omega);

test('progressive stop force is the derivative of stored elastic energy and damping is passive',()=>{
 for(const x of [.03,.119,.121,.15,.18,.24]){
  const a=suspensionResponse(x-1e-7,0),b=suspensionResponse(x+1e-7,0),r=suspensionResponse(x,0);
  const derivative=(b.linearEnergyJ+b.bumpEnergyJ-a.linearEnergyJ-a.bumpEnergyJ)/2e-7;
  assert.ok(Math.abs(derivative-r.springForce)<.001);
  for(const rate of [-10,-1,0,1,10]){const d=suspensionResponse(x,rate);assert.ok(d.force>=0);assert.ok((d.force-d.springForce)*rate>=-1e-9);assert.ok(d.dissipationW>=0);}
 }
 assert.equal(suspensionResponse(0,10).force,0);
 assert.equal(suspensionResponse(.119,0).bumpForce,0);
 assert.equal(suspensionResponse(.181,0).beyondTravel,true);
});

test('static sag solves spring and progressive stop, including heavy vehicles',()=>{
 for(const load of [2000,5000,10000,20000]){
  const x=suspensionStaticCompression(load);
  assert.ok(Math.abs(suspensionResponse(x,0).force-load)<1e-8);
 }
 const sim=new PhysicsSim({dryMass:4500,aeroEnabled:false,bodyHeight:.3,bodyCenterY:.4});
 for(let i=0;i<500;i++)sim.step(.002,{stabilize:false});
 assert.ok(Math.abs(sim.state.vel.y)<1e-8);
 assert.ok(Math.abs(sim.wheels.reduce((sum,w)=>sum+w.load,0)-sim.mass*sim.params.gravity)<1e-6);
});

test('parallel body face correction has no arbitrary corner torque and restitution dissipates energy',()=>{
 for(const yaw of [0,.7,1.8]){
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.state.q.setFromAxisAngle(new Vector3(0,1,0),yaw);
  sim.state.pos.y=-sim.bodyBoxCenter.y+sim.bodyHalf[1]-.01;sim.state.vel.set(2,-7,3);sim.state.omega.set(0,0,0);
  const before=kinetic(sim);sim._resolveGround();
  assert.ok(sim.state.omega.length()<1e-12,'flat support is centred, not one of four corners');
  assert.ok(Math.abs(sim.state.vel.y-7*CONTACT_DEFAULTS.groundRestitution)<1e-12);
  assert.ok(kinetic(sim)<before);assert.ok(sim.groundCorrectionImpulseNs>0);
  assert.equal(sim.state.vel.x,2);assert.equal(sim.state.vel.z,3);
 }
});

test('tilted edge contact keeps physical angular response without increasing kinetic energy',()=>{
 const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.state.q.setFromAxisAngle(new Vector3(1,0,0),.2);sim.state.pos.y=.1;sim.state.vel.y=-7;
 const before=kinetic(sim);sim._resolveGround();
 assert.ok(Math.abs(sim.state.omega.x)>.1);assert.ok(kinetic(sim)<=before+1e-9);
});

function measuredDrop(dt,height){
 const sim=new PhysicsSim({aeroEnabled:false,bodyHeight:1.14,bodyCenterY:.08,bodyWidth:2.2,bodyLength:4.42});
 sim.state.pos.y=.31+sim.params.wheelRadius+height;sim.state.vel.set(0,0,0);sim.contactCount=0;
 let mean20ms=0,rawPeak=0,totalImpulse=0,correction=0,maxOmega=0;const window=[],count=Math.round(.02/dt);
 const initialMass=sim.mass;
 for(let i=0;i<Math.round(3/dt);i++){
  sim.step(dt,{stabilize:false});const impulse=sim.groundForceN*dt+sim.groundCorrectionImpulseNs;
  window.push(impulse);if(window.length>count)window.shift();
  mean20ms=Math.max(mean20ms,window.reduce((a,b)=>a+b,0)/.02);rawPeak=Math.max(rawPeak,impulse/dt);
  totalImpulse+=impulse;correction+=sim.groundCorrectionImpulseNs;maxOmega=Math.max(maxOmega,sim.state.omega.length());
 }
 return {mean20ms,rawPeak,correction,maxOmega,residual:totalImpulse-initialMass*sim.params.gravity*3-initialMass*sim.state.vel.y};
}

test('a controlled hard landing preserves momentum and 20 ms force converges across three solver steps',()=>{
 const rows=[.002,.001,.0005].map(dt=>measuredDrop(dt,3));
 for(const row of rows){assert.ok(row.correction>0);assert.ok(Math.abs(row.residual)<1e-5);assert.ok(row.maxOmega<1e-10);}
 const high=Math.max(...rows.map(r=>r.mean20ms)),low=Math.min(...rows.map(r=>r.mean20ms));
 assert.ok((high-low)/high<.04,'the physical averaging window is independent of solver dt');
 assert.ok(rows[2].rawPeak>rows[0].rawPeak*3,'raw J/dt is a discretization diagnostic, not a material impact-force peak');
});

test('a mild landing without body strike also converges in the same 20 ms force metric',()=>{
 const rows=[.002,.001,.0005].map(dt=>measuredDrop(dt,.05));
 for(const row of rows){assert.equal(row.correction,0);assert.ok(Math.abs(row.residual)<1e-5);}
 const high=Math.max(...rows.map(r=>r.mean20ms)),low=Math.min(...rows.map(r=>r.mean20ms));
 assert.ok((high-low)/high<.04);
});
