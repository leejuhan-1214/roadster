import * as THREE from 'three';
export function tireSlipIntensity(w,lateral,speed){return w.load>100&&speed>2?Math.min(1,Math.max(0,(Math.abs(w.slip||0)-.12)*2,(Math.abs(lateral)-.7)/4)):0;}
export class TireEffects {
 constructor(scene){
  this.lastTime=null;this.previous=[];this.next=0;this.smokeNext=0;this.particles=Array.from({length:160},()=>({life:0,pos:new THREE.Vector3(),vel:new THREE.Vector3(),strength:0}));
  const plane=new THREE.PlaneGeometry(1,.22);plane.rotateX(-Math.PI/2);
  this.marks=new THREE.InstancedMesh(plane,new THREE.MeshBasicMaterial({color:0x161616,transparent:true,opacity:.52,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}),1600);this.marks.count=0;this.marks.frustumCulled=false;this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(this.marks);
  this.geometry=new THREE.BufferGeometry();for(const [name,size]of [['position',3],['opacity',1],['size',1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(160*size),size));
  this.smoke=new THREE.Points(this.geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{scale:{value:500}},vertexShader:'attribute float opacity;attribute float size;varying float a;uniform float scale;void main(){a=opacity;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*scale/max(1.,-p.z),1.,110.);}',fragmentShader:'varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;float soft=exp(-d*d*4.)*(1.-smoothstep(.65,1.,d));gl_FragColor=vec4(.72,.74,.75,a*soft);}' }));this.smoke.frustumCulled=false;scene.add(this.smoke);this.dummy=new THREE.Object3D();
 }
 reset(){this.emission=[];this.previous=[];this.next=0;this.marks.count=0;for(const p of this.particles)p.life=0;this.geometry.attributes.opacity.array.fill(0);this.geometry.attributes.opacity.needsUpdate=true;}
 update(sim,view,enabled){
  const time=sim.state.time;if(this.lastTime===null||time<this.lastTime||enabled!==this.enabled)this.reset();const dt=Math.min(.1,Math.max(0,time-(this.lastTime??time)));this.lastTime=time;this.enabled=enabled;this.marks.visible=this.smoke.visible=enabled;if(!enabled||!dt)return;
  const speed=Math.hypot(sim.state.vel.x,sim.state.vel.z),worldOmega=sim.state.omega.clone().applyQuaternion(sim.state.q);
  for(let i=0;i<sim.wheels.length;i++){
   const w=sim.wheels[i],rw=view.wheels[i],lever=w.pos.clone().applyQuaternion(sim.state.q),v=sim.state.vel.clone().add(new THREE.Vector3().crossVectors(worldOmega,lever));const side=new THREE.Vector3(Math.sin(w.steer),0,Math.cos(w.steer)).applyQuaternion(sim.state.q);const intensity=tireSlipIntensity(w,v.dot(side),speed);
   const pos=rw.pos.clone();pos.y+=rw.compression||0;pos.applyQuaternion(view.state.q).add(view.state.pos);pos.y=Math.max(.045,(w.surfaceY||0)+.018);
   const old=this.previous[i];if(intensity>0&&old){const distance=Math.hypot(pos.x-old.x,pos.z-old.z);if(distance>.035&&distance<3){this.dummy.position.copy(old).lerp(pos,.5);this.dummy.rotation.set(0,Math.atan2(-(pos.z-old.z),pos.x-old.x),0);this.dummy.scale.set(distance+.003,1,.8+.2*intensity);this.dummy.updateMatrix();this.marks.setMatrixAt(this.next++%1600,this.dummy.matrix);this.marks.count=Math.min(1600,this.next);this.marks.instanceMatrix.needsUpdate=true;}}
   this.previous[i]=intensity>0?pos:null;
   this.emission??=[];this.emission[i]=(this.emission[i]||0)+intensity*dt*28;if(!intensity)this.emission[i]=0;
   while(this.emission[i]>=1){this.emission[i]--;const p=this.particles[this.smokeNext++%160];p.pos.copy(pos);p.pos.y+=.12;p.vel.set(sim.state.vel.x*.08,.45+intensity*.4,sim.state.vel.z*.08);p.life=1.5;p.strength=intensity;}
  }
  const a=this.geometry.attributes;for(let i=0;i<160;i++){const p=this.particles[i];p.life=Math.max(0,p.life-dt);p.pos.addScaledVector(p.vel,dt);const age=1.5-p.life;a.position.setXYZ(i,p.pos.x,p.pos.y,p.pos.z);a.opacity.setX(i,p.life/1.5*p.strength*.42*Math.min(1,age*10));a.size.setX(i,.28+age*.9);}
  for(const a of Object.values(this.geometry.attributes))a.needsUpdate=true;
 }
}
