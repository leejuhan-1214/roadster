import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CockpitView,cockpitSeat,cockpitPose,COCKPIT_NEAR} from '../dist/js/cockpit-view.js';
import {FlightScene} from '../dist/js/scene.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';

const vehicle=(length=4.6,width=1.9,height=1.25)=>({root:new THREE.Group(),geometryParams:{wheelbase:length*.59,bodyLength:length,bodyWidth:width,bodyHeight:height,bodyCenterY:.2}});
const frame=(q=new THREE.Quaternion())=>({bodyPosition:new THREE.Vector3(120,1.1,-240),state:{pos:new THREE.Vector3(120,1.1,-240),q,vel:new THREE.Vector3(20,0,0)},wheels:[{steer:.2},{steer:.18}]});

test('each fleet body places the eye inside its cabin height and on the left driving side',()=>{
  for(const profile of VEHICLES){
    const car=vehicle(profile.length||4.6,profile.width||1.9,profile.height||1.25),seat=cockpitSeat(car),g=car.geometryParams;
    assert.ok(seat.eye.x>-.3&&seat.eye.x<g.wheelbase*.15,profile.id+' seat stays behind front axle');
    assert.ok(seat.eye.z<0&&seat.eye.z>-g.bodyWidth/2,profile.id+' left seat stays inside body');
    assert.ok(seat.eye.y<g.bodyCenterY+g.bodyHeight/2,profile.id+' head remains below roof');
    assert.ok(seat.eye.y>g.bodyCenterY-g.bodyHeight/2,profile.id+' head remains above floor');
  }
});

test('driver pose rotates with body pitch/roll/yaw and looking around never moves the eye outside',()=>{
  const seat=cockpitSeat(vehicle()),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,1.4,-.14)),p=new THREE.Vector3(-38,6,130);
  const front=cockpitPose(p,q,seat),side=cockpitPose(p,q,seat,1.2,-.25);
  assert.ok(front.eye.distanceTo(side.eye)<1e-12);
  assert.ok(front.eye.clone().sub(p).applyQuaternion(q.clone().invert()).distanceTo(seat.eye)<1e-12);
  assert.ok(front.direction.distanceTo(new THREE.Vector3(1,0,0).applyQuaternion(q))<1e-12);
  assert.ok(front.up.distanceTo(new THREE.Vector3(0,1,0).applyQuaternion(q))<1e-12);
  assert.ok(front.direction.angleTo(side.direction)>1);
});

test('cockpit has a clear windshield, actual steering response, bounded look and body-fixed interior',()=>{
  const car=vehicle(),cockpit=new CockpitView(),camera=new THREE.PerspectiveCamera(43,1,.25,3500),view=frame();
  cockpit.setVehicle(car);cockpit.root.visible=true;cockpit.update(camera,view,.016,{altitude:1.2});
  assert.equal(camera.near,COCKPIT_NEAR);assert.equal(camera.fov,65);
  assert.ok(Math.abs(cockpit.steering.rotation.x+.19*14)<1e-12);
  assert.ok(cockpit.root.position.distanceTo(view.bodyPosition)<1e-12);
  cockpit.root.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const direction=new THREE.Vector3();camera.getWorldDirection(direction);
  const ray=new THREE.Raycaster(camera.position,direction,.03,30);
  assert.equal(ray.intersectObject(cockpit.root,true).length,0,'dashboard and windshield trim do not block the central road view');
  cockpit.look(10000,10000);cockpit.zoom(10000);cockpit.update(camera,view,1);
  assert.equal(cockpit.yaw,-1.55);assert.equal(cockpit.pitch,-.62);assert.equal(camera.fov,80);
  cockpit.recenter();cockpit.update(camera,view,1);
  assert.equal(camera.fov,65);assert.equal(cockpit.lookYaw,0);assert.equal(cockpit.lookPitch,0);
  cockpit.dispose();assert.equal(cockpit.root.children.length,0);
});

test('switching from cockpit restores the exterior, camera up and city clipping plane',()=>{
  const car=vehicle(),cockpit=new CockpitView(),camera=new THREE.PerspectiveCamera(),controls={target:new THREE.Vector3()};
  cockpit.setVehicle(car);
  const scene=Object.assign(Object.create(FlightScene.prototype),{mode:'city',cameraName:'chase',vehicle:car,cockpit,camera,controls,cameraTarget:new THREE.Vector3(),telemetry:{}});
  scene.setCamera('hood');scene.updateCamera(frame(new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,0,.3))),.016);
  assert.equal(controls.enabled,false);assert.equal(cockpit.root.visible,true);assert.equal(camera.near,.03);
  car.root.visible=false;scene.setCamera('chase');
  assert.equal(cockpit.root.visible,false);assert.equal(car.root.visible,true);assert.equal(camera.near,.25);assert.deepEqual(camera.up.toArray(),[0,1,0]);
  cockpit.look(80,10);scene.setCamera('hood');assert.equal(cockpit.yaw,0);assert.equal(cockpit.pitch,0);
  cockpit.dispose();
});

test('changing car rebuilds only the reference interior and leaves artist geometry/materials intact',()=>{
  const a=vehicle(),b=vehicle(5.9,2.25,1.95),source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({opacity:.42,transparent:true}));a.root.add(source);
  const cockpit=new CockpitView();cockpit.setVehicle(a);let old;cockpit.root.traverse(o=>{if(!old&&o.geometry)old=o.geometry;});let disposed=0;old.addEventListener('dispose',()=>disposed++);
  cockpit.setVehicle(b);assert.equal(disposed,1);assert.equal(source.material.opacity,.42);assert.equal(source.visible,true);assert.equal(source.parent,a.root);
  assert.ok(cockpit.seat.eye.y>cockpitSeat(a).eye.y);assert.ok(cockpit.seat.width>cockpitSeat(a).width);
  cockpit.dispose();source.geometry.dispose();source.material.dispose();
});
