import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {inspectionDistance} from '../dist/js/scene.js';

for(const size of [[12,5,8],[8,9,6],[5,2,2]])test('spatial inspection frames all corners of '+size.join('×')+' m without the sidebar hiding them',()=>{
  const box=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0,4,0),new THREE.Vector3(...size));
  const direction=new THREE.Vector3(1,.65,1.3).normalize(),center=box.getCenter(new THREE.Vector3());
  const camera=new THREE.PerspectiveCamera(43,1280/720,.08,1500),panel=360;
  camera.setViewOffset(1280,720,-panel/2,0,1280,720);
  camera.position.copy(center).addScaledVector(direction,inspectionDistance(box,direction,43,1280/720,1-panel/1280));
  camera.lookAt(center);camera.updateMatrixWorld(true);
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera);
    assert.ok(p.x>panel/1280*2-1&&p.x<1,'corner stays outside the sidebar and inside the right edge');
    assert.ok(Math.abs(p.y)<.79,'corner clears the top bar and bottom controls');
    assert.ok(p.z>-1&&p.z<1);
  }
});
