import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Group,MeshStandardMaterial,Scene,Vector3} from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {RACE_COURSE,StationRace,sampleCourse} from '../dist/js/station-race.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';
import {circuitStations,projectToCourse,runoffWidth} from '../dist/js/station-race-course.js';
import {containsFootprint} from '../dist/js/city-footprint.js';
import {rivalExteriorTemplate} from '../dist/js/rival-exterior.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {adaptRealVehicle} from '../dist/js/real-vehicle-model.js';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {RIVAL_LENGTH,RIVAL_ROOF_HEIGHT} from '../dist/js/race-contact.js';
import {FlightScene} from '../dist/js/scene.js';

test('early and repeat entries reuse the partially built hidden circuit and its original opponents',async()=>{
  const idle=[],oldWindow=globalThis.window;
  globalThis.window={requestIdleCallback:callback=>idle.push(callback)};
  const view=Object.assign(Object.create(FlightScene.prototype),{scene:new Scene(),city:{root:new Group()},
    mode:'city',marks:{},renderer:{shadowMap:{}},syncCircuitLighting(){},resetPhysicalEffects(){},tireEffects:{reset(){}}});
  try{
    view.warmStationRace(view.city);view.warmStationRace(view.city);
    assert.equal(idle.length,1);
    idle.shift()();
    assert.ok(view.raceBuild);assert.ok(!view.raceWorld);
    const race=new StationRace();
    view.setStationRace(race);
    const world=view.raceWorld,opponent=world.root.getObjectByName(race.rivals[0].name);
    assert.ok(opponent);assert.equal(world.root.visible,true);
    idle.shift()();
    view.setStationRace(null);assert.equal(world.root.visible,false);
    view.setStationRace(new StationRace());
    assert.equal(view.raceWorld,world);
    assert.equal(world.root.getObjectByName(race.rivals[0].name),opponent);
    assert.equal(view.scene.children.filter(o=>o===world.root).length,1);
    assert.equal(view.raceBuild,null);
    await world.rivalModelsReady;
  }finally{
    view.raceWorld?.dispose();
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});

test('idle preparation leaves the running city visible and uploads each shared grid texture once',async()=>{
  const idle=[],uploads=[],oldWindow=globalThis.window;
  globalThis.window={requestIdleCallback:callback=>idle.push(callback)};
  const city={root:new Group()};let compiles=0;
  const view=Object.assign(Object.create(FlightScene.prototype),{city,scene:new Scene(),mode:'city',
    renderer:{compile(){compiles++;},initTexture(texture){uploads.push(texture);}}});
  try{
    view.warmStationRace(city);
    while(idle.length)idle.shift()();
    const world=view.raceWorld;
    assert.ok(world);assert.equal(world.root.visible,false);assert.equal(city.root.visible,true);
    await world.rivalModelsReady;
    while(idle.length){
      const count=uploads.length;
      idle.shift()();
      assert.ok(uploads.length-count<=1);
    }
    assert.equal(compiles,1);assert.ok(uploads.length>=2);
    assert.equal(new Set(uploads).size,uploads.length);
    view.warmStationRace(city);assert.equal(idle.length,0);
  }finally{
    view.raceWorld?.dispose();
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});

test('the visible circuit walls close on both sides and share the solver footprints',()=>{
  const world=createStationRaceWorld(),sim=new PhysicsSim();
  const turf=world.root.getObjectByName('Circuit grass'),asphalt=world.root.getObjectByName('Track asphalt');
  assert.ok(turf.renderOrder<asphalt.renderOrder);
  assert.equal(turf.material.depthWrite,false,'turf cannot mask the asphalt at a grazing view angle');
  sim.setObstacles(world.obstacles);
  assert.equal(sim.obstacles.length,world.obstacles.length);
  const walls=world.root.children.filter(o=>o.name==='Circuit safety wall');
  assert.equal(walls.length,2);
  assert.equal(walls[0].material,walls[1].material,'both sides share the same precast finish');
  assert.ok(walls[0].material.map.isDataTexture);
  for(let side=0;side<2;side++){
    const pos=walls[side].geometry.getAttribute('position');
    const uv=walls[side].geometry.getAttribute('uv');
    assert.equal(uv.count,pos.count);assert.ok(Math.abs(uv.getX(4)-circuitStations[1]/5)<1e-5);
    const segments=(pos.count/4)-1;
    assert.ok(segments<450);
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
    assert.ok(sim._obstaclesNear(p.x,p.z,1).filter(o=>o.footprint&&o.min.y<24).every(o=>!containsFootprint(o.footprint,p.x,p.z)));
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

test('every corner has an outside escape area and offset lines project onto the same arc length',()=>{
  for(const bend of RACE_COURSE.bends){
    const s=bend.start+bend.length/2,outside=Math.sign(bend.curvature);
    assert.ok(runoffWidth(s,outside)>12);
    for(const offset of [-7,7]){
      const p=projectToCourse(sampleCourse(s,offset));
      assert.ok(Math.abs(p.distance-s)<1e-7);
      assert.ok(Math.abs(p.lateral-offset)<1e-7);
    }
  }
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
    const vehicle=adaptRealVehicle(source.scene,profile,{exteriorOnly:true});
    assert.ok(!vehicle.parts.has('suspension'));
    return rivalExteriorTemplate(vehicle);
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
  const first=world.root.getObjectByName(race.rivals[0].name);
  const rider=race.rivals[0];
  rider.liftAcceleration=11;rider.heave=3;
  world.update(race,{x:rider.x,z:rider.z});
  assert.equal(first.getObjectByName('Rival lift exhaust').visible,true);
  world.update(race,{x:rider.x+200,z:rider.z});
  assert.equal(first.getObjectByName('Nissan Z Proto · Lexyc16').visible,false);
  assert.equal(first.getObjectByName('GT bodywork').parent.visible,true);
  world.update(race,{x:rider.x+1000,z:rider.z});assert.equal(first.visible,false);
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
