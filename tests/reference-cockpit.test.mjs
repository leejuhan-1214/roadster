import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createReferenceCockpit,referenceCockpitFamily} from '../dist/js/reference-cockpit.js';

const seat={width:1.9,eye:new THREE.Vector3(.05,.85,-.44)};
const named=(root,text)=>{const found=[];root.traverse(n=>{if(n.name.includes(text))found.push(n);});return found;};

test('reference cabins retain generation-specific display placement instead of a universal front tablet',()=>{
  for(const [id,family] of [['lamborghini-urus','urus'],['bmw','e30'],['toyota-supra-mk4','supra'],['tesla-cybertruck','cybertruck'],['tesla-model-3','model3']]){
    assert.equal(referenceCockpitFamily({profileId:id}),family);
    const cabin=createReferenceCockpit({profileId:id},seat);
    assert.equal(cabin.root.userData.layout,family);assert.equal(cabin.steeringAxis,'x');
    assert.deepEqual(cabin.steering.position.toArray(),[.58,-.30,0]);
    if(['cybertruck','model3'].includes(family)){
      assert.equal(named(cabin.root,'cluster live screen').length,0);assert.equal(named(cabin.root,'instrument binnacle').length,0);
      assert.ok(named(cabin.root,'tablet live screen')[0].position.z>.3);
    }
    if(family==='urus'){
      assert.equal(named(cabin.root,'hexagonal air vent').length,4);
      const upper=named(cabin.root,'navigation live screen')[0],lower=named(cabin.root,'climate live screen')[0];
      assert.ok(upper.position.y>lower.position.y);assert.ok(upper.position.z>.3&&lower.position.z>.3);
    }
    cabin.dispose();
  }
});

test('driver eye and straight road view remain unobstructed by fallback interior geometry',()=>{
  for(const id of ['lamborghini-urus','bmw','toyota-supra-mk4','tesla-cybertruck','unknown']){
    const cabin=createReferenceCockpit({profileId:id},seat);cabin.root.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(Math.cos(-.06),Math.sin(-.06),0),.03,30);
    assert.equal(ray.intersectObject(cabin.root,true).length,0,id+' forward road sightline');
    assert.equal(cabin.mirrorAnchor.mirrorSurface,cabin.mirrorSurface);assert.ok(cabin.mirrorAnchor.position.y>0);
    assert.ok(named(cabin.root,'door inner panel').length===2);
    cabin.dispose();
  }
});

test('analog speed, gas and available power move needles without inventing engine RPM',()=>{
  const cabin=createReferenceCockpit({profileId:'bmw'},seat),speed=named(cabin.root,'speed needle')[0],power=named(cabin.root,'power needle')[0];
  cabin.update({speed:0,powerKW:0,gasFraction:1});const rest=speed.rotation.x;
  cabin.update({speed:130,powerKW:200,gasFraction:.5,gear:'D'});
  assert.ok(speed.rotation.x>rest);assert.ok(Math.abs(speed.rotation.x)<1e-12);assert.ok(Math.abs(power.rotation.x)<1e-12);
  assert.equal(cabin.root.userData.telemetry.rpm,null);
  cabin.update({speed:Infinity,powerKW:NaN,rpm:6000,gasFraction:-1});
  assert.equal(cabin.root.userData.telemetry.speed,0);assert.equal(cabin.root.userData.telemetry.gasFraction,0);assert.equal(cabin.root.userData.telemetry.rpm,6000);assert.ok(power.rotation.x>0);
  cabin.dispose();
});

test('fallback disposes every owned GPU resource once and leaves the source vehicle untouched',()=>{
  const source=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()),vehicle={profileId:'lamborghini-urus',root:new THREE.Group()};vehicle.root.add(source);
  const cabin=createReferenceCockpit(vehicle,seat),resources=new Set();
  cabin.root.traverse(n=>{if(n.isInstancedMesh)resources.add(n);if(n.geometry)resources.add(n.geometry);for(const mat of [n.material].flat().filter(Boolean)){resources.add(mat);if(mat.bumpMap)resources.add(mat.bumpMap);}});
  cabin.paintMaterials.forEach(m=>resources.add(m));
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  cabin.dispose();cabin.dispose();for(const resource of resources)assert.equal(counts.get(resource),1,resource.type||'geometry');
  assert.equal(cabin.root.children.length,0);assert.equal(source.parent,vehicle.root);source.geometry.dispose();source.material.dispose();
});
