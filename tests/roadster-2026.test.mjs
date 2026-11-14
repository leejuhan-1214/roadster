import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createRoadster2026Vehicle} from '../dist/js/roadster-2026.js';
import {ROCKET_THRUSTERS} from '../dist/js/rocket-layout.js';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from '../dist/js/vehicle-fit.js';
import {PhysicsSim} from '../dist/js/physics.js';

test('2026 reference ports use the same 4+4+2 mounts as the physical solver',()=>{
  const v=createRoadster2026Vehicle(),s=new PhysicsSim(v.geometryParams);
  configureVehicleFit(v,{id:'roadster'});
  assert.equal(v.jetMounts.length,10);assert.equal(v.gimbalNozzles.length,4);
  assert.equal(v.nozzleCovers.length,6,'four visible rear ports and six concealed attitude ports');
  const rig=v.parts.get('thrusters');
  for(let i=0;i<10;i++){
    const mount=rig.getObjectByName('rocket-mount-'+i),expected=new THREE.Vector3(...ROCKET_THRUSTERS[i].position);
    assert.ok(mount.position.distanceTo(expected)<1e-12);
    assert.ok(s.thrusters[i].mountPosition.distanceTo(expected)<1e-12);
    const dir=new THREE.Vector3(...ROCKET_THRUSTERS[i].direction);
    assert.ok(v.jetMounts[i].dir.distanceTo(dir)<1e-12);
    assert.ok(v.jetMounts[i].pos.clone().sub(expected).cross(dir).length()<1e-12,'mouth offset stays on the force axis');
  }
  const rear=v.jetMounts.slice(4,8);assert.equal(new Set(rear.map(t=>t.pos.y)).size,1);
  assert.equal(new Set(rear.map(t=>t.pos.z)).size,4);
  assert.ok(rear.every(t=>t.pos.x< -2.25&&t.pos.y<0),'mouths are visible below the plate inside the diffuser');
  assert.ok(v.jetMounts.slice(8).every(t=>t.pos.x>1.8),'side outlets are ahead of the front wheel arch');
  updateNozzleCovers(v,Array.from({length:10},()=>({opening:0})),false);
  assert.ok(v.nozzleCovers.every(c=>c.hinge.rotation.y===0));
  updateNozzleCovers(v,Array.from({length:10},()=>({opening:1})),false);
  assert.ok(v.nozzleCovers.every(c=>c.hinge.rotation.y< -1));
});

test('2026 reference disassembles without overlap and preserves the assembled wheel pose',()=>{
  const v=createRoadster2026Vehicle();configureVehicleFit(v,{id:'roadster'});
  const original=v.fitLayout.entries.map(e=>e.object.getWorldPosition(new THREE.Vector3()));
  updateVehicleExplosion(v,1,{inspect:true});
  const boxes=v.fitLayout.logicalGroups.map(g=>({id:g.id,box:g.entries.reduce((b,e)=>b.union(new THREE.Box3().setFromObject(e.object)),new THREE.Box3())}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.equal(boxes[i].box.intersectsBox(boxes[j].box),false,`${boxes[i].id} overlaps ${boxes[j].id}`);
  updateVehicleExplosion(v,0,{inspect:true});
  v.fitLayout.entries.forEach((e,i)=>assert.ok(e.object.getWorldPosition(new THREE.Vector3()).distanceTo(original[i])<1e-9));
  const wheel=v.wheels[0];wheel.rotation.y=.3;wheel.userData.spinGroup.rotation.z=2;wheel.position.y=-.20;
  updateVehicleExplosion(v,0,{inspect:false});assert.equal(wheel.rotation.y,.3);assert.equal(wheel.userData.spinGroup.rotation.z,2);assert.equal(wheel.position.y,-.20);
});

test('2026 authored model identifies its limits and all visible paint changes together',()=>{
  const v=createRoadster2026Vehicle();assert.equal(v.referenceRoadster,true);assert.equal(v.actualRoadster,false);
  assert.ok(v.assetInfo.alignment.includes('not OEM CAD'));
  for(const id of ['reference-nose','reference-canopy','reference-tail-light','tank','thrusters','battery','suspension'])assert.ok(v.catalog.some(e=>e.id===id),id);
  assert.equal(v.catalog.filter(e=>e.id==='tank').length,1);assert.equal(v.parts.get('tank').children.filter(c=>c.name.includes('COPV')).length,2);
  for(const p of v.paintMaterials)p.color.set('#3366ff');
  const materialSet=new Set(v.paintMaterials);let painted=0;
  v.root.traverse(o=>{if(o.isMesh&&materialSet.has(o.material)){painted++;assert.equal(o.material.color.getHexString(),'3366ff');}});
  assert.ok(painted>15);
  assert.equal(v.wheels.length,4);assert.ok(v.wheels.every(w=>w.userData.spinGroup));
});

test('the inset side windows have closed shoulders instead of views through to the ground',()=>{
  const v=createRoadster2026Vehicle();v.root.updateMatrixWorld(true);
  for(const side of [-1,1])for(const x of [-.9,0,.8]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,2,side*.92),new THREE.Vector3(0,-1,0));
    const hits=ray.intersectObject(v.parts.get('body'),true);
    assert.ok(hits.length>0,`body shoulder missing at x=${x}, side=${side}`);
    assert.equal(hits[0].object.name,'closed window beltline shoulder');
    assert.ok(hits[0].point.y>.20&&hits[0].point.y<.31);
  }
});
