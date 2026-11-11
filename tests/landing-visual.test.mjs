import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun,landingRunInput,updateLandingRun,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {LandingVisual,landingForceScale,landingRulerWindow} from '../dist/js/landing-visual.js';
import {FlightScene} from '../dist/js/scene.js';

const camera=new THREE.PerspectiveCamera();camera.position.set(8,4,8);camera.lookAt(0,0,0);
const view=sim=>({state:sim.state,wheels:sim.wheels});
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);

test('landing force diagram uses one linear scale with bounded upward scale changes',()=>{
  assert.equal(landingForceScale(0),10000);assert.equal(landingForceScale(29000),10000);
  assert.equal(landingForceScale(31000),20000);assert.equal(landingForceScale(2000,20000),20000);
  for(const force of [1e3,1e5,1e7])assert.ok(force/landingForceScale(force)<=3);
  const sim=new PhysicsSim();createLandingRun(sim,{height:3});
  sim.groundForceN=10000;sim.groundCorrectionImpulseNs=40;
  const visual=new LandingVisual();visual.update(sim,view(sim),camera,'lab');
  near(visual.forceArrows.gravity.cone.position.y,sim.mass*sim.params.gravity/visual.scale);
  near(visual.forceArrows.ground.cone.position.y,10000/visual.scale);
  assert.equal(visual.metrics.groundN,10000,'continuous reaction does not invent an instantaneous numerical impact force');
  assert.equal(visual.forceArrows.thrust.visible,false);visual.dispose();
});

test('airborne thrust has actual resultant direction and zero ground vector/contact marks',()=>{
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,method:'gentle'}),visual=new LandingVisual();
  for(let i=0;i<300;i++){sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);}
  visual.setExperiment(run);visual.update(sim,view(sim),camera,'lab');
  const thrust=new THREE.Vector3();
  for(const nozzle of sim.thrusters)thrust.addScaledVector(nozzle.dir.clone().applyQuaternion(sim.state.q),nozzle.force);
  assert.ok(thrust.length()>100);near(visual.metrics.thrustN,thrust.length());near(visual.metrics.thrustVerticalN,thrust.y);
  const direction=new THREE.Vector3(0,1,0).applyQuaternion(visual.forceArrows.thrust.quaternion);
  assert.ok(direction.distanceTo(thrust.normalize())<1e-9);
  assert.equal(visual.forceArrows.ground.visible,false);assert.ok(visual.contactMarks.every(mark=>!mark.visible));
  visual.dispose();
});

test('resting load and spring shortening follow the physical wheel state',()=>{
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:0}),visual=new LandingVisual();
  for(let i=0;i<1000;i++)sim.step(LANDING_STEP,{stabilize:false,coastRegen:false});
  visual.update(sim,view(sim),camera,'lab');
  assert.ok(sim.contactCount===4&&sim.groundForceN>0);
  assert.ok(Math.abs(visual.metrics.groundVerticalN-sim.mass*sim.params.gravity)<100);
  sim.wheels.forEach((wheel,i)=>{
    assert.equal(visual.contactMarks[i].visible,wheel.grounded&&wheel.load>1);
    near(visual.springs[i].scale.y,.55-wheel.compression);
  });
  const rendered={state:sim.state,wheels:sim.wheels.map(w=>({...w,load:100000}))};
  for(const wheel of sim.wheels){wheel.grounded=false;wheel.load=0;}sim.groundForceN=0;
  visual.update(sim,rendered,camera,'lab');
  assert.ok(visual.contactMarks.every(mark=>!mark.visible),'interpolated old wheel load cannot persist after lift-off');
  visual.dispose();
});

test('unbounded release heights use true metre ruler windows with bounded geometry',()=>{
  assert.deepEqual(landingRulerWindow(3,2),{start:0,end:4,step:1});
  assert.deepEqual(landingRulerWindow(5000,4999),{start:4995,end:5007,step:1});
  const visual=new LandingVisual();visual.updateRuler(5000,4999,0,0);
  assert.equal(visual.tickLabels.length,13);assert.equal(visual.rulerLines.geometry.drawRange.count,28);
  const positions=visual.rulerLines.geometry.attributes.position;
  assert.equal(positions.getY(0),4995);assert.equal(positions.getY(1),5007);
  assert.ok([...positions.array].every(Number.isFinite));
  const geometry=visual.tickText.geometry,material=visual.tickText.material;
  visual.updateRuler(5000,4980,0,0);
  assert.equal(visual.tickText.geometry,geometry);assert.equal(visual.tickText.material,material,'moving ruler reuses one text atlas/material');
  assert.ok(geometry.drawRange.count<=13*24*6);
  visual.dispose();
});

test('release/braking markers represent tyre clearance and remain only in the lab',()=>{
  const visual=new LandingVisual(),sim=new PhysicsSim();createLandingRun(sim,{height:3});
  visual.setExperiment({height:3,brakeHeight:.75,method:'brake'});
  visual.update(sim,view(sim),camera,'lab');
  assert.equal(visual.root.visible,true);near(visual.metrics.clearance,3);
  near(visual.heightMarker.position.y,3);near(visual.brakeMarker.position.y,.75);
  assert.equal(visual.heightLabel.userData.text,'h₀ 3 m');assert.equal(visual.brakeLabel.userData.text,'hᵦ 0.75 m');
  assert.equal(visual.brakeMarker.visible,true);
  visual.update(sim,view(sim),camera,'city');assert.equal(visual.root.visible,false);
  visual.update(sim,view(sim),camera,'inspect');assert.equal(visual.root.visible,false);
  visual.setVisible(false);visual.update(sim,view(sim),camera,'lab');assert.equal(visual.root.visible,false);
  visual.setVisible(true);visual.setExperiment({height:3,method:'free'});visual.update(sim,view(sim),camera,'lab');assert.equal(visual.brakeMarker.visible,false);
  visual.dispose();
});

test('render trace is bounded, does not advance while paused, and resets on a new trial',()=>{
  const visual=new LandingVisual(),sim=new PhysicsSim();createLandingRun(sim,{height:3});visual.setExperiment({height:3});
  for(let i=0;i<900;i++){sim.state.time=i*.03;sim.state.pos.x=i*.01;visual.update(sim,view(sim),camera,'lab');}
  assert.equal(visual.traceCount,768);assert.equal(visual.traceGeometry.drawRange.count,768);
  const count=visual.traceCount,last=visual.lastTraceTime;visual.update(sim,view(sim),camera,'lab');
  assert.equal(visual.traceCount,count);assert.equal(visual.lastTraceTime,last);
  sim.state.time=0;visual.update(sim,view(sim),camera,'lab');assert.equal(visual.traceCount,1);
  visual.setExperiment(null);assert.equal(visual.traceCount,0);assert.equal(visual.heightMarker.visible,false);
  visual.dispose();
});

test('scene forwards learning state and disposes unique diagram resources once',()=>{
  const visual=new LandingVisual(),scene=new THREE.Scene();scene.add(visual.root);
  FlightScene.prototype.setLandingExperiment.call({landingVisual:visual},{height:7,method:'brake',brakeHeight:2});
  assert.equal(visual.config.height,7);FlightScene.prototype.setLandingLearningVisible.call({landingVisual:visual},false);assert.equal(visual.enabled,false);
  const resources=new Set();visual.root.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)resources.add(m);});
  const counts=new Map();for(const resource of resources){counts.set(resource,0);resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));}
  visual.dispose();assert.ok([...counts.values()].every(n=>n===1));assert.equal(scene.children.length,0);
});

test('lab shadow isolation preserves vehicle casters and restores the existing environment elsewhere',()=>{
  const environment=new THREE.Group(),building=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),vehicle=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  building.castShadow=vehicle.castShadow=true;environment.add(building);
  const context={mode:'lab',labEnvironment:[environment],sun:{shadow:{camera:new THREE.OrthographicCamera(-24,24,24,-24)}}};
  FlightScene.prototype.configureLandingShadows.call(context);
  assert.equal(building.castShadow,false);assert.equal(vehicle.castShadow,true);assert.equal(context.sun.shadow.camera.left,-10);
  context.mode='city';FlightScene.prototype.configureLandingShadows.call(context);
  assert.equal(building.castShadow,true);assert.equal(vehicle.castShadow,true);assert.equal(context.sun.shadow.camera.left,-24);
  for(const mesh of [building,vehicle]){mesh.geometry.dispose();mesh.material.dispose();}
});

test('landing framing fits car and metre ruler beside the telemetry panel and preserves orbit follow',()=>{
  const sim=new PhysicsSim();createLandingRun(sim,{height:3});
  const context={mode:'lab',cameraName:'orbit',canvas:{clientWidth:714,clientHeight:668},camera:new THREE.PerspectiveCamera(43,714/668,.08,1500),
    cameraTarget:new THREE.Vector3(),cameraPosition:new THREE.Vector3(),controls:{target:new THREE.Vector3(),update(){}},
    landingVisual:{config:{height:3}},inspectionViewport:FlightScene.prototype.inspectionViewport};
  FlightScene.prototype.frameLandingStart.call(context,sim);context.camera.updateMatrixWorld(true);
  for(const point of [new THREE.Vector3(-4.6,0,-2.1),new THREE.Vector3(-4.6,4,-2.1),new THREE.Vector3(2.5,4.5,1.2),new THREE.Vector3(-2.5,3.3,-1.2)]){
    const ndc=point.project(context.camera),x=(ndc.x+1)*714/2,y=(1-ndc.y)*668/2;
    assert.ok(x>0&&x<714-182,`physics annotation x ${x} must fit left of telemetry`);
    assert.ok(y>0&&y<668,`physics annotation y ${y} must fit the canvas`);
  }
  const offset=context.camera.position.clone().sub(context.controls.target),focus=context.landingFocusOffset.clone();
  sim.state.pos.y-=1;
  FlightScene.prototype.updateCamera.call(context,sim,1/60);
  assert.ok(context.camera.position.clone().sub(context.controls.target).distanceTo(offset)<1e-9);
  assert.ok(context.controls.target.clone().sub(sim.bodyPosition).distanceTo(focus)<1e-9);
  const normalDistance=offset.length();
  createLandingRun(sim,{height:5000});context.landingVisual.config.height=5000;
  FlightScene.prototype.frameLandingStart.call(context,sim);
  assert.ok(context.camera.position.distanceTo(context.controls.target)<normalDistance*3,'high drops fit a local ruler window, not a 5 km scene');
});
