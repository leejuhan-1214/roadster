import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,MeshStandardMaterial,Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {RACE_COURSE,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';
import {containsFootprint} from '../dist/js/city-footprint.js';
import {rivalExteriorTemplate} from '../dist/js/rival-exterior.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {RIVAL_LENGTH,RIVAL_ROOF_HEIGHT} from '../dist/js/race-contact.js';

test('the visible circuit walls close on both sides and share the solver footprints',()=>{
  const world=createStationRaceWorld(),sim=new PhysicsSim();
  sim.setObstacles(world.obstacles);
  assert.equal(sim.obstacles.length,world.obstacles.length);
  const walls=world.root.children.filter(o=>o.name==='Circuit safety wall');
  assert.equal(walls.length,2);
  assert.equal(walls[0].material,walls[1].material,'both sides share the same precast finish');
  assert.ok(walls[0].material.map.isDataTexture);
  for(let side=0;side<2;side++){
    const pos=walls[side].geometry.getAttribute('position');
    const uv=walls[side].geometry.getAttribute('uv');
    assert.equal(uv.count,pos.count);assert.equal(uv.getX(4)-uv.getX(0),1);
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
    assert.ok(world.obstacles.filter(o=>o.footprint&&o.center[1]-o.size[1]/2<24).every(o=>!containsFootprint(o.footprint,p.x,p.z)));
  }
  const header=world.obstacles.find(o=>o.id==='starting-gantry-header');
  assert.ok(header.center[1]-header.size[1]/2>5.5,'ground traffic passes below the sign');
  assert.equal(sim.surfaceHeightAt(0,0,1),0,'an overhead sign does not lift the road beneath a car');
  assert.ok(world.root.getObjectByName('Continuous amber and cyan wall guides'));
  assert.equal(world.root.getObjectByName('Track edge light spill').material.depthWrite,false);
  assert.ok(world.root.getObjectByName('Circuit vaulted steel ribs'));
  assert.ok(world.obstacles.some(o=>o.id.startsWith('circuit-vault-')));
  assert.equal(sim.surfaceHeightAt(41,0,1),0,'vault ribs clear ground traffic');
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

test('opponents share the licensed Z Proto mesh with independent paint, grounded tyre pivots and source roof height',async()=>{
  const profile=vehicleProfile('nissan-proto'),race=new StationRace();
  const world=createStationRaceWorld(null,null,{loadExterior:async()=>{
    const source=await loadModelGeometry(profile);
    return rivalExteriorTemplate(adaptRealVehicle(source.scene,profile));
  }});
  world.update(race);
  assert.equal(await world.rivalModelsReady,true);
  const paints=[],geometries=[];
  for(const rival of race.rivals){
    const car=world.root.getObjectByName(rival.name),model=car.getObjectByName('Nissan Z Proto · Lexyc16');
    const box=new Box3().setFromObject(model,true),size=box.getSize(new Vector3());
    assert.equal(model.userData.source,profile.source);
    assert.ok(Math.abs(size.x-RIVAL_LENGTH)<.001&&Math.abs(size.y-RIVAL_ROOF_HEIGHT)<.001);
    assert.ok(Math.abs(box.min.y)<.001,'tyres touch the track datum');
    let painted;model.traverse(o=>{if(o.material?.userData.vehiclePaint)painted=o;});
    assert.equal(painted.material.color.getHex(),rival.color);paints.push(painted.material);geometries.push(painted.geometry);
    const fl=model.getObjectByName('wheel-fl'),initial=fl.position.y;
    rival.heave=-.05;rival.wheelDistance=2;rival.steerAngle=.18;
    world.update(race);
    assert.ok(Math.abs(fl.rotation.y-.18)<1e-6&&fl.position.y>initial);
    assert.ok(fl.children[0].rotation.z<-4,'the visible artist rim and tyre spin around their measured centre');
    rival.heave=0;
  }
  assert.equal(new Set(paints).size,3);assert.equal(new Set(geometries).size,1);
  let disposed=0;geometries[0].addEventListener('dispose',()=>disposed++);
  world.dispose();world.dispose();assert.equal(disposed,1);
});

test('an exterior that arrives after the race world closes is disposed without replacing the fallback',async()=>{
  let resolve,disposed=0;
  const pending=new Promise(r=>{resolve=r;});
  const world=createStationRaceWorld(null,null,{loadExterior:()=>pending});
  world.update(new StationRace());world.dispose();
  resolve({dispose(){disposed++;},create(){throw Error('closed world');}});
  assert.equal(await world.rivalModelsReady,false);assert.equal(disposed,1);
});
