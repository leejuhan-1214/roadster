import * as THREE from 'three';
import {grandPrixSeat,isOpenGrandPrix} from './grand-prix-cockpit.js?v=20261122-garage';
import {createSourceCockpit} from './source-cockpit.js?v=20261122-garage';
import {createReferenceCockpit} from './reference-cockpit.js?v=20261122-garage';

const clamp=THREE.MathUtils.clamp,UP=new THREE.Vector3(0,1,0),WHEEL_AXIS=new THREE.Vector3(1,0,0);
export const COCKPIT_NEAR=.03;

/** Fallback seat; inspected source interiors supply their own measured wheel-relative eye. */
export function cockpitSeat(vehicle){
  const g=vehicle.geometryParams||{},skin=vehicle.nozzleFit?.skinBounds;
  const width=clamp(g.bodyWidth||1.9,1.2,3),length=clamp(g.bodyLength||4.6,2.5,9);
  if(isOpenGrandPrix(vehicle))return grandPrixSeat(vehicle,width,length);
  const top=skin?.max?.y??((g.bodyCenterY||.2)+(g.bodyHeight||1.25)/2);
  // Heights are in chassis coordinates. A fixed floor puts the eye above the
  // roof on low coupes; leave headroom relative to this car's measured roof.
  let eyeHeight=Math.min(top-.20,2.3);
  // The BRZ exhibition shell carries a long roof antenna. Fit the driver's
  // sightline to its curved windshield, whose vertices are in chassis space.
  if(vehicle.profileId==='subaru-brz'){
    const pane=vehicle.root.getObjectByName('BRZ_windshield')?.geometry?.boundingBox;
    if(pane)eyeHeight=THREE.MathUtils.lerp(pane.min.y,pane.max.y,.64);
  }
  return {width,length,pitch:-.12,eye:new THREE.Vector3(clamp((g.wheelbase||2.8)*.025,-.2,.24),eyeHeight,-width*.23)};
}

export function cockpitPose(bodyPosition,bodyQuaternion,seat,yaw=0,pitch=0){
  yaw=clamp(yaw,-1.55,1.55);pitch=clamp(pitch,-.62,.45);
  const eye=seat.eye.clone().applyQuaternion(bodyQuaternion).add(bodyPosition);
  const direction=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw)).applyQuaternion(bodyQuaternion);
  const up=UP.clone().applyQuaternion(bodyQuaternion);
  return {eye,direction,up,target:eye.clone().addScaledVector(direction,30)};
}

function mirrorOptics(surface,body,eye){
  if(!surface)return null;
  const basis=surface.userData.mirrorBasis;
  // Authored mirror UVs are calibrated to this fitted glass rectangle.
  // Reference mirrors are planes below their respective roof mounts.
  const width=basis?.size.x??surface.geometry.parameters?.width;
  const height=basis?.size.y??surface.geometry.parameters?.height;
  if(!(width>0&&height>0))return null;
  const center=basis?.position||body.worldToLocal(surface.getWorldPosition(new THREE.Vector3()));
  const distance=eye.distanceTo(center);
  if(distance<.05)return null;
  // A plane mirror adjusted to view straight back places its virtual viewer
  // one eye-to-glass distance forward of the glass. The glass then crops
  // that rearward projection to its own angular size.
  return {
    eye:center.clone().addScaledVector(WHEEL_AXIS,distance),
    aspect:width/height,
    fov:THREE.MathUtils.radToDeg(2*Math.atan(height/(2*distance))),
  };
}

export class CockpitView {
  constructor(){
    this.root=new THREE.Group();this.root.name='vehicle driver interior';this.root.visible=false;
    this.yaw=0;this.pitch=0;this.lookYaw=0;this.lookPitch=0;this.fov=65;this.turnLook=0;this.vehicle=null;
    this.mirrorTexture=null;this.forward=new THREE.Vector3();
  }
  recenter(){this.yaw=this.pitch=this.lookYaw=this.lookPitch=this.turnLook=0;this.fov=this.seat?.fov??65;}
  look(dx,dy){this.yaw=clamp(this.yaw-dx*.0032,-1.55,1.55);this.pitch=clamp(this.pitch-dy*.0026,-.62,.45);}
  zoom(delta){this.fov=clamp(this.fov+delta*.025,50,80);}
  setVehicle(vehicle){
    if(this.vehicle===vehicle)return;
    this.releaseGeometry();this.vehicle=vehicle;
    const source=createSourceCockpit(vehicle);
    this.seat=source?.seat||cockpitSeat(vehicle);
    this.recenter();
    this.interior=source||createReferenceCockpit(vehicle,this.seat);
    if(!source&&!this.interior.bodyCoordinates)this.interior.root.position.copy(this.seat.eye);
    this.root.add(this.interior.root);this.root.userData.fidelity=this.interior.kind==='source'?'original-model-interior':'reference-reconstruction';
    this.steering=this.interior.steering;
    const axis=this.interior.steeringAxis;
    this.steeringAxis=axis?.isVector3?axis:WHEEL_AXIS;
    this.mirrorSurface=this.interior.mirrorSurface||this.interior.mirrorAnchor?.mirrorSurface||null;
    this.mirrorOptics=mirrorOptics(this.mirrorSurface,this.root,this.seat.eye);
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
    // A landscape display must retain the vertical span of the dashboard;
    // squeezing it to a narrow lens cropped the Roadster yoke below the frame.
    const aspectScale=clamp(1/Math.max(.1,camera.aspect),.96,1.26);
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
    this.interior?.dispose();this.interior=null;this.root.clear();this.steering=null;this.mirrorSurface=null;this.mirrorOptics=null;
  }
  dispose(){this.root.removeFromParent();this.releaseGeometry();this.vehicle=null;this.mirrorTexture=null;}
}
