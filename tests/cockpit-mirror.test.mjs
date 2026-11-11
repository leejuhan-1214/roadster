import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CockpitMirror} from '../dist/js/cockpit-mirror.js';
function rendererStub(){
 const viewport=new THREE.Vector4(12,18,810,460),scissor=new THREE.Vector4(6,8,700,380),target=new THREE.WebGLCubeRenderTarget(64);
 return {target,face:3,mip:2,viewport,scissor,scissorTest:true,autoClear:false,shadowMap:{autoUpdate:true,needsUpdate:true},renders:0,clears:0,
 getRenderTarget(){return this.target},getActiveCubeFace(){return this.face},getActiveMipmapLevel(){return this.mip},
 getViewport(v){return v.copy(this.viewport)},getScissor(v){return v.copy(this.scissor)},getScissorTest(){return this.scissorTest},
 setViewport(v){this.viewport.copy(v)},setScissor(v){this.scissor.copy(v)},setScissorTest(v){this.scissorTest=v},
 setRenderTarget(target,face=0,mip=0){this.target=target;this.face=face;this.mip=mip},clear(){this.clears++},render(){this.renders++}};
}
const pose={bodyPosition:new THREE.Vector3(20,2,30),quaternion:new THREE.Quaternion(),eye:new THREE.Vector3(.2,.7,-.4)};
test('mirror renders the actual rear direction, flips optics and limits updates to ten per second',()=>{
 const m=new CockpitMirror(),r=rendererStub();
 assert.equal(m.target.width,256);assert.equal(m.target.height,128);assert.equal(m.camera.far,350);assert.equal(m.camera.near,.1);
 assert.equal(m.texture.repeat.x,-1);assert.equal(m.texture.offset.x,1);
 assert.equal(m.update(r,{},pose,0),true);assert.equal(m.ready,true);assert.equal(r.renders,1);
 assert.ok(m.camera.position.distanceTo(new THREE.Vector3(20.2,2.7,29.6))<1e-8);
 assert.ok(m.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(-1,0,0))<1e-8);
 for(let i=0;i<9;i++)assert.equal(m.update(r,{},pose,.01),false);
 assert.equal(m.update(r,{},pose,.01),true);assert.equal(r.renders,2);
 const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
 m.update(r,{}, {...pose,quaternion:q},.1);
 assert.ok(m.camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(0,0,1))<1e-8);
 m.dispose();r.target.dispose();
});
test('a failed offscreen render restores hidden objects and all renderer state, including cube face/mip',()=>{
 const m=new CockpitMirror(),r=rendererStub(),target=r.target,v=r.viewport.clone(),s=r.scissor.clone();
 const own={visible:true},alreadyHidden={visible:false};
 r.render=()=>{assert.equal(own.visible,false);assert.equal(alreadyHidden.visible,false);assert.equal(r.target,m.target);assert.equal(r.autoClear,true);assert.equal(r.shadowMap.autoUpdate,false);assert.equal(r.shadowMap.needsUpdate,false);r.viewport.set(1,2,3,4);r.scissor.set(5,6,7,8);r.scissorTest=false;throw new Error('renderer failed')};
 assert.throws(()=>m.update(r,{},pose,0,[own,own,alreadyHidden]),/renderer failed/);
 assert.equal(own.visible,true);assert.equal(alreadyHidden.visible,false);assert.equal(r.target,target);assert.equal(r.face,3);assert.equal(r.mip,2);
 assert.ok(r.viewport.equals(v));assert.ok(r.scissor.equals(s));assert.equal(r.scissorTest,true);assert.equal(r.autoClear,false);
 assert.equal(r.shadowMap.autoUpdate,true);assert.equal(r.shadowMap.needsUpdate,true);assert.equal(m.busy,false);assert.equal(m.ready,false);
 r.render=()=>r.renders++;assert.equal(m.update(r,{},pose,.1,[own]),true);assert.equal(r.renders,1);
 assert.equal(m.hiddenState.length,0,'no old vehicle graph retained after restoring visibility');m.dispose();target.dispose();
});
test('mirror recursion is blocked and disposal releases the render target only once',()=>{
 const m=new CockpitMirror(),r=rendererStub();let disposed=0;
 m.target.addEventListener('dispose',()=>disposed++);
 r.render=()=>{r.renders++;assert.equal(m.update(r,{},pose,1),false)};
 m.update(r,{},pose,0);assert.equal(r.renders,1);m.dispose();m.dispose();assert.equal(disposed,1);assert.equal(m.update(r,{},pose,1),false);r.target.dispose();
});
