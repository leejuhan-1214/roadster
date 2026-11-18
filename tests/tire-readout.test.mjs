import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {createTireReadout, tireContactReading} from '../dist/js/tire-readout.js';

const dt=.002;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function projectedForce(wheel,q) {
  const normal=new Vector3(wheel.normalX,wheel.normalY,wheel.normalZ);
  const heading=new Vector3(Math.cos(wheel.steer),0,-Math.sin(wheel.steer)).applyQuaternion(q);
  const right=heading.cross(normal).normalize();
  return right.dot(new Vector3(wheel.forceX,wheel.forceY,wheel.forceZ));
}

test('signed wheel readings follow the contact plane and steering at the instant the tire force was solved',()=>{
  for (const turn of [-1,1]) {
    const sim=new PhysicsSim({aeroEnabled:false,roadRoughness:.2});
    sim.reset('rolling');
    let biasUsingLaterPose=0;
    for (let i=0;i<240;i++) {
      const solvePose=sim.state.q.clone();
      sim.step(dt,{steer:.65*turn,throttle:.5});
      for (const w of sim.wheels) {
        const reading=tireContactReading(w);
        close(reading.load,w.load);
        close(reading.lateral,projectedForce(w,solvePose));
        biasUsingLaterPose=Math.max(biasUsingLaterPose,Math.abs(reading.lateral-projectedForce(w,sim.state.q)));
      }
    }
    assert.ok(biasUsingLaterPose>.1);
    assert.ok(sim.wheels.every(w=>turn*w.lateralForceN<0));
    const left=sim.wheels[0].load+sim.wheels[2].load;
    const right=sim.wheels[1].load+sim.wheels[3].load;
    assert.ok(turn*(right-left)>0);
  }
});

test('brake static friction reports the final lateral impulse; airborne wheels and reset clear it',()=>{
  const rolling=new PhysicsSim({aeroEnabled:false}), held=new PhysicsSim({aeroEnabled:false});
  for(const sim of [rolling,held]){
    sim.state.vel.z=.012;
    sim.step(dt,{brake:sim===held ? 1 : 0});
  }
  let heldTotal=0, rollingTotal=0;
  for(const [i,w] of held.wheels.entries()){
    const reading=tireContactReading(w);
    close(reading.lateral,projectedForce(w,held.state.q));
    heldTotal+=reading.lateral;
    rollingTotal+=rolling.wheels[i].lateralForceN;
  }
  assert.ok(heldTotal<rollingTotal-1000);
  held.state.pos.y+=8;
  held.step(dt,{brake:1});
  for(const w of held.wheels) {
    assert.equal(w.lateralForceN,0);
    assert.deepEqual(tireContactReading(w),{load:0,lateral:0});
  }
  rolling.reset();
  for(const w of rolling.wheels){
    assert.ok(w.load>0);
    assert.equal(tireContactReading(w).lateral,0);
  }
});

test('the four labeled rows show their own wheel in kN with right positive and airborne state visible',()=>{
  const element=()=>({children:[],classList:{toggle(name,value){this[name]=value;}},append(...items){this.children.push(...items);}});
  const previous=globalThis.document;
  globalThis.document={createElement:element};
  try {
    const host=element(), render=createTireReadout(host), sim=new PhysicsSim();
    const loads=[4100,3350,2700,0], lateral=[-600,100,3,0];
    for(const [i,w] of sim.wheels.entries()){
      assert.equal(w.pos.x>0,i<2);
      assert.equal(w.pos.z>0,i%2===1);
      w.load=loads[i];w.lateralForceN=lateral[i];
    }
    render(sim);
    assert.deepEqual(host.children.map(row=>row.children.map(el=>el.textContent)),[
      ['앞 왼쪽','4.10 / −0.60'],['앞 오른쪽','3.35 / +0.10'],
      ['뒤 왼쪽','2.70 / 0.00'],['뒤 오른쪽','비접지']]);
    assert.deepEqual(host.children.map(row=>row.classList.airborne),[false,false,false,true]);
  } finally {
    if(previous===undefined) delete globalThis.document;
    else globalThis.document=previous;
  }
});
