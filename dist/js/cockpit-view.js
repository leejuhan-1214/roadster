import * as THREE from 'three';
import {createSourceCockpit} from './source-cockpit.js?v=20261121-driver';
import {createReferenceCockpit} from './reference-cockpit.js?v=20261121-driver';

const clamp=THREE.MathUtils.clamp,UP=new THREE.Vector3(0,1,0),WHEEL_AXIS=new THREE.Vector3(1,0,0);
export const COCKPIT_NEAR=.03;

/** Fallback seat; inspected source interiors supply their own measured wheel-relative eye. */
export function cockpitSeat(vehicle){
  const g=vehicle.geometryParams||{},skin=vehicle.nozzleFit?.skinBounds;
  const width=clamp(g.bodyWidth||1.9,1.2,3),length=clamp(g.bodyLength||4.6,2.5,9);
  const top=skin?.max?.y??((g.bodyCenterY||.2)+(g.bodyHeight||1.25)/2);
  return {width,length,pitch:-.075,eye:new THREE.Vector3(clamp((g.wheelbase||2.8)*.025,-.2,.24),clamp(top-.20,.40,2.3),-width*.23)};
}

export function cockpitPose(bodyPosition,bodyQuaternion,seat,yaw=0,pitch=0){
  yaw=clamp(yaw,-1.55,1.55);pitch=clamp(pitch,-.62,.45);
  const eye=seat.eye.clone().applyQuaternion(bodyQuaternion).add(bodyPosition);
  const direction=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw)).applyQuaternion(bodyQuaternion);
  const up=UP.clone().applyQuaternion(bodyQuaternion);
  return {eye,direction,up,target:eye.clone().addScaledVector(direction,30)};
}

export class CockpitView {
  constructor(){
    this.root=new THREE.Group();this.root.name='vehicle driver interior';this.root.visible=false;
    this.yaw=0;this.pitch=0;this.lookYaw=0;this.lookPitch=0;this.fov=65;this.turnLook=0;this.vehicle=null;
    this.mirrorTexture=null;this.forward=new THREE.Vector3();
  }
  recenter(){this.yaw=this.pitch=this.lookYaw=this.lookPitch=this.turnLook=0;this.fov=65;}
  look(dx,dy){this.yaw=clamp(this.yaw-dx*.0032,-1.55,1.55);this.pitch=clamp(this.pitch-dy*.0026,-.62,.45);}
  zoom(delta){this.fov=clamp(this.fov+delta*.025,50,80);}
  setVehicle(vehicle){
    if(this.vehicle===vehicle)return;
    this.releaseGeometry();this.vehicle=vehicle;this.recenter();
    const source=createSourceCockpit(vehicle);
    this.seat=source?.seat||cockpitSeat(vehicle);
    this.interior=source||createReferenceCockpit(vehicle,this.seat);
    if(!source)this.interior.root.position.copy(this.seat.eye);
    this.root.add(this.interior.root);this.root.userData.fidelity=source?'original-model-interior':'reference-reconstruction';
    this.steering=this.interior.steering;
    const axis=this.interior.steeringAxis;
    this.steeringAxis=axis?.isVector3?axis:WHEEL_AXIS;
    this.mirrorSurface=this.interior.mirrorSurface||this.interior.mirrorAnchor?.mirrorSurface||null;
    this.setMirrorTexture(this.mirrorTexture);
    this.lastPaint=null;
  }
  setPaint(color){
    if(!color||color===this.lastPaint)return;
    for(const material of this.interior?.paintMaterials||[])material.color.set(color);
    this.lastPaint=color;
  }
  setMirrorTexture(texture){
    this.mirrorTexture=texture;
    if(this.mirrorSurface&&texture){this.mirrorSurface.material.map=texture;this.mirrorSurface.material.color.setHex(0xffffff);this.mirrorSurface.material.needsUpdate=true;}
  }
  update(camera,view,dt,telemetry={}){
    if(!this.vehicle)return;
    const p=view.bodyPosition||view.state.pos,q=view.state.q,v=view.state.vel;
    this.root.position.copy(p);this.root.quaternion.copy(q);
    const blend=1-Math.exp(-18*Math.max(0,dt));this.lookYaw=THREE.MathUtils.lerp(this.lookYaw,this.yaw,blend);this.lookPitch=THREE.MathUtils.lerp(this.lookPitch,this.pitch,blend);
    this.forward.set(1,0,0).applyQuaternion(q);
    const signed=v.dot(this.forward),speed=Math.hypot(v.x,v.z)*3.6;
    const steer=((view.wheels?.[0]?.steer||0)+(view.wheels?.[1]?.steer||0))/2;
    // Follow the first few metres of the intended path on a grounded turn.
    // Yield to the driver's manual look; keep the eye fixed at the seat.
    const manualWeight=1-clamp(Math.max(Math.abs(this.yaw),Math.abs(this.pitch))/.25,0,1);
    const turnTarget=telemetry.contactCount>0?clamp(steer*.55,-.085,.085)*clamp(signed/8,0,1)*manualWeight:0;
    this.turnLook=THREE.MathUtils.lerp(this.turnLook,turnTarget,1-Math.exp(-6*Math.max(0,dt)));
    const pose=cockpitPose(p,q,this.seat,this.lookYaw+this.turnLook,this.lookPitch+(this.seat.pitch||0));
    camera.position.copy(pose.eye);camera.up.copy(pose.up);camera.lookAt(pose.target);
    // Keep a usable horizontal view on phones and avoid fisheye stretch on
    // a wide monitor. The wheel adjusts the baseline angle in every format.
    const aspectScale=clamp(1/Math.max(.1,camera.aspect),.86,1.26);
    const verticalFov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(this.fov/2))*aspectScale));
    if(camera.near!==COCKPIT_NEAR||Math.abs(camera.fov-verticalFov)>1e-6){
      camera.near=COCKPIT_NEAR;camera.fov=verticalFov;camera.updateProjectionMatrix();
    }
    this.steering?.quaternion.setFromAxisAngle(this.steeringAxis,-clamp(steer*14,-Math.PI*2.4,Math.PI*2.4));

    this.interior.update?.({speed,gear:signed<-.3?'R':speed>1?'D':'N',height:telemetry.heightAboveSurface??telemetry.altitude??0,powerKW:(telemetry.electricPowerW||0)/1000,gasFraction:clamp((telemetry.gasPct??100)/100,0,1)});
    return pose;
  }
  releaseGeometry(){
    // Source cabins own only cloned materials. Their artist geometry/textures
    // remain with the three-car exterior cache and must never be disposed here.
    this.interior?.dispose();this.interior=null;this.root.clear();this.steering=null;this.mirrorSurface=null;
  }
  dispose(){this.root.removeFromParent();this.releaseGeometry();this.vehicle=null;this.mirrorTexture=null;}
}
