import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FlightScene} from '../dist/js/scene.js';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun} from '../dist/js/landing-experiment.js';

function view(width=714,height=668){
  const scene=Object.create(FlightScene.prototype);
  const camera=new THREE.PerspectiveCamera(43,width/height,.08,1500);
  camera.position.set(7.2,3.4,7.4);
  Object.assign(scene,{mode:'lab',cameraName:'orbit',canvas:{clientWidth:width,clientHeight:height},camera,
    cameraTarget:new THREE.Vector3(),cameraPosition:camera.position.clone(),
    controls:{target:new THREE.Vector3(),enableDamping:true,update(){camera.lookAt(this.target);}},
    landingVisual:{enabled:true,config:null}});
  return scene;
}
const direction=scene=>scene.camera.position.clone().sub(scene.controls.target).normalize();
const projected=(scene,p)=>{scene.camera.updateMatrixWorld(true);const v=p.clone().project(scene.camera);return {x:(v.x+1)*scene.canvas.clientWidth/2,y:(1-v.y)*scene.canvas.clientHeight/2};};

test('free driving, trial launch and restored view share one useful oblique direction',()=>{
  const scene=view(),sim=new PhysicsSim();
  scene.frameLabVehicle(sim);
  const initial=direction(scene),position=sim.state.pos.clone(),velocity=sim.state.vel.clone();
  scene.frameLabVehicle(sim);
  assert.ok(sim.state.pos.equals(position)&&sim.state.vel.equals(velocity),'framing must never change physics');
  for(const height of [0,3,20,5000]){
    createLandingRun(sim,{height});scene.frameLandingStart(sim);
    assert.ok(direction(scene).distanceTo(initial)<1e-10,'start height must not flip the viewing side');
    assert.ok(scene.controls.target.clone().sub(sim.bodyPosition).distanceTo(new THREE.Vector3(0,.25,0))<1e-10);
    assert.ok(scene.camera.position.distanceTo(scene.controls.target)<40,'high drops retain a readable local vehicle view');
    sim.state.pos.y=sim.restHeight;
    scene.updateCamera(sim,1/60);
    assert.ok(scene.controls.target.clone().sub(sim.bodyPosition).distanceTo(new THREE.Vector3(0,.25,0))<1e-10,'touchdown eye level cannot inherit a release-height offset');
  }
});

test('consecutive trials retain the actual user orbit and zoom; view restore deliberately resets them',()=>{
  const scene=view(),sim=new PhysicsSim();createLandingRun(sim,{height:3});scene.frameLandingStart(sim);
  const userOffset=new THREE.Vector3(-7,4,10);
  scene.camera.position.copy(scene.controls.target).add(userOffset);
  createLandingRun(sim,{height:8});scene.frameLandingStart(sim,{resetView:false});
  assert.ok(scene.camera.position.clone().sub(scene.controls.target).distanceTo(userOffset)<1e-10);
  scene.frameLabVehicle(sim,{resetView:true});
  assert.ok(direction(scene).distanceTo(new THREE.Vector3(6.4,3.2,8).normalize())<1e-10);
  assert.equal(scene.controls.enableDamping,true);
});

test('visible panels at narrow widths and offset canvases shift the camera into real available space',()=>{
  const previousDocument=globalThis.document;
  try{
    const scene=view(),sim=new PhysicsSim(),canvasLeft=31,canvasTop=17;
    scene.canvas.getBoundingClientRect=()=>({left:canvasLeft,top:canvasTop});
    const rect=(left,top,width,height)=>({left:left+canvasLeft,top:top+canvasTop,right:left+width+canvasLeft,bottom:top+height+canvasTop,width,height});
    let left=rect(-290,90,280,500);
    const right=rect(498,88,204,246),header=rect(0,0,714,72),tools=rect(180,610,354,40);
    const element=r=>({getBoundingClientRect:()=>r});
    globalThis.document={getElementById:id=>element(id==='left-panel'?left:right),querySelector:q=>element(q==='.topbar'?header:tools)};
    createLandingRun(sim,{height:3});scene.frameLandingStart(sim);
    let center=projected(scene,scene.controls.target);
    assert.ok(center.x>0&&center.x<498);
    for(const x of [-2.6,2.6])for(const y of [-.8,1])for(const z of [-1.2,1.2]){
      const point=projected(scene,sim.bodyPosition.clone().add(new THREE.Vector3(x,y,z)));
      assert.ok(point.x>0&&point.x<498&&point.y>80&&point.y<602,'car stays clear of telemetry, header and playback tools');
    }
    const ground=projected(scene,new THREE.Vector3(0,0,0));
    assert.ok(ground.x>0&&ground.x<498&&ground.y>80&&ground.y<602,'ordinary drop shows the landing plane');
    left=rect(12,110,280,480);scene.inspectionViewport();
    center=projected(scene,scene.controls.target);
    assert.ok(center.x>292&&center.x<498,'an opened mobile panel must not be treated as absent');
    left=rect(-290,90,280,500);scene.inspectionViewport();
    center=projected(scene,scene.controls.target);
    assert.ok(Math.abs(center.x-249)<1e-7,'closing the panel restores the wider centre without accumulating offsets');
  }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
});
