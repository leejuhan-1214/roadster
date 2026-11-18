import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicle} from '../dist/js/vehicle.js';
// Exercise re-entry from a different module URL, as on a cache-versioned page.
import {createSuspension, updateSuspension} from '../dist/js/suspension-model.js?test-second-module';
import {suspensionLayout, suspensionDescription} from '../dist/js/suspension-layouts.js';
import {FlightScene} from '../dist/js/scene.js';

const point = () => new THREE.Vector3();
const near = (a,b) => assert.ok(a.distanceTo(b) < 1e-8, JSON.stringify({a,b}));

test('a loaded corner shortens the coil and exposed piston between both mounts; tire spin leaves the knuckle still', () => {
  const car = createVehicle(), wheel = car.wheels[0];
  const rig = car.parts.get('suspension'), axis = rig.getObjectByName('telescopic spring and damper');
  const carrier = rig.getObjectByName('steering knuckle'), coil=axis.getObjectByName('compression spring');
  const piston=axis.getObjectByName('exposed piston rod');
  const arm=rig.getObjectByName('lower control arm'), tieRod=rig.getObjectByName('rack tie rod');
  const armFoot = arm.worldToLocal(axis.getWorldPosition(point()));
  const rackLength=tieRod.scale.y;
  const upperEndpoint = () => axis.localToWorld(point().set(0,axis.getObjectByName('upper spring seat').position.y + .011,0));
  const top = upperEndpoint(), initialLength = coil.scale.y, exposed = piston.scale.y;
  wheel.position.y += .13;
  wheel.rotation.y=.14;
  wheel.userData.spinGroup.rotation.z=1.5;
  updateSuspension(car);
  near(upperEndpoint(),top);
  near(carrier.position,wheel.position);
  assert.ok(carrier.quaternion.angleTo(wheel.quaternion)<1e-7);
  assert.ok(coil.scale.y<initialLength && piston.scale.y<exposed);
  near(axis.getWorldPosition(point()),arm.localToWorld(armFoot.clone()));
  assert.ok(Math.abs(tieRod.scale.y-rackLength)<1e-8);
  const foot=axis.position.clone();
  wheel.rotation.y=-.2;
  updateSuspension(car);
  near(axis.position,foot); // The coilover is bolted to the wishbone, independent of steering.
  updateSuspension(car,true);
  near(carrier.position,wheel.userData.basePosition);
  near(upperEndpoint(),top);
  assert.equal(coil.scale.y,initialLength);
});

test('documented axle families and explicitly illustrative suspensions use distinct hardware', () => {
  const wheels=[[1.2,-.88],[1.2,.88],[-1.2,-.86],[-1.2,.86]].map(([x,z])=>{
    const w=new THREE.Group();
    w.position.set(x,-.24,z);
    w.userData.basePosition=w.position.clone();
    return w;
  });
  const count=(part,name)=>part.getObjectsByProperty('name',name).length;
  for (const [id, expected] of [
    ['mazda-miata-mx-5', {'upper wishbone':4}],
    ['alfa-romeo-4c', {'upper wishbone':2,'lower control arm':4}],
    ['bmw', {'semi-trailing arm':2,'separate rear spring':2,'upper wishbone':0}],
    ['toyota-yaris', {'longitudinal trailing link':2,'upper wishbone':2}],
    ['lamborghini-aventador-lp700-4',{'suspension pushrod':4,'inboard bell crank':4,'upper wishbone':4}],
    ['tesla-cybertruck', {'rolling air spring sleeve':4,'compression spring':0}],
    ['unknown', {'upper wishbone':0,'compression spring':4}]
  ]) {
    const rig=new THREE.Group(), car={wheels,parts:new Map([['suspension',rig]])};
    createSuspension(rig,wheels.map(w=>w.position),id);
    for(const [name,needed] of Object.entries(expected)) assert.equal(count(rig,name),needed,id+' '+name);
    const hubs=rig.getObjectsByProperty('name','steering knuckle');
    const rods=rig.getObjectsByProperty('name','suspension pushrod');
    const rodLengths=rods.map(rod=>rod.scale.y);
    const frontCoil=rig.getObjectByName('compression spring');
    const initialSpringLength=frontCoil?.scale.y;
    const offsets=[.05,.03,-.02,.09];
    updateSuspension(car,true,{travel:offsets,steer:.17});
    if(rods.length) {
      assert.ok(frontCoil.scale.y<initialSpringLength);
      for(const [i,rod] of rods.entries()) assert.ok(Math.abs(rod.scale.y-rodLengths[i])<1e-8);
    }
    for(const [i,carrier] of hubs.entries()) {
      assert.equal(carrier.position.y, wheels[i].userData.basePosition.y+offsets[i]);
      assert.equal(carrier.rotation.y, i<2 ? .17 : 0);
      assert.deepEqual(wheels[i].position,wheels[i].userData.basePosition);
    }
    updateSuspension(car,true);
    for(const [i,carrier] of hubs.entries()) near(carrier.position,wheels[i].position);
  }
  assert.equal(suspensionLayout('roadster').source,null);
  assert.match(suspensionDescription('roadster'), /예시/);
  assert.match(suspensionDescription('unknown'), /등가/);
});

test('lab cutaway exposes wheels and suspension on a fitted source vehicle and restores exterior on return', () => {
  const parts = new Map(['skin','wheel','suspension','tank'].map(id=>[id,new THREE.Group()]));
  const entries = [
    {id:'skin',kind:'model',category:'exterior'}, {id:'wheel',kind:'model',category:'wheels'},
    {id:'suspension',kind:'hypothesis'}, {id:'tank',kind:'hypothesis'}
  ];
  const scene = {vehicle:{profileId:'roadster',detailParts:parts},mode:'lab',cutaway:true,getPartCatalog:()=>entries};
  FlightScene.prototype.applyInspectorVisibility.call(scene);
  assert.deepEqual([...parts.values()].map(p=>p.visible),[false,true,true,false]);
  scene.cutaway=false;
  FlightScene.prototype.applyInspectorVisibility.call(scene);
  assert.deepEqual([...parts.values()].map(p=>p.visible),[true,true,false,false]);
});
