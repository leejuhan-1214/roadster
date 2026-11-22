import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CockpitView,cockpitSeat,cockpitPose,COCKPIT_NEAR} from '../dist/js/cockpit-view.js';
import {FlightScene} from '../dist/js/scene.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {isOpenGrandPrix} from '../dist/js/grand-prix-cockpit.js';

const vehicle=(length=4.6,width=1.9,height=1.25)=>({root:new THREE.Group(),geometryParams:{wheelbase:length*.59,bodyLength:length,bodyWidth:width,bodyHeight:height,bodyCenterY:.2}});
const frame=(q=new THREE.Quaternion())=>({bodyPosition:new THREE.Vector3(120,1.1,-240),state:{pos:new THREE.Vector3(120,1.1,-240),q,vel:new THREE.Vector3(20,0,0)},wheels:[{steer:.2},{steer:.18}]});

test('each fleet body uses the correct enclosed or open driving position',()=>{
  for(const profile of VEHICLES){
    const car=Object.assign(vehicle(profile.length||4.6,profile.width||1.9,profile.height||1.25),
      {profileId:profile.id,cockpitStyle:profile.cockpitStyle,cockpitEye:profile.cockpitEye});
    const seat=cockpitSeat(car),g=car.geometryParams;
    if(isOpenGrandPrix(car)){
      assert.deepEqual(seat.eye.toArray(),profile.cockpitEye);
      assert.ok(Math.abs(seat.eye.z)<g.bodyWidth/2,profile.id+' uses its measured single-seat lateral position');
      continue;
    }
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
  cockpit.setVehicle(car);cockpit.root.visible=true;cockpit.update(camera,view,.016,{altitude:9.2,heightAboveSurface:1.2});
  assert.equal(cockpit.interior.root.userData.telemetry.height,1.2);
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

test('cornering glance follows forward ground turns and yields to manual look',()=>{
  const cockpit=new CockpitView(),camera=new THREE.PerspectiveCamera(),view=frame();
  cockpit.setVehicle(vehicle());
  const grounded={contactCount:4};
  const pose=cockpit.update(camera,view,1,grounded);
  assert.ok(cockpit.turnLook>0&&cockpit.turnLook<=.085);
  assert.ok(pose.direction.z<0);
  assert.ok(pose.eye.distanceTo(cockpit.seat.eye.clone().add(view.bodyPosition))<1e-12);
  cockpit.look(180,0);
  cockpit.update(camera,view,1,grounded);
  assert.ok(cockpit.turnLook<.001);
  cockpit.recenter();
  view.state.vel.x=-20;
  cockpit.update(camera,view,1,grounded);
  assert.equal(cockpit.turnLook,0);
  view.state.vel.x=20;
  cockpit.update(camera,view,1,{contactCount:0});
  assert.equal(cockpit.turnLook,0);
  cockpit.dispose();
});

test('resizing the cockpit reframes the road and preserves zoom',()=>{
  const cockpit=new CockpitView(),camera=new THREE.PerspectiveCamera(43,16/9),view=frame();
  cockpit.setVehicle(vehicle());
  cockpit.update(camera,view,.016);
  const wide=camera.fov;
  camera.aspect=9/16;
  cockpit.update(camera,view,.016);
  const tall=camera.fov;
  assert.ok(wide>55&&wide<65);
  assert.ok(tall>65&&tall<80);
  cockpit.zoom(-150);
  cockpit.update(camera,view,.016);
  assert.ok(camera.fov<tall);
  cockpit.dispose();
});

test('Roadster driver can see the horizon and entire steering yoke in a normal landscape frame',async()=>{
  const model=await loadModelGeometry(VEHICLES.find(profile=>profile.id==='roadster'));
  const vehicle=adaptRoadsterScene(model.scene,createVehicle(),model.parser),cockpit=new CockpitView();
  cockpit.setVehicle(vehicle);
  const state={pos:new THREE.Vector3(),q:new THREE.Quaternion(),vel:new THREE.Vector3()};
  try{
    for(const aspect of [16/9,16/10]){
      const camera=new THREE.PerspectiveCamera(43,aspect,.25,3500);
      cockpit.update(camera,{state,wheels:[]},.016);
      camera.updateMatrixWorld();cockpit.root.updateWorldMatrix(true,true);
      const hub=cockpit.interior.wheelCenter.clone().project(camera);
      assert.ok(hub.y>-.60&&hub.y<-.42,'yoke hub sits between 71% and 80% of image height');
      const point=new THREE.Vector3();
      cockpit.steering.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,'actual yoke vertices remain within the image');
        }
      });
      const horizon=cockpit.seat.eye.clone().add(new THREE.Vector3(500,0,0)).project(camera);
      assert.ok(horizon.y>0&&horizon.y<.25,'level road remains close to the centre');
    }
    const glass=cockpit.mirrorSurface.userData.mirrorBasis,optics=cockpit.mirrorOptics;
    const distance=cockpit.seat.eye.distanceTo(glass.position);
    assert.ok(Math.abs(optics.aspect-glass.size.x/glass.size.y)<1e-9);
    assert.ok(Math.abs(optics.eye.x-glass.position.x-distance)<1e-9);
    assert.ok(Math.abs(2*distance*Math.tan(THREE.MathUtils.degToRad(optics.fov/2))-glass.size.y)<1e-9);
  }finally{cockpit.dispose();disposeVehicle(vehicle);}
});

test('changing car rebuilds only the reference interior and leaves artist geometry/materials intact',()=>{
  const a=vehicle(),b=vehicle(5.9,2.25,1.95),source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({opacity:.42,transparent:true}));a.root.add(source);
  const cockpit=new CockpitView();cockpit.setVehicle(a);let old;cockpit.root.traverse(o=>{if(!old&&o.geometry)old=o.geometry;});let disposed=0;old.addEventListener('dispose',()=>disposed++);
  cockpit.setVehicle(b);assert.equal(disposed,1);assert.equal(source.material.opacity,.42);assert.equal(source.visible,true);assert.equal(source.parent,a.root);
  assert.ok(cockpit.seat.eye.y>cockpitSeat(a).eye.y);assert.ok(cockpit.seat.width>cockpitSeat(a).width);
  cockpit.dispose();source.geometry.dispose();source.material.dispose();
});

test('open Grand Prix cockpit uses the actual body and working wheel hubs, with clear road and sky',()=>{
  const car=vehicle(3.8,1.65,.92);car.profileId='sd-67gp-example';car.cockpitEye=[-.20,.43,0];car.cockpitWheel=[.22,.16,0];
  const mesh=(geo,name)=>{const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());m.name=name;m.userData.kind='model';return m;};
  const nose=mesh(new THREE.BoxGeometry(.85,.18,.42).translate(.94,-.03,0),'paint_nose'),wheel=new THREE.Group();
  wheel.userData.spinGroup=new THREE.Group();wheel.add(wheel.userData.spinGroup);wheel.position.set(1.12,-.24,.65);
  const tyre=mesh(new THREE.CylinderGeometry(.31,.31,.18,24),'Tire_FrontRight');wheel.userData.spinGroup.add(tyre);
  const dial=mesh(new THREE.CircleGeometry(.055,16).rotateY(-Math.PI/2).translate(.42,.14,0),'gp_instrument_dial');
  car.root.add(nose,wheel,dial);car.wheels=[wheel];car.paintMaterials=[nose.material];
  const cockpit=new CockpitView();cockpit.setVehicle(car);cockpit.root.visible=true;
  try{
    assert.deepEqual(cockpit.seat.eye.toArray(),car.cockpitEye);
    assert.equal(cockpit.interior.root.userData.layout,'open-grand-prix');assert.equal(cockpit.mirrorSurface,null);
    const local=cockpit.interior.root,bodyCopy=local.getObjectByName(nose.name),tyreCopy=local.getObjectByName(tyre.name);
    assert.equal(bodyCopy.geometry,nose.geometry);assert.equal(tyreCopy.geometry,tyre.geometry);
    assert.notEqual(bodyCopy.material,nose.material);assert.equal(local.getObjectByName(dial.name).geometry,dial.geometry);
    cockpit.setPaint('#3578bc');assert.equal(bodyCopy.material.color.getHex(),0x3578bc);assert.notEqual(nose.material.color.getHex(),0x3578bc);
    wheel.rotation.y=.18;wheel.userData.spinGroup.rotation.z=-.67;
    const camera=new THREE.PerspectiveCamera(55,16/9,.1,200);
    const state={pos:new THREE.Vector3(),q:new THREE.Quaternion(),vel:new THREE.Vector3(20,0,0)};
    cockpit.update(camera,{state,wheels:[{steer:.18},{steer:.18}]},1);local.updateWorldMatrix(true,true);
    assert.ok(tyreCopy.parent.quaternion.angleTo(wheel.userData.spinGroup.quaternion)<1e-7);
    assert.ok(tyreCopy.parent.parent.quaternion.angleTo(wheel.quaternion)<1e-7);
    assert.ok(tyreCopy.getWorldPosition(new THREE.Vector3()).distanceTo(wheel.position)<1e-8);
    for(const direction of [[0,1,0],[1,0,0],[1,.4,-.2],[1,.4,.2]]){
      const ray=new THREE.Raycaster(cockpit.seat.eye,new THREE.Vector3(...direction).normalize(),.03,30);
      assert.equal(ray.intersectObject(local,true).length,0,'open sight line '+direction);
    }
  }finally{
    let disposed=0;nose.geometry.addEventListener('dispose',()=>disposed++);cockpit.dispose();assert.equal(disposed,0);
    nose.geometry.dispose();nose.material.dispose();tyre.geometry.dispose();tyre.material.dispose();dial.geometry.dispose();dial.material.dispose();
  }
});
