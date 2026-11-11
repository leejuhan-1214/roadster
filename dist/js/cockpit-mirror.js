import * as THREE from 'three';

/** One low-resolution optical rear view. eye is in body-local coordinates. */
export class CockpitMirror {
  constructor({width=256,height=128,rate=10,fov=55,far=350}={}){
    this.target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
    this.texture=this.target.texture;this.texture.name='live cockpit rear view';
    this.texture.colorSpace=THREE.LinearSRGBColorSpace;
    // An optical mirror reverses the rear-facing camera image horizontally.
    this.texture.repeat.x=-1;this.texture.offset.x=1;
    this.camera=new THREE.PerspectiveCamera(fov,width/height,.1,far);
    this.interval=1/Math.max(1,rate);this.elapsed=this.interval;this.ready=false;this.busy=false;this.disposed=false;
    this.eye=new THREE.Vector3(.1,.75,0);this.direction=new THREE.Vector3();this.lookTarget=new THREE.Vector3();
    this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();this.hiddenState=[];this.hiddenSet=new Set();
  }
  update(renderer,scene,{bodyPosition,quaternion,eye=this.eye},dt=0,hiddenObjects=[]){
    if(this.disposed||this.busy)return false;
    this.elapsed+=Math.max(0,Number.isFinite(dt)?dt:0);
    if(this.elapsed+1e-9<this.interval)return false;
    this.elapsed%=this.interval;this.busy=true;
    this.camera.position.copy(eye).applyQuaternion(quaternion).add(bodyPosition);
    this.camera.up.set(0,1,0).applyQuaternion(quaternion);
    this.direction.set(-1,0,0).applyQuaternion(quaternion);
    this.lookTarget.copy(this.camera.position).add(this.direction);this.camera.lookAt(this.lookTarget);
    const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.()||0,mip=renderer.getActiveMipmapLevel?.()||0;
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);
    const scissorTest=renderer.getScissorTest(),autoClear=renderer.autoClear;
    const shadow=renderer.shadowMap,shadowAuto=shadow?.autoUpdate,shadowNeeds=shadow?.needsUpdate;
    this.hiddenState.length=0;this.hiddenSet.clear();
    try{
      for(const object of hiddenObjects){
        if(!object||this.hiddenSet.has(object))continue;
        this.hiddenSet.add(object);this.hiddenState.push(object,object.visible);object.visible=false;
      }
      // Reuse the main camera's shadow map; a mirror must not recalculate it.
      if(shadow){shadow.autoUpdate=false;shadow.needsUpdate=false;}
      renderer.autoClear=true;renderer.setRenderTarget(this.target);renderer.clear(true,true,false);
      renderer.render(scene,this.camera);this.ready=true;return true;
    }finally{
      for(let i=0;i<this.hiddenState.length;i+=2)this.hiddenState[i].visible=this.hiddenState[i+1];
      this.hiddenState.length=0;this.hiddenSet.clear();this.busy=false;
      renderer.autoClear=autoClear;
      if(shadow){shadow.autoUpdate=shadowAuto;shadow.needsUpdate=shadowNeeds;}
      // Restore logical canvas settings first. setRenderTarget then restores the
      // selected target's physical viewport/scissor (important at DPR > 1).
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
      renderer.setRenderTarget(target,face,mip);
    }
  }
  dispose(){if(this.disposed)return;this.target.dispose();this.disposed=true;this.hiddenState.length=0;this.hiddenSet.clear();}
}
