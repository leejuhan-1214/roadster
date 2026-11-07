import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {straightenParkedFrontWheels,adaptRealVehicle} from '../dist/js/real-vehicle-model.js';

test('parked tire, rim and caliper return to a shared straight hub axis',()=>{
  const records=[],boxes=Array.from({length:4},()=>new THREE.Box3()),expected=[];
  for(let wheel=0;wheel<2;wheel++){
    const hub=new THREE.Vector3(1.4,.3,wheel?.8:-.8),yaw=(wheel?-.41:.58);
    const transform=new THREE.Matrix4().makeTranslation(hub.x,hub.y,hub.z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    const tire=new THREE.CylinderGeometry(.4,.4,.24,96).rotateX(Math.PI/2);
    const rim=new THREE.CylinderGeometry(.29,.29,.12,96).rotateX(Math.PI/2);
    const caliper=new THREE.BoxGeometry(.08,.12,.1).translate(.2,0,0);
    for(const [kind,g] of [['tire',tire],['rim',rim],['caliper',caliper]]){
      expected.push(g.clone().translate(hub.x,hub.y,hub.z));
      g.applyMatrix4(transform);g.computeBoundingBox();
      records.push({wheel,tire:kind==='tire',geometry:g});if(kind==='tire')boxes[wheel].union(g.boundingBox);
    }
  }
  const rear=new THREE.BoxGeometry(.7,.7,.2).translate(-1.4,.3,.8);rear.computeBoundingBox();
  const rearPosition=Array.from(rear.attributes.position.array);records.push({wheel:3,tire:true,geometry:rear});
  const angles=straightenParkedFrontWheels(records,boxes);
  assert.ok(Math.abs(angles[0]+.58)<.005);assert.ok(Math.abs(angles[1]-.41)<.005);
  for(let i=0;i<expected.length;i++){
    const actual=records[i].geometry.attributes.position,want=expected[i].attributes.position;
    for(let vertex=0;vertex<actual.count;vertex++)assert.ok(new THREE.Vector3().fromBufferAttribute(actual,vertex).distanceTo(new THREE.Vector3().fromBufferAttribute(want,vertex))<.002,'every wheel component uses the same correction');
  }
  assert.deepEqual(Array.from(rear.attributes.position.array),rearPosition,'rear axle remains unchanged');
});

test('rubber finish does not change a body sharing the source material',()=>{
  const source=new THREE.Group(),shared=new THREE.MeshStandardMaterial({name:'shared',metalness:.6,roughness:.3});
  for(const [x,z] of [[1,-.8],[1,.8],[-1,-.8],[-1,.8]]){
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.22,24).rotateX(Math.PI/2),shared);
    tire.name='tire-'+x+'-'+z;tire.position.set(x,0,z);source.add(tire);
  }
  const body=new THREE.Mesh(new THREE.BoxGeometry(2.9,.7,1.5),shared);body.name='body';source.add(body);
  const vehicle=adaptRealVehicle(source,{id:'material-fixture',title:'fixture',yaw:0,wheelbase:2,paintMaterials:[],adapter:{wheelPattern:'^tire-',tirePattern:'^tire-'}});
  const adaptedBody=vehicle.root.getObjectByName('body').children.find(o=>o.isMesh),tire=vehicle.wheels[0].userData.spinGroup.children[0];
  assert.equal(tire.material.metalness,0);assert.equal(tire.material.roughness,.88);
  assert.equal(adaptedBody.material.metalness,.6);assert.equal(adaptedBody.material.roughness,.3);
  assert.notEqual(tire.material,adaptedBody.material);assert.equal(shared.metalness,.6);
});
