import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitWheelGeometry,transformedGeometry} from '../dist/js/model-geometry.js';
import {PhysicsSim,allocateLift} from '../dist/js/physics.js';

test('combined wheel primitives split without losing triangles, UVs or material groups',()=>{
  const geometry=new THREE.BufferGeometry(),positions=[],uvs=[],indices=[];
  for(const [x,z]of [[2,-1],[2,1],[-2,-1],[-2,1]]){
    const offset=positions.length/3;positions.push(x-.1,0,z,x+.1,0,z,x,.3,z);
    uvs.push(0,0,1,0,.5,1);indices.push(offset,offset+1,offset+2);
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  geometry.addGroup(0,6,1);geometry.addGroup(6,6,2);
  const pieces=splitWheelGeometry(geometry);
  assert.deepEqual(pieces.map(p=>p.wheel),[0,1,2,3]);
  assert.equal(pieces.reduce((sum,p)=>sum+p.geometry.index.count,0),geometry.index.count);
  for(const p of pieces){assert.deepEqual([...p.geometry.attributes.uv.array],[0,0,1,0,.5,1]);assert.equal(p.geometry.groups[0].materialIndex,p.wheel<2?1:2);}
});

test('vehicle fitted thrust coordinates drive actual forces and allocation moments',()=>{
  const sim=new PhysicsSim({liftX:1.1,liftY:-.25,liftZ:.53,boostX:-2.4,boostY:.1,boostZ:.38,yawX:1.6,yawY:.1,yawZ:.75});
  const {liftLayout:layout,cg}=sim;
  const direction=new THREE.Vector3(.2,1,.1).normalize();
  const out=allocateLift(20000,400,-250,direction,cg,[15000,15000,15000,15000],layout);
  const torque=new THREE.Vector3(),force=new THREE.Vector3();
  out.thrust.forEach((thrust,i)=>{const f=direction.clone().multiplyScalar(thrust);force.add(f);torque.add(new THREE.Vector3().crossVectors(sim.thrusters[i].pos,f));});
  assert.ok(Math.abs(force.y-20000)<1e-6);assert.ok(Math.abs(torque.x-400)<1e-6);assert.ok(Math.abs(torque.z+250)<1e-6);
  assert.equal(sim.thrusters[4].pos.x,-2.4);assert.equal(sim.thrusters[6].pos.z,.75);
  sim.params.liftY=.15;sim.reset();assert.equal(sim.thrusters[0].pos.y,.15);
});

for(const indexed of [true,false])test(`mirrored ${indexed?'indexed':'non-indexed'} source keeps outward faces and tangent handedness`,()=>{
  const source=new THREE.BufferGeometry();
  source.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0],3));
  source.setAttribute('normal',new THREE.Float32BufferAttribute(Array.from({length:6},()=>[0,0,1]).flat(),3));
  source.setAttribute('tangent',new THREE.Float32BufferAttribute(Array.from({length:6},()=>[1,0,0,1]).flat(),4));
  source.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],2));
  if(indexed)source.setIndex([0,1,2,3,4,5]);
  source.addGroup(0,3,0);source.addGroup(3,3,1);
  const geometry=transformedGeometry(source,new THREE.Matrix4().makeScale(-2,3,1));
  assert.deepEqual([...geometry.index.array],[0,2,1,3,5,4]);
  assert.deepEqual(geometry.groups,source.groups);
  assert.deepEqual([...geometry.attributes.uv.array],[...source.attributes.uv.array]);
  for(let i=0;i<6;i+=3){
    const a=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,geometry.index.getX(i));
    const b=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,geometry.index.getX(i+1));
    const c=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,geometry.index.getX(i+2));
    const faceNormal=b.sub(a).cross(c.sub(a)).normalize();
    const normal=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,geometry.index.getX(i));
    assert.ok(faceNormal.dot(normal)>.999);
  }
  for(let i=0;i<6;i++){
    assert.equal(geometry.attributes.tangent.getW(i),-1);
    assert.equal(geometry.attributes.tangent.getX(i),-1);
    assert.equal(source.attributes.tangent.getW(i),1);
  }
  assert.deepEqual(source.index?[...source.index.array]:null,indexed?[0,1,2,3,4,5]:null);
  source.dispose();geometry.dispose();
});
