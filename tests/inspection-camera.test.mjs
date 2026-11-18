import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FlightScene,inspectionDistance} from '../dist/js/scene.js';

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

test('selected-part closeup fits outside the visible controls across phone rotation',()=>{
  const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
  let w=390,h=844,card=rect(148,147,378,353),header=96,toggle=142,tools=785;
  const canvas={getBoundingClientRect:()=>rect(0,0,w,h),ownerDocument:{querySelector(selector){
    const bounds={'#part-card':card,'.topbar':rect(0,0,w,header),'.view-tools':rect(10,tools,w-10,h-10),
      '#panel-toggle':rect(12,header+8,100,toggle)}[selector];
    return bounds?{getBoundingClientRect:()=>bounds}:null;
  }}};
  const root=new THREE.Group(),part=new THREE.Mesh(new THREE.BoxGeometry(4.7,1.3,2));
  part.position.set(2,3,-1);root.add(part);
  const view=Object.create(FlightScene.prototype);
  const camera=new THREE.PerspectiveCamera(43,w/h,.08,1500);
  const target=new THREE.Vector3();camera.position.set(2,1,3);
  const orbit=camera.position.clone().normalize();
  Object.assign(view,{canvas,camera,mode:'inspect',vehicle:{root},selectedPart:part,
    controls:{target,minDistance:.25,maxDistance:55,update(){camera.lookAt(target);camera.updateMatrixWorld(true);}},
    cameraTarget:new THREE.Vector3()});
  const assertVisible=()=>{
    const points=part.geometry.getAttribute('position');
    for(let i=0;i<points.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(part.matrixWorld).project(camera);
      const x=(1+p.x)*w/2,y=(1-p.y)*h/2;
      assert.ok(x>0&&x<w&&y>toggle&&y<tools&&Math.abs(p.z)<1,'corner is visible inside the inspector');
      assert.ok(x<card.left||y>card.bottom,'corner clears the open part card');
    }
    assert.ok(camera.position.clone().sub(target).normalize().distanceTo(orbit)<1e-10);
  };
  view.frameSelectedPart();assertVisible();
  w=844;h=390;card=rect(602,128,832,334);header=72;toggle=122;tools=331;
  view.inspectionViewport();assertVisible();
  part.scale.setScalar(.02);view.frameSelectedPart();
  assert.ok(camera.position.distanceTo(target)<.6,'small mechanical pieces can still be viewed at close range');
});
