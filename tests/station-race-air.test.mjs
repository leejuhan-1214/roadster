import assert from 'node:assert/strict';
import test from 'node:test';
import {AIR_CEILING,AIR_APPROACH,AIR_APERTURE,AIR_GATE_SPACING,AIR_RESTART_RUNUP,
  insideRaceEnvelope,rivalAirPath,throughAirGate} from '../dist/js/station-race-air.js';
import {RACE_COURSE as course,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {projectToCourse} from '../dist/js/station-race-course.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';

const gates=course.gates.filter(g=>g.air),first=gates[0],last=gates.at(-1);
const lift={mass:2200,verticalThrustN:26000,massFlowKgS:35,contactCount:0};
function start(){
  const race=new StationRace();
  race.rivals=[]; // Isolate timing from vehicle collisions.
  race.update(3,race.startPose);return race;
}
function run(race,from,to,{height=4,sim=lift,lateral=0,allowMiss=false}={}){
  const dir=Math.sign(to-from),step=dir*2;
  for(let d=from;dir*(to-d)>0;){
    const next=dir>0?Math.min(d+step,to):Math.max(d+step,to);
    const y=typeof height==='function'?height(next):height;
    const recovered=race.update(Math.abs(next-d)/40,{...sampleCourse(next,typeof lateral==='function'?lateral(next):lateral),y},sim);
    if(recovered){
      assert.ok(allowMiss,'unexpected recovery at '+next);
      return recovered;
    }
    d=next;
  }
}

test('a grounded, unpowered, or sideways-misaligned crossing returns to the launch straight on each attempt',()=>{
  for(const settings of [{height:.6},{sim:null},{sim:{...lift,verticalThrustN:0}},{sim:{...lift,massFlowKgS:0}},
    {sim:{...lift,contactCount:1}},{lateral:7.3},{height:AIR_APERTURE.maxY+.01}]){
    const race=start();
    run(race,-6,first.distance-30,{sim:null});
    const pose=run(race,first.distance-30,first.distance+4,{...settings,
      lateral:d=>(settings.lateral||0)*Math.min(1,(d-first.distance+30)/20),allowMiss:true});
    assert.ok(pose);
    assert.equal(pose.distance,first.distance-AIR_RESTART_RUNUP);
    assert.equal(race.recoveryReason,'air-gate');assert.equal(race.airSectionStatus,'missed');
    assert.equal(race.nextGate,first.index);assert.equal(race.airGatesThisLap,0);
    assert.equal(race.airGatesPassed,0);assert.equal(race.phase,'racing');
  }
});

test('resetting mid-sector rolls back partial credits and requires a new upward nozzle impulse',()=>{
  const race=start();
  run(race,-6,gates[1].distance+1);
  assert.equal(race.airGatesThisLap,2);
  const elapsed=race.elapsed,pose=race.recover();
  assert.equal(race.elapsed,elapsed);assert.equal(race.nextGate,first.index);
  assert.equal(race.airGatesPassed,0);assert.equal(race.airGatesThisLap,0);
  assert.equal(pose.distance,first.distance-AIR_RESTART_RUNUP);
  const missed=run(race,pose.distance,first.distance+2,{sim:null,allowMiss:true});
  assert.ok(missed);assert.equal(race.nextGate,first.index);
  run(race,missed.distance,course.length+3);
  assert.equal(race.airGatesThisLap,0);assert.equal(race.airGatesPassed,3);assert.equal(race.lap,2);
  const second=run(race,course.length+3,course.length+first.distance+2,{height:.6,allowMiss:true});
  assert.equal(second.distance,course.length+first.distance-AIR_RESTART_RUNUP);
  assert.equal(race.airGatesPassed,3);
  run(race,second.distance,course.length*2+1);
  assert.equal(race.phase,'finished');assert.equal(race.airGatesPassed,6);assert.equal(race.bestAirLap,3);
});

test('a ballistic coast through correctly ordered rings qualifies after genuine thrust in the approach',()=>{
  const race=start(),entry=first.distance-12;
  run(race,-6,entry,{height:.8});
  run(race,entry,last.distance+2,{height:4,sim:{...lift,verticalThrustN:0,massFlowKgS:0}});
  assert.equal(race.airGatesPassed,3);
  assert.equal(race.airSectionStatus,'clear');
  assert.equal(race.nextGate,last.index+1);
  run(race,last.distance+2,first.distance-3);
  assert.equal(race.airGatesPassed,3);
  const firstLapGate=race.recover();
  assert.equal(firstLapGate.distance,last.distance+1.5);
});

test('a premature recovery cannot jump from the last regular gate to the air-section run-up',()=>{
  const race=start(),prev=course.gates[first.index-1];
  run(race,-6,prev.distance+4);
  const reset=race.recover();
  assert.equal(reset.distance,prev.distance+1.5);
  assert.ok(reset.distance<first.distance-AIR_RESTART_RUNUP);
});

test('rival approach, forward timing planes and track bounds use actual nonuniform stations',()=>{
  assert.equal(gates.length,3);assert.equal(gates[1].distance-first.distance,AIR_GATE_SPACING);
  assert.equal(last.distance-gates[1].distance,AIR_GATE_SPACING);
  for(const g of gates){
    for(const lap of [0,1]){
      const p=rivalAirPath(lap*course.length+g.distance,course);
      assert.ok(throughAirGate(g,-4.6,p.height+.7));
      assert.ok(throughAirGate(g,4.6,p.height+.7));
      assert.equal(p.slope,0);
    }
    assert.equal(throughAirGate(g,0,.6),false);
    assert.equal(throughAirGate(g,AIR_APERTURE.halfWidth+.01,4),false);
  }
  assert.equal(rivalAirPath(first.distance-AIR_APPROACH,course).height,0);
  assert.equal(insideRaceEnvelope({error:0},AIR_CEILING+1,course),true,'flight above the circuit is legal');
  assert.equal(insideRaceEnvelope({error:course.width/2+2},4,course),false,'airborne cuts into the infield are not legal');
});

test('a too-high or reverse start crossing gives no lap credit',()=>{
  const race=start();
  const step=(d,y,dt=.12)=>race.update(dt,{...sampleCourse(d,-3.15),y});
  step(-1,36);step(-1,36,2);step(2,18);assert.equal(race.nextGate,0);
  step(3,4);step(-1,4);assert.equal(race.completedGates,0);
  step(1,4);assert.equal(race.nextGate,1);
});

test('air-gate meshes agree with all three mandatory timing apertures',()=>{
  const world=createStationRaceWorld();
  for(const timing of gates){
    const gate=world.root.getObjectByName('Air gate '+timing.index);
    const p=sampleCourse(timing.distance,AIR_APERTURE.lateral);
    assert.equal(gate.position.x,p.x);assert.equal(gate.position.z,p.z);
    assert.equal(gate.rotation.y,p.heading);
    const geo=gate.getObjectByName('Air timing aperture').geometry;geo.computeBoundingBox();
    const b=geo.boundingBox;
    assert.ok(b.min.y<AIR_APERTURE.minY&&b.max.y>AIR_APERTURE.maxY);
    assert.ok(b.min.z< -AIR_APERTURE.halfWidth&&b.max.z>AIR_APERTURE.halfWidth);
  }
  world.dispose();
});

test('Roadster, MX-5 and the heaviest chassis can fly both timed sectors using the ordinary Space control and the original tank',()=>{
  const dt=.002,approachSpeed=32,up={x:0,y:1,z:0},space=new Set(['Space']),released=new Set();
  for(const id of ['roadster','mazda-miata-mx-5','tesla-cybertruck']){
    const race=start();
    const sim=new PhysicsSim({...vehiclePhysics(vehicleProfile(id),{},DEFAULTS),...CITY_DRIVE_PARAMS,roadRoughness:0});
    let previous=-6;
    for(let lap=0;lap<2;lap++){
      // Carry pressure, temperature and gas into the second pass. The control
      // fixture supplies a rolling ground entry on the actual back straight.
      const heavySecond=id==='tesla-cybertruck'&&lap===1;
      const pulse=heavySecond?.95:.60;
      const begin=first.distance+lap*course.length-approachSpeed*(heavySecond?1.03:.78);
      run(race,previous,begin,{height:.6,sim:null});
      const pose=sampleCourse(begin,0),driver=new DrivingController();
      sim.state.pos.set(pose.x,sim.restHeight,pose.z);
      sim.state.q.setFromAxisAngle(up,pose.heading);sim.state.omega.set(0,0,0);
      sim.state.vel.set(Math.cos(pose.heading)*approachSpeed,0,-Math.sin(pose.heading)*approachSpeed);
      for(const w of sim.wheels)w.omega=approachSpeed/w.radius;
      const gas=sim.state.gas;
      let passedBefore=race.airGatesThisLap;
      for(let tick=0;tick<1500;tick++){
        sim.step(dt,driver.update(tick*dt<pulse?space:released,sim,dt));
        const before=race.airGatesThisLap;
        assert.equal(race.update(dt,sim.state.pos,sim),null,id+' on lap '+(lap+1));
        if(race.airGatesThisLap>before){
          assert.equal(sim.contactCount,0);assert.ok(sim.state.pos.y>=AIR_APERTURE.minY&&sim.state.pos.y<=AIR_APERTURE.maxY);
          passedBefore++;
        }
        if(passedBefore===3&&sim.contactCount>0)break;
      }
      assert.equal(passedBefore,3,id+' passed every ring');
      assert.ok(gas-sim.state.gas>20&&gas-sim.state.gas<100,id+' realistic finite flight charge');
      previous=projectToCourse(sim.state.pos).distance+lap*course.length;
    }
    assert.ok(sim.state.gas>190);assert.equal(race.airGatesPassed,6);
    run(race,previous,2*course.length+2,{sim:null,height:.6});
    assert.equal(race.phase,'finished');
  }
});
