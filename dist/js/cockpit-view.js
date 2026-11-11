import * as THREE from 'three';

const clamp=THREE.MathUtils.clamp,UP=new THREE.Vector3(0,1,0);
export const COCKPIT_NEAR=.03;

/** Shared virtual interior: model-relative seat, not an OEM cabin measurement. */
export function cockpitSeat(vehicle){
  const g=vehicle.geometryParams||{},skin=vehicle.nozzleFit?.skinBounds;
  const width=clamp(g.bodyWidth||1.9,1.2,3),length=clamp(g.bodyLength||4.6,2.5,9);
  const top=skin?.max?.y??((g.bodyCenterY||.2)+(g.bodyHeight||1.25)/2);
  return {width,length,eye:new THREE.Vector3(clamp((g.wheelbase||2.8)*.025,-.2,.24),clamp(top-.20,.40,2.3),-width*.23)};
}

export function cockpitPose(bodyPosition,bodyQuaternion,seat,yaw=0,pitch=0){
  yaw=clamp(yaw,-1.55,1.55);pitch=clamp(pitch,-.62,.45);
  const eye=seat.eye.clone().applyQuaternion(bodyQuaternion).add(bodyPosition);
  const direction=new THREE.Vector3(Math.cos(pitch)*Math.cos(yaw),Math.sin(pitch),-Math.cos(pitch)*Math.sin(yaw)).applyQuaternion(bodyQuaternion);
  const up=UP.clone().applyQuaternion(bodyQuaternion);
  return {eye,direction,up,target:eye.clone().addScaledVector(direction,30)};
}

function bar(a,b,r,material,parent){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from);
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,d.normalize());parent.add(mesh);return mesh;
}

export class CockpitView {
  constructor(){
    this.root=new THREE.Group();this.root.name='shared virtual driver cockpit';this.root.visible=false;
    this.yaw=0;this.pitch=0;this.lookYaw=0;this.lookPitch=0;this.fov=65;this.vehicle=null;
  }
  recenter(){this.yaw=this.pitch=this.lookYaw=this.lookPitch=0;this.fov=65;}
  look(dx,dy){this.yaw=clamp(this.yaw-dx*.0032,-1.55,1.55);this.pitch=clamp(this.pitch-dy*.0026,-.62,.45);}
  zoom(delta){this.fov=clamp(this.fov+delta*.025,50,80);}
  setVehicle(vehicle){
    if(this.vehicle===vehicle)return;
    this.releaseGeometry();this.vehicle=vehicle;this.seat=cockpitSeat(vehicle);this.recenter();
    const width=this.seat.width*.84,left=-width*.5-this.seat.eye.z,right=width*.5-this.seat.eye.z;
    const black=new THREE.MeshStandardMaterial({color:0x12191d,roughness:.92,metalness:.04});
    const trim=new THREE.MeshStandardMaterial({color:0x293238,roughness:.55,metalness:.45});
    const stitch=new THREE.MeshStandardMaterial({color:0x6b767a,roughness:.62});
    this.paint=new THREE.MeshStandardMaterial({color:0xb51627,roughness:.3,metalness:.6});
    const box=(size,pos,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.receiveShadow=true;this.root.add(m);return m;};
    box([.66,.29,width],[.83,-.49,-this.seat.eye.z],black);
    box([.02,.014,width*.94],[.515,-.345,-this.seat.eye.z],stitch);
    // The windshield opening, A-pillars and doors stay fixed to the body while looking around.
    bar([.28,.49,left-.03],[1.18,-.26,left+.09],.038,black,this.root);
    bar([.28,.49,right+.03],[1.18,-.26,right-.09],.038,black,this.root);
    bar([.28,.49,left-.03],[.28,.49,right+.03],.044,black,this.root);
    for(const z of [left-.08,right+.08]){
      box([1.8,.28,.09],[0,-.48,z],black);
      box([.48,.026,.035],[.05,-.28,z-Math.sign(z)*.045],trim);
    }
    const hoodLength=clamp(this.seat.length*.25,.75,1.7);
    const hood=box([hoodLength,.055,width*1.06],[1.2+hoodLength*.48,-.56,-this.seat.eye.z],this.paint);hood.rotation.z=-.035;
    for(const z of [-.3,.56])for(let i=0;i<5;i++)box([.012,.055,.012],[.49,-.335,z+i*.035],trim);
    this.steering=new THREE.Group();this.steering.name='driver steering wheel';this.steering.position.set(.62,-.40,0);this.root.add(this.steering);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.184,.019,10,48),black);wheel.rotation.y=-Math.PI/2;this.steering.add(wheel);
    for(const angle of [0,Math.PI*2/3,Math.PI*4/3])bar([0,0,0],[0,Math.sin(angle)*.167,Math.cos(angle)*.167],.011,trim,this.steering);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.062,.064,.035,18),black);hub.rotation.z=Math.PI/2;this.steering.add(hub);
    bar([.65,-.42,0],[.85,-.49,0],.024,black,this.root);
    const screenMat=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});
    if(typeof document!=='undefined'){
      this.canvas=document.createElement('canvas');this.canvas.width=512;this.canvas.height=192;this.ctx=this.canvas.getContext('2d');
      this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;screenMat.map=this.texture;
    }else screenMat.color.setHex(0x091317);
    box([.025,.16,.38],[.79,-.14,0],trim);
    bar([.81,-.21,0],[.81,-.36,0],.025,black,this.root);
    const display=new THREE.Mesh(new THREE.PlaneGeometry(.35,.132),screenMat);display.rotation.y=-Math.PI/2;display.position.set(.77,-.14,0);this.root.add(display);
    this.lastDisplay='';this.updateDisplay(0,'N',0);
  }
  updateDisplay(speed,gear,height){
    const key=Math.round(speed)+'|'+gear+'|'+height.toFixed(1);if(key===this.lastDisplay||!this.ctx)return;this.lastDisplay=key;
    const c=this.ctx;c.fillStyle='#071116';c.fillRect(0,0,512,192);c.fillStyle='#76e0cb';c.fillRect(28,22,456,3);
    c.font='500 18px sans-serif';c.fillStyle='#7b959e';c.fillText('ROADSTER  /  DRIVE',28,52);
    c.font='600 83px sans-serif';c.fillStyle='#edf5f3';c.fillText(String(Math.round(speed)),28,134);
    c.font='23px sans-serif';c.fillStyle='#9eafb4';c.fillText('km/h',205,130);
    c.font='500 58px sans-serif';c.fillStyle='#86e3ce';c.fillText(gear,414,128);
    c.font='17px sans-serif';c.fillStyle='#9eafb4';c.fillText('HEIGHT  '+height.toFixed(1)+' m',28,169);
    this.texture.needsUpdate=true;
  }
  update(camera,view,dt,telemetry={}){
    if(!this.vehicle)return;
    const p=view.bodyPosition||view.state.pos,q=view.state.q,v=view.state.vel;
    this.root.position.copy(this.seat.eye).applyQuaternion(q).add(p);this.root.quaternion.copy(q);
    const blend=1-Math.exp(-18*Math.max(0,dt));this.lookYaw=THREE.MathUtils.lerp(this.lookYaw,this.yaw,blend);this.lookPitch=THREE.MathUtils.lerp(this.lookPitch,this.pitch,blend);
    const pose=cockpitPose(p,q,this.seat,this.lookYaw,this.lookPitch);
    camera.position.copy(pose.eye);camera.up.copy(pose.up);camera.lookAt(pose.target);camera.near=COCKPIT_NEAR;camera.fov=this.fov;camera.updateProjectionMatrix();
    const steer=((view.wheels?.[0]?.steer||0)+(view.wheels?.[1]?.steer||0))/2;
    this.steering.rotation.x=-clamp(steer*14,-Math.PI*2.4,Math.PI*2.4);
    const forward=new THREE.Vector3(1,0,0).applyQuaternion(q),signed=v.dot(forward),speed=Math.hypot(v.x,v.z)*3.6;
    this.updateDisplay(speed,signed<-.3?'R':speed>1?'D':'N',telemetry.altitude||0);
    return pose;
  }
  releaseGeometry(){
    const geometries=new Set(),materials=new Set();this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.texture?.dispose();this.texture=null;this.canvas=null;this.ctx=null;this.root.clear();
  }
  dispose(){this.root.removeFromParent();this.releaseGeometry();this.vehicle=null;}
}
