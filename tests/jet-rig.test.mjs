import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installJetRig,updateJetRig,JET_VISUAL_DIMENSIONS} from '../dist/js/jet-rig.js';

function vehicle(width=1.9,wheelbase=2.8){
  const root=new THREE.Group(),body=new THREE.Mesh(new THREE.BoxGeometry(4.6,1.1,width),new THREE.MeshStandardMaterial({color:0x992233}));
  body.position.y=.15;root.add(body);
  return {root,body,parts:new Map([['body',body]]),paintMaterials:[body.material],geometryParams:{wheelbase,wheelRadius:.36,bodyLength:4.6,bodyWidth:width,bodyHeight:1.1,bodyCenterY:.15},
    nozzleFit:{skinBounds:new THREE.Box3(new THREE.Vector3(-2.3,-.4,-width/2),new THREE.Vector3(2.3,.7,width/2))}};
}
test('full-size 70-engine rig uses actual force points and separate 4 x 4 lift pods',()=>{
  const v=vehicle(),originalColor=v.body.material.color.getHex(),originalPose=v.body.matrix.clone();
  const p=installJetRig(v),rig=v.jetRig;
  assert.equal(rig.groups.length,10);assert.equal(rig.groups.reduce((s,g)=>s+g.count,0),70);
  assert.deepEqual(rig.groups.map(g=>g.count),[16,16,16,16,1,1,1,1,1,1]);
  assert.equal(JET_VISUAL_DIMENSIONS.diameter,.234);assert.equal(JET_VISUAL_DIMENSIONS.length,.444);
  for(const g of rig.groups){
    assert.ok(g.root.position.equals(g.forcePosition));
    if(g.index<4){
      assert.equal(Math.abs(g.forcePosition.x),p.liftX);assert.equal(Math.abs(g.forcePosition.z),p.liftZ);
      assert.equal(new Set(g.offsets.map(o=>o.x)).size,4);assert.equal(new Set(g.offsets.map(o=>o.z)).size,4);
      for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)assert.ok(g.offsets[i].distanceTo(g.offsets[j])>=.26-1e-10);
      assert.ok(Math.abs(g.forcePosition.z)-.54>v.nozzleFit.skinBounds.max.z,'pod clears original body');
    }
  }
  rig.shared.casing.computeBoundingBox();assert.ok(Math.abs(rig.shared.casing.boundingBox.getSize(new THREE.Vector3()).y-.444)<1e-6);
  assert.equal(v.body.material.color.getHex(),originalColor);assert.ok(v.body.matrix.equals(originalPose));
  assert.equal(installJetRig(v),p,'install is idempotent');
  let meshes=0;rig.root.traverse(o=>{if(o.isMesh)meshes++;});assert.ok(meshes<60,'instancing keeps rig draw calls bounded');
});
test('swept pod geometry stays above tire ground and inside conservative collision bounds',()=>{
  const v=vehicle(2.3,3.4),p=installJetRig(v),g=v.jetRig.groups[0],point=new THREE.Vector3(),q=new THREE.Quaternion();
  assert.ok(p.bodyWidth>2.3+2);assert.ok(p.info.minimumSweptGroundClearanceM>.30);
  for(let a=0;a<360;a+=10)for(const tilt of [0,12.5,25]){
    const t=tilt*Math.PI/180,r=a*Math.PI/180,dir=new THREE.Vector3(Math.sin(t)*Math.cos(r),Math.cos(t),Math.sin(t)*Math.sin(r));
    q.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
    for(const x of [-.54,.54])for(const y of [-.222,.222])for(const z of [-.54,.54]){
      point.set(x,y,z).applyQuaternion(q).add(g.forcePosition);
      assert.ok(point.y>p.info.tireGroundY+.30);assert.ok(p.physicalBounds.containsPoint(point));
    }
  }
});
test('rotor, plume and gimbal display actual state without modifying simulation',()=>{
  const v=vehicle();installJetRig(v);
  const thrust=new THREE.Vector3(.2,.97,.1).normalize(),thrusters=Array.from({length:10},(_,i)=>({dir:i<4?thrust:new THREE.Vector3(1,0,0),rpm:19000,running:true,force:i<4?10000:200,jetState:{phase:'running'}}));
  const sim={thrusters},before=JSON.stringify(sim);updateJetRig(v,sim,.016);
  assert.equal(JSON.stringify(sim),before);
  const g=v.jetRig.groups[0],axis=new THREE.Vector3(0,1,0).applyQuaternion(g.root.quaternion);
  assert.ok(axis.distanceTo(thrust)<1e-10);assert.ok(g.exhaust.visible);assert.ok(g.rotorAngle>0);
  assert.ok(g.root.position.equals(g.forcePosition),'gimbal rotates about physical force center');
  thrusters[0].running=false;thrusters[0].force=0;thrusters[0].rpm=0;thrusters[0].jetState.phase='off';
  updateJetRig(v,sim,.016);assert.equal(g.exhaust.visible,false);assert.equal(g.root.userData.engineState,'off');
});
