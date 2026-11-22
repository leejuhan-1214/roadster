import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {cockpitSeat} from '../dist/js/cockpit-view.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

test('BRZ body panels have one paint finish and driver sight lines cross one clear windshield',async()=>{
  const profile=VEHICLES.find(p=>p.id==='subaru-brz');
  const {scene,parser}=await loadModelGeometry(profile);
  // The geometry-only test loader deliberately uses opaque placeholder materials.
  // Restore the sidedness and transparency declared by the delivered asset.
  const materials=new Map(parser.json.materials.map(m=>[m.name,m]));
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const material=mesh.material,definition=materials.get(material.name);
    material.side=definition.doubleSided?THREE.DoubleSide:THREE.FrontSide;
    material.transparent=definition.alphaMode==='BLEND';
    material.opacity=definition.pbrMetallicRoughness.baseColorFactor?.[3]??1;
  });
  const vehicle=adaptRealVehicle(scene,profile);
  try{
    configureVehicleFit(vehicle,profile);vehicle.root.updateMatrixWorld(true);
    const exterior=[...vehicle.detailParts.values()].filter(part=>part.isMesh&&part.userData.kind==='model');
    const windows=exterior.filter(mesh=>mesh.material.name==='Cabin window glass');
    assert.equal(windows.length,6);
    assert.ok(windows.every(m=>m.material.transparent&&m.material.opacity<.5&&!m.material.depthWrite));
    const eye=cockpitSeat(vehicle).eye;
    for(const pitch of [-.12,-.06,0,.04,.08])for(const yaw of [-.22,-.12,0,.12,.22]){
      const direction=new THREE.Vector3(1,pitch,yaw).normalize();
      const hits=new THREE.Raycaster(eye,direction,.03,3).intersectObjects(exterior,false);
      assert.equal(hits.length,1,`BRZ forward ray ${pitch}/${yaw}`);
      assert.ok(windows.includes(hits[0].object));
    }
    for(const x of [-.32,-.12,.08,.28])for(const y of [-.06,.04,.14]){
      const hits=new THREE.Raycaster(new THREE.Vector3(x,y,-1.8),new THREE.Vector3(0,0,1),0,2).intersectObjects(exterior,false);
      assert.ok(hits.length>0);
      const surface=hits.filter(h=>h.distance<hits[0].distance+.004);
      assert.ok(surface.every(h=>h.object.material.userData.vehiclePaint),`paint on door at ${x}/${y}`);
    }
    const body=vehicle.parts.get('body');
    body.traverse(mesh=>{if(mesh.isMesh)mesh.material.side=THREE.DoubleSide;});
    for(const [i,wheel] of vehicle.wheels.entries()){
      const r=vehicle.cityWheelGeometry[i].radius;
      for(const x of [-.07,0,.07])for(const z of [-.04,.02,.06]){
        const origin=wheel.position.clone();origin.x+=x;origin.z+=Math.sign(origin.z)*z;
        const hit=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),.03,1).intersectObject(body,true)[0];
        assert.ok(hit&&hit.distance-Math.sqrt(r*r-x*x)>.02,`wheel well clearance at ${i}/${x}/${z}`);
      }
    }
  }finally{
    disposeVehicle(vehicle);
    scene.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
  }
});
