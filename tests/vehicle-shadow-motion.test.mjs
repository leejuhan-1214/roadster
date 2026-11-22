import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FlightScene} from '../dist/js/scene.js';
import {createTireContactShadows,updateTireContactShadows} from '../dist/js/tire-contact-shadows.js';
import {createStationRaceWorld} from '../dist/js/station-race-world.js';
import {StationRace} from '../dist/js/station-race.js';

test('a moving car or nearby competitor updates the directional shadow on the same rendered frame',()=>{
  const map={enabled:true,needsUpdate:true},rivals=[{x:12,z:2,heading:.2}];
  const view={mode:'city',renderer:{shadowMap:map},shadowElapsed:1,stationRace:{rivals}};
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),wheels=[{compression:.05,steer:0}];
  const update=()=>FlightScene.prototype.updateShadowMap.call(view,1/90,p,q,wheels,0);
  update();map.needsUpdate=false;update();assert.equal(map.needsUpdate,false);
  rivals[0].x+=.42;update();assert.equal(map.needsUpdate,true);
  map.needsUpdate=false;rivals[0].heave=-.06;update();assert.equal(map.needsUpdate,true);
  map.needsUpdate=false;p.z+=.8;update();assert.equal(map.needsUpdate,true);
  assert.ok(view.shadowPose.position.equals(p));
});

test('ambient contact sits at each actual rotated hub, follows uneven supports and vanishes on lift-off',()=>{
  const mesh=createTireContactShadows(),radius=.35;
  const wheels=Array.from({length:4},(_,i)=>({pos:new THREE.Vector3(i<2?1.4:-1.4,-.30,i%2?.9:-.9),
    compression:i===0?.08:.02,surfaceY:i===0?.06:0,load:4200,radius,steer:0,normalX:0,normalY:1,normalZ:0}));
  const p=new THREE.Vector3(8,.63,1),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
  const draw=()=>updateTireContactShadows(mesh,p,q,wheels,wheels,'city');
  draw();assert.ok(mesh.visible);
  const vertices=mesh.geometry.attributes.position,colors=mesh.geometry.attributes.color;
  updateTireContactShadows(mesh,p,q,wheels,wheels,'circuit');
  assert.ok(Math.abs(vertices.getY(0)-.064)<1e-6);
  assert.ok(Math.abs(vertices.getY(4)-.004)<1e-6);
  for(const [i,w] of wheels.entries()){
    const hub=w.pos.clone().applyQuaternion(q).add(p);
    assert.ok(Math.abs((vertices.getX(i*4)+vertices.getX(i*4+2))/2-hub.x)<1e-6);
    assert.ok(Math.abs((vertices.getZ(i*4)+vertices.getZ(i*4+2))/2-hub.z)<1e-6);
    assert.ok(Math.abs(vertices.getY(i*4)-w.surfaceY-.004)<1e-6);assert.ok(colors.getW(i*4)>.9);
  }
  wheels[0].normalX=.06;wheels[0].normalZ=-.12;draw();
  const hub=wheels[0].pos.clone().applyQuaternion(q).add(p);
  for(let i=0;i<4;i++){
    const dx=vertices.getX(i)-hub.x,dz=vertices.getZ(i)-hub.z;
    const support=wheels[0].surfaceY-wheels[0].normalX*dx-wheels[0].normalZ*dz;
    assert.ok(Math.abs(vertices.getY(i)-Math.max(0,support)-.004)<1e-6,'shadow stays on the tilted support');
  }
  wheels[1].surfaceY=-.003;draw();
  assert.ok(Math.abs(vertices.getY(4)-.004)<1e-6,'roughness beneath the flat mesh does not hide its contact shadow');
  wheels[1].surfaceY=0;wheels[0].load=0;draw();assert.equal(colors.getW(0),0);assert.ok(colors.getW(4)>.9);
  p.y+=1;draw();assert.equal(mesh.visible,false);
  mesh.material.map.dispose();mesh.material.dispose();mesh.geometry.dispose();
});

test('sunlight remains fixed in world space and reaches the ground from a high free flight',()=>{
  const sun=new THREE.DirectionalLight(),dir=new THREE.Vector3(.42,.854,.309).normalize();
  const view={sun,sunDirection:dir,mode:'lab'},wheels=[{surfaceY:0}];
  const p=new THREE.Vector3(20,600,-80);
  FlightScene.prototype.positionSun.call(view,p,wheels);
  assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(dir)<1e-11);
  assert.ok(sun.shadow.camera.far>50+p.y/dir.y);
  p.x+=100;p.z-=21;
  FlightScene.prototype.positionSun.call(view,p,wheels);
  assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(dir)<1e-11);
  sun.dispose();
});

test('race cars cast tyre and cabin silhouettes as well as bodywork',()=>{
  const circuit=createStationRaceWorld(),race=new StationRace();circuit.update(race);
  for(const rival of race.rivals){
    const car=circuit.root.getObjectByName(rival.name),tires=[];
    car.traverse(object=>{if(object.name==='Tyre')tires.push(object);});
    assert.equal(tires.length,4);assert.ok(tires.every(w=>w.castShadow));
    assert.ok(car.getObjectByName('Windshield and side glass').castShadow);
  }
  circuit.dispose();
});
