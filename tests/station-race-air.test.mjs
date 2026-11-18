import assert from 'node:assert/strict';
import test from 'node:test';
import {AIR_CEILING,AIR_APPROACH,RIVAL_COM_HEIGHT,AIR_RESTART_RUNUP,
  insideRaceEnvelope,rivalAirPath,throughAirGate} from '../dist/js/station-race-air.js';
import {RACE_COURSE as course,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {projectToCourse} from '../dist/js/station-race-course.js';


const gates=course.gates.filter(g=>g.air),first=gates[0],last=gates.at(-1);
const lift={mass:2200,verticalThrustN:26000,massFlowKgS:35,contactCount:0};
function start(){
  const race=new StationRace();
  race.rivals=[]; // Isolate timing from vehicle collisions.
  race.update(3,race.startPose);return race;
}
function run(race,from,to,{height,sim=lift,lateral,allowMiss=false}={}){
  const dir=Math.sign(to-from),step=dir*2;
  for(let d=from;dir*(to-d)>0;){
    const next=dir>0?Math.min(d+step,to):Math.max(d+step,to);
    const guide=rivalAirPath(next,course);
    const y=typeof height==='function'?height(next):height??guide.height+RIVAL_COM_HEIGHT;
    const side=typeof lateral==='function'?lateral(next):lateral??guide.lateral;
    const recovered=race.update(Math.abs(next-d)/40,{...sampleCourse(next,side),y},sim);
    if(recovered){
      assert.ok(allowMiss,'unexpected recovery at '+next);
      return recovered;
    }
    d=next;
  }
}

test('a grounded, unpowered, or sideways-misaligned crossing returns to the launch straight on each attempt',()=>{
  for(const settings of [{height:.6},{sim:null},{sim:{...lift,verticalThrustN:0}},{sim:{...lift,massFlowKgS:0}},
    {sim:{...lift,contactCount:1}},{lateral:7.3},{height:first.aperture.maxY+.01}]){
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
  assert.equal(race.airGatesThisLap,0);assert.equal(race.airGatesPassed,gates.length);assert.equal(race.lap,2);
  const second=run(race,course.length+3,course.length+first.distance+2,{height:.6,allowMiss:true});
  assert.equal(second.distance,course.length+first.distance-AIR_RESTART_RUNUP);
  assert.equal(race.airGatesPassed,gates.length);
  run(race,second.distance,course.length*2+1);
  assert.equal(race.phase,'finished');assert.equal(race.airGatesPassed,2*gates.length);assert.equal(race.bestAirLap,gates.length);
});

test('a ballistic coast through correctly ordered rings qualifies after genuine thrust in the approach',()=>{
  const race=start(),entry=first.distance-12;
  run(race,-6,entry,{height:.8});
  run(race,entry,first.distance+2,{height:4,sim:{...lift,verticalThrustN:0,massFlowKgS:0}});
  assert.equal(race.airGatesPassed,1);
  run(race,first.distance+2,last.distance+2);
  assert.equal(race.airGatesPassed,gates.length);
  assert.equal(race.airSectionStatus,'clear');
  assert.equal(race.nextGate,last.index+1);
  run(race,last.distance+2,first.distance-3);
  assert.equal(race.airGatesPassed,gates.length);
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

test('slalom gates require changes in both height and side at nonuniform stations',()=>{
  assert.equal(gates.length,5);
  assert.ok(new Set(gates.slice(1).map((g,i)=>g.distance-gates[i].distance)).size>1);
  assert.ok(Math.max(...gates.map(g=>g.aperture.lateral-g.aperture.halfWidth))>
    Math.min(...gates.map(g=>g.aperture.lateral+g.aperture.halfWidth)));
  assert.ok(Math.max(...gates.map(g=>g.aperture.minY))>Math.min(...gates.map(g=>g.aperture.maxY)));
  for(const g of gates){
    for(const lap of [0,1]){
      const p=rivalAirPath(lap*course.length+g.distance,course);
      assert.ok(throughAirGate(g,p.lateral-2.07,p.height+RIVAL_COM_HEIGHT));
      assert.ok(throughAirGate(g,p.lateral+2.07,p.height+RIVAL_COM_HEIGHT));
      assert.ok(Math.abs(p.slope)<1e-10);
    }
    assert.equal(throughAirGate(g,0,.6),false);
    const a=g.aperture;
    assert.equal(throughAirGate(g,a.lateral+a.halfWidth+.01,(a.minY+a.maxY)/2),false);
    assert.equal(throughAirGate(g,a.lateral+a.halfWidth*.95,a.maxY-.01),false);
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

test('air-gate meshes agree with all five mandatory timing apertures',async()=>{
  const {createStationRaceWorld}=await import('../dist/js/station-race-world.js');
  const world=createStationRaceWorld();
  for(const timing of gates){
    const gate=world.root.getObjectByName('Air gate '+timing.index);
    const a=timing.aperture,p=sampleCourse(timing.distance,a.lateral);
    assert.equal(gate.position.x,p.x);assert.equal(gate.position.z,p.z);
    assert.equal(gate.position.y,(a.minY+a.maxY)/2);
    assert.equal(gate.rotation.y,p.heading);
    const geo=gate.getObjectByName('Air timing aperture').geometry;geo.computeBoundingBox();
    const b=geo.boundingBox;
    assert.ok(gate.position.y+b.min.y<a.minY&&gate.position.y+b.max.y>a.maxY);
    assert.ok(b.min.z< -a.halfWidth&&b.max.z>a.halfWidth);
    const halfY=(a.maxY-a.minY)/2,vertices=geo.getAttribute('position');
    let innerVertices=0;
    for(let i=0;i<vertices.count;i++){
      const radius=Math.hypot(vertices.getY(i)/halfY,vertices.getZ(i)/a.halfWidth);
      assert.ok(radius>=1-1e-6,'the ring mesh must leave its accepted ellipse open');
      if(Math.abs(radius-1)<1e-6)innerVertices++;
    }
    assert.ok(innerVertices>=32,'visible inside edge follows the timing ellipse');
  }
  world.dispose();
});

test('three vehicle masses can navigate every slalom ring with ordinary flight controls on the race supply',()=>{
  const dt=.002,speed=30,up={x:0,y:1,z:0};
  for(const id of ['roadster','mazda-miata-mx-5','tesla-cybertruck']){
    const race=start();
    const sim=new PhysicsSim({...vehiclePhysics(vehicleProfile(id),{},DEFAULTS),...CITY_DRIVE_PARAMS,roadRoughness:0,unlimitedRaceGas:true});
    let previous=-6;
    const gas=sim.state.gas;
    for(let lap=0;lap<course.laps;lap++){
      const begin=first.distance+lap*course.length-90;
      run(race,previous,begin,{height:.6,sim:null});
      const pose=sampleCourse(begin),driver=new DrivingController(),keys=new Set();
      sim.state.pos.set(pose.x,sim.restHeight,pose.z);
      sim.state.q.setFromAxisAngle(up,pose.heading);sim.state.omega.set(0,0,0);
      sim.state.vel.set(Math.cos(pose.heading)*speed,0,-Math.sin(pose.heading)*speed);
      for(const w of sim.wheels)w.omega=speed/w.radius;
      for(let tick=0;tick<10000;tick++){
        const {distance,lateral}=projectToCourse(sim.state.pos);
        const forward=sim.state.vel.x*Math.cos(pose.heading)-sim.state.vel.z*Math.sin(pose.heading);
        const right=sim.state.vel.x*Math.sin(pose.heading)+sim.state.vel.z*Math.cos(pose.heading);
        const aim=rivalAirPath(distance+forward*.28,course);
        driver.setAltitudeTarget(Math.max(0,aim.height+RIVAL_COM_HEIGHT-sim.restHeight));
        const sideControl=2*(aim.lateral-lateral)+1.4*(aim.lateralSlope*forward-right);
        keys.clear();
        if(sideControl>.12)keys.add('KeyD');
        if(sideControl<-.12)keys.add('KeyA');
        sim.step(dt,driver.update(keys,sim,dt));
        const before=race.airGatesThisLap;
        assert.equal(race.update(dt,sim.state.pos,sim),null,id+' at station '+distance.toFixed(2)+', y '+sim.state.pos.y.toFixed(2)+', lateral '+lateral.toFixed(2));
        if(race.airGatesThisLap>before)assert.equal(sim.contactCount,0);
        if(race.airGatesThisLap===gates.length)break;
      }
      assert.equal(race.airGatesThisLap,gates.length,id+' passes every ring');
      assert.equal(sim.state.gas,gas);
      previous=projectToCourse(sim.state.pos).distance+lap*course.length;
    }
    assert.equal(race.airGatesPassed,course.laps*gates.length);
    run(race,previous,2*course.length+2,{sim:null,height:.6});
    assert.equal(race.phase,'finished');
  }
});
