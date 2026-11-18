import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial,Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {RACE_COURSE,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';
import {containsFootprint} from '../dist/js/city-footprint.js';

test('the visible circuit walls close on both sides and share the solver footprints',()=>{
  const world=createStationRaceWorld(),sim=new PhysicsSim();
  sim.setObstacles(world.obstacles);
  assert.equal(sim.obstacles.length,world.obstacles.length);
  const walls=world.root.children.filter(o=>o.name==='Circuit safety wall');
  assert.equal(walls.length,2);
  for(let side=0;side<2;side++){
    const pos=walls[side].geometry.getAttribute('position');
    const segments=(pos.count/4)-1;
    for(let i=0;i<segments;i++){
      const verts=[i*4,i*4+3,(i+1)*4+3,(i+1)*4];
      const obstacle=world.obstacles[side*segments+i];
      for(const [j,v] of verts.entries())
        assert.ok(Math.hypot(pos.getX(v)-obstacle.footprint[j][0],pos.getZ(v)-obstacle.footprint[j][1])<.00001);
      assert.equal(pos.getY(i*4+1).toFixed(2),obstacle.size[1].toFixed(2));
    }
  }
  for(let s=0;s<RACE_COURSE.length;s+=2){
    const p=sampleCourse(s);
    assert.ok(world.obstacles.filter(o=>o.footprint).every(o=>!containsFootprint(o.footprint,p.x,p.z)));
  }
  const header=world.obstacles.find(o=>o.id==='starting-gantry-header');
  assert.ok(header.center[1]-header.size[1]/2>5.5,'ground traffic passes below the sign');
  assert.equal(sim.surfaceHeightAt(0,0,1),0,'an overhead sign does not lift the road beneath a car');
  world.dispose();
});

test('rival bodywork and wheel motion follow the race while preserving the borrowed asphalt',()=>{
  const asphalt=new MeshStandardMaterial(),world=createStationRaceWorld(asphalt),race=new StationRace();
  let released=false;asphalt.addEventListener('dispose',()=>{released=true;});
  world.update(race);
  const gridPose=race.rivals.map(r=>({distance:r.distance,spin:world.root.getObjectByName(r.name).getObjectByName('Tyre').parent.rotation.z}));
  race.update(3,race.startPose);race.update(.5,race.startPose);world.update(race);
  for(const [i,r] of race.rivals.entries()){
    const car=world.root.getObjectByName(r.name);
    assert.equal(car.getObjectByName('GT bodywork').material.color.getHex(),r.color);
    assert.ok(car.position.distanceTo(new Vector3(r.x,0,r.z))<1e-7);
    assert.equal(car.rotation.y,r.heading);
    assert.ok(car.getObjectByName('Tyre').parent.rotation.z<gridPose[i].spin);
  }
  assert.equal(world.root.getObjectByName('Next checkpoint').visible,true);
  world.dispose();assert.equal(released,false);asphalt.dispose();
});
