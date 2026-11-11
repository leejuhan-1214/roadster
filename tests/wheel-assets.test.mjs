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
  // These source assets contain separate visible tire/rim/brake meshes. If one
  // remains in the chassis it can look stationary, or even become a false floor
  // that holds the real road wheels above the ground (DB11 outer tires).
  const wheelParts={
    'aston-martin-db11':[
      {name:'outer tires',pattern:/Object_400[1-4]_Scene_-_Root_0/i,spin:true},
      {name:'brake discs',pattern:/amdb11_brakedisc_/i,spin:true},
      {name:'brake calipers',pattern:/amdb11_caliper_/i,spin:false},
      {name:'wheel hubs',pattern:/amdb11_hub_[fr]/i,spin:false}
    ],
    'ford-focus':[
      {name:'inner rims and wheel lugs',pattern:/INNERW|IN_WH|LUGS/i,spin:true}
    ],
    'hyundai-i30':[{name:'wheel faces, brake discs and center hardware',pattern:/Material3_4[78]|Material2_17/i,spin:true}]
  }[profile.id]||[];
  const descendsFrom=(object,ancestor)=>{for(let node=object;node;node=node.parent)if(node===ancestor)return true;return false;};
  for(const part of wheelParts){
    const meshes=[];vehicle.root.traverse(object=>{if(object.isMesh&&part.pattern.test(object.name))meshes.push(object);});
    assert.ok(meshes.length>=4,part.name+' must exist on all four source wheels');
    for(const wheel of vehicle.wheels){
      const attached=meshes.filter(mesh=>descendsFrom(mesh,wheel));
      assert.ok(attached.length>0,part.name+' must be attached to every wheel carrier');
      for(const mesh of attached)assert.equal(descendsFrom(mesh,wheel.userData.spinGroup),part.spin,part.name+' must follow the correct rolling or stationary brake part');
    }
    assert.ok(meshes.every(mesh=>vehicle.wheels.some(wheel=>descendsFrom(mesh,wheel))),part.name+' must not remain in the fixed chassis');
  }
  const mixedWheelAsset={
    'chevrolet-camaro':{pattern:/^Object_16(?:_|$)/,minY:-.45},
    'subaru-forester':{pattern:/^Object_51(?:_|$)/,minY:-.35}
  }[profile.id];
  if(mixedWheelAsset){
    // These meshes mix chassis details with complete wheel shells/rims. Their
    // measured non-wheel remainders end above the low wheel geometry.
    const mixed=[];vehicle.root.updateMatrixWorld(true);
    vehicle.root.traverse(object=>{if(object.isMesh&&mixedWheelAsset.pattern.test(object.name))mixed.push(object);});
    for(const wheel of vehicle.wheels)assert.ok(mixed.some(mesh=>descendsFrom(mesh,wheel.userData.spinGroup)),'each wheel must carry its visible source shell or rim');
    for(const mesh of mixed.filter(mesh=>!vehicle.wheels.some(wheel=>descendsFrom(mesh,wheel)))){
      assert.ok(new THREE.Box3().setFromObject(mesh).min.y>mixedWheelAsset.minY,'wheel shells/rims must not remain as a false chassis floor');
    }
  }
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
  // Starting from the actual parked pose must use the tires, not silently switch
  // to gas-powered flight because a bad body envelope lifts all four wheels.
  // Do not seed velocity or wheel omega here: that hid the DB11 start-up defect.
  sim.reset('ground');control.reset();buffer.reset(sim);
  for(let i=0;i<2500;i++)sim.step(.002,control.update(new Set(),sim,.002));
  assert.equal(sim.state.gasUsed,0,'an untouched parked car must not consume cold gas');
  assert.ok(sim.contactCount>0,'a parked car must be supported by its tires');
  assert.equal(control.airborne,false,'parked support must not select flight controls');
  const startX=sim.state.pos.x;
  for(let i=0;i<1000;i++){
    buffer.beforeStep();sim.step(.002,control.update(new Set(['KeyW']),sim,.002));buffer.afterStep(sim);
  }
  assert.equal(sim.state.gasUsed,0,'ordinary W driving must not spend gas on automatic flight');
  assert.ok(sim.state.pos.x>startX+1&&sim.state.vel.x>2,'W must drive forward from rest');
  const rollingPose=buffer.sample(1);
  FlightScene.prototype.updateWheels.call(renderer,rollingPose.wheels,sim.cg);
  updateVehicleExplosion(vehicle,0,{inspect:false});vehicle.root.updateMatrixWorld(true);
  const rollingPoints=vehicle.wheels.map((wheel,index)=>{
    assert.ok(Math.abs(rollingPose.wheels[index].spinAngle)>1,'each road wheel must start rolling without injected omega');
    const meshes=wheel.userData.spinGroup.children.filter(o=>o.isMesh&&o.geometry.attributes.position);
    const candidates=meshes.map(mesh=>{
      const attribute=mesh.geometry.attributes.position,point=new THREE.Vector3();let radius2=-1;
      for(let i=0;i<attribute.count;i++){
        const candidate=new THREE.Vector3().fromBufferAttribute(attribute,i),r2=candidate.x*candidate.x+candidate.y*candidate.y;
        if(r2>radius2){radius2=r2;point.copy(candidate);}
      }
      const rim=/rim|jante|rin1|wheel.*metal/i.test(mesh.name+' '+(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.name).join(' '));
      return {mesh,point,radius2,rim};
    }).filter(candidate=>candidate.radius2>.001);
    // Small hub badges are legitimately almost on-axis. Track an off-axis rim
    // or tire point instead of assuming the first source mesh is the wheel face.
    candidates.sort((a,b)=>Number(b.rim)-Number(a.rim)||b.radius2-a.radius2);
    assert.ok(candidates.length,'a rolling wheel must contain visible off-axis source geometry');
    const {mesh,point,radius2}=candidates[0];
    assert.ok(radius2>.001,'track a visible point away from the rotation axis');
    return {mesh,point,before:wheel.worldToLocal(mesh.localToWorld(point.clone())),angle:rollingPose.wheels[index].spinAngle};
  });
  for(let i=0;i<20;i++){
    buffer.beforeStep();sim.step(.002,control.update(new Set(['KeyW']),sim,.002));buffer.afterStep(sim);
  }
  const afterRolling=buffer.sample(1);
  FlightScene.prototype.updateWheels.call(renderer,afterRolling.wheels,sim.cg);
  updateVehicleExplosion(vehicle,0,{inspect:false});vehicle.root.updateMatrixWorld(true);
  for(let i=0;i<4;i++){
    const tracked=rollingPoints[i],wheel=vehicle.wheels[i],after=wheel.worldToLocal(tracked.mesh.localToWorld(tracked.point.clone()));
    const delta=afterRolling.wheels[i].spinAngle-tracked.angle;
    assert.ok(Math.abs(delta)>.01&&after.distanceTo(tracked.before)>.001,'visible wheel geometry must move while driving');
    const expected=tracked.before.clone().applyAxisAngle(new THREE.Vector3(0,0,1),-delta);
    assert.ok(after.distanceTo(expected)<1e-6,'visible source point follows physical rolling, independent of body movement');
  }
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
