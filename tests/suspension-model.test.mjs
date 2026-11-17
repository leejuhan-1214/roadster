import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createVehicle} from '../dist/js/vehicle.js';
import {updateSuspension} from '../dist/js/suspension-model.js';
import {FlightScene} from '../dist/js/scene.js';

const point = () => new THREE.Vector3();
const near = (a,b) => assert.ok(a.distanceTo(b) < 1e-8, JSON.stringify({a,b}));

test('a loaded corner shortens the coil and exposed piston between both mounts; tire spin leaves the knuckle still', () => {
  const car = createVehicle(), wheel = car.wheels[0];
  const rig = car.parts.get('suspension'), axis = rig.getObjectByName('telescopic spring and damper');
  const carrier = rig.getObjectByName('steering knuckle'), coil=axis.getObjectByName('compression spring');
  const piston=axis.getObjectByName('exposed piston rod');
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
  near(axis.position,carrier.localToWorld(point().set(0,-.055,.14)));
  updateSuspension(car,true);
  near(carrier.position,wheel.userData.basePosition);
  near(upperEndpoint(),top);
  assert.equal(coil.scale.y,initialLength);
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
