import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {matchesSource} from '../dist/js/model-geometry.js';
import {tireAxle} from '../dist/js/wheel-alignment.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {configureVehicleFit,updateVehicleExplosion} from '../dist/js/vehicle-fit.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {RenderStateBuffer} from '../dist/js/render-state.js';
import {FlightScene} from '../dist/js/scene.js';

for(const profile of VEHICLES)test(profile.id+': real tire axes agree with rotating hubs',async()=>{
  const gltf=await loadModelGeometry(profile);
  const vehicle=profile.id==='roadster'?adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser):adaptRealVehicle(gltf.scene,profile);
  const axes=[];
  try{
  for(const wheel of vehicle.wheels){
    const tires=wheel.userData.spinGroup.children.filter(object=>profile.adapter?matchesSource(object,profile.adapter,'tire'):
      /tire|tyre|Thread|Sidewall/i.test((Array.isArray(object.material)?object.material:[object.material]).map(m=>m.name).join(' ')+object.name));
    assert.ok(tires.length>0,'the actual tire mesh must be identified, not rim geometry');
    const geometries=tires.map(o=>o.geometry),axis=tireAxle(geometries);
    axes.push(axis);
    assert.ok(axis,'a nondegenerate tire has a measurable axle');
    assert.ok(axis.angleTo(new THREE.Vector3(0,0,1))<.011,'parked steering or camber would cause wobble around the simulated Z axle');
    // Check the transformed axle through a complete rolling cycle. A skewed
    // source axle would sweep a cone instead of staying coaxial with the hub.
    for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const rotated=axis.clone().applyAxisAngle(new THREE.Vector3(0,0,1),angle);
      assert.ok(rotated.angleTo(new THREE.Vector3(0,0,1))<.011);
    }
  }
  // Exercise the real fitted meshes through the input, solver, interpolation,
  // renderer and inspector-return paths. A wheel group can rotate numerically
  // while its visible tire stays behind in the body assembly; the transformed
  // tire axle check catches that class of asset/parenting regression.
  prepareAssessmentVehicle(vehicle);configureVehicleFit(vehicle,profile);
  const sim=new PhysicsSim({...vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),...CITY_DRIVE_PARAMS,roadRoughness:0,aeroEnabled:false});
  const buffer=new RenderStateBuffer(sim),control=new DrivingController(),renderer={vehicle,mode:'city'};
  for(const [key,sign]of [['KeyA',1],['KeyD',-1]]){
    sim.reset('ground');control.reset();buffer.reset(sim);vehicle.root.quaternion.identity();
    for(let i=0;i<150;i++){buffer.beforeStep();sim.step(.002,control.update(new Set([key,'KeyB']),sim,.002));buffer.afterStep(sim);}
    const pose=buffer.sample(.5);
    FlightScene.prototype.updateWheels.call(renderer,pose.wheels,sim.cg);
    updateVehicleExplosion(vehicle,0,{inspect:false});vehicle.root.updateMatrixWorld(true);
    for(let i=0;i<4;i++){
      const wheel=vehicle.wheels[i],angle=pose.wheels[i].steer;
      if(i<2)assert.ok(angle*sign>.4,'A/D produces visible front steering even at rest');
      else assert.equal(angle,0,'rear wheels remain unsteered');
      assert.ok(Math.abs(wheel.rotation.y-angle)<1e-10,'rendered steering follows interpolated physics');
      const actual=axes[i].clone().applyQuaternion(wheel.userData.spinGroup.getWorldQuaternion(new THREE.Quaternion()));
      const expected=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle));
      assert.ok(actual.angleTo(expected)<.011,'visible tire follows the steering pivot without losing its spin axis');
    }
    updateVehicleExplosion(vehicle,1,{inspect:true});updateVehicleExplosion(vehicle,0,{inspect:true});
    FlightScene.prototype.updateWheels.call(renderer,pose.wheels,sim.cg);
    updateVehicleExplosion(vehicle,0,{inspect:false});
    assert.ok(vehicle.wheels[0].rotation.y*sign>.4,'returning from structure inspection restores live steering');

    // The city camera follows a yawed, rolling car. Check the actual tire axes
    // after spin, interpolated steering and body rotation together, rather than
    // inferring visible steering from a stopped wheel group's Euler angle.
    sim.reset('ground');control.reset();
    const heading=-1.22009,speed=70/3.6;
    sim.state.q.setFromAxisAngle(new THREE.Vector3(0,1,0),heading);
    sim.state.vel.set(Math.cos(heading)*speed,0,-Math.sin(heading)*speed);
    sim.wheels.forEach(w=>w.omega=speed/sim.params.wheelRadius);
    control.throttle=1;buffer.reset(sim);
    for(let i=0;i<600;i++){buffer.beforeStep();sim.step(.002,control.update(new Set([key,'KeyW']),sim,.002));buffer.afterStep(sim);}
    const moving=buffer.sample(.35);vehicle.root.quaternion.copy(moving.q);
    FlightScene.prototype.updateWheels.call(renderer,moving.wheels,sim.cg);
    updateVehicleExplosion(vehicle,0,{inspect:false});vehicle.root.updateMatrixWorld(true);
    for(let i=0;i<4;i++){
      const wheel=vehicle.wheels[i],angle=moving.wheels[i].steer;
      assert.ok(Math.abs(moving.wheels[i].spinAngle)>10,'the visual test must include a genuinely rolling wheel');
      if(i<2)assert.ok(angle*sign>.006,'front tires retain steering while the car moves');
      else assert.equal(angle,0,'moving rear wheels remain unsteered');
      assert.ok(Math.abs(wheel.rotation.y-angle)<1e-10,'moving wheel displays the physical angle without exaggeration');
      const actual=axes[i].clone().applyQuaternion(wheel.userData.spinGroup.getWorldQuaternion(new THREE.Quaternion()));
      const expected=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)).applyQuaternion(moving.q);
      assert.ok(actual.angleTo(expected)<.011,'steered rolling tire stays aligned with its chassis-relative axle');
    }
  }
  }finally{disposeVehicle(vehicle);}
});
