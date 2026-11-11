import {SimulationVisualClock} from './simulation-visual-clock.js?v=20261111-calibration1';
import {CockpitView} from './cockpit-view.js?v=20261111-paint1';
import {LandingVisual,landingRulerWindow} from './landing-visual.js?v=20261111-science1';
import {CockpitMirror} from './cockpit-mirror.js?v=20261111-interior1';
import {TireEffects} from './tire-effects.js?v=20261109-smoke1';
import {prepareAssessmentVehicle} from './assessment-vehicle.js?v=20261111-drivefix1';
import {loadCityWorld} from './city-world.js?v=20261111-trees2';
import {attachStreamingCity} from './city-streaming.js?v=20261111-trees2';
import {loadStreetOverlay} from './city-street-overlay.js?v=20261111-street1';
import {updateTreeWind} from './city-trees.js?v=20261111-trees2';
import {loadRealSky} from './sky-environment.js?v=20261109-real1';
import {applyCitySurfaces} from './city-surfaces.js?v=20261109-real1';
import * as THREE from 'three';
import {sampleRoadSurface} from './road-surface.js?v=20261107-drive2';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVehicle } from './vehicle.js?v=20261107-drive2';
import {loadRealVehicle,disposeVehicle} from './real-vehicle-model.js?v=20261111-drivefix1';
import {configureVehicleFit,updateVehicleExplosion,updateNozzleCovers} from './vehicle-fit.js?v=20261111-cockpit1';
import { loadRoadsterVehicle } from './roadster-model.js?v=20261107-drive2';
import { createStageVisual, updateStageVisual, disposeStageVisual } from './stage-visual.js?v=20261107-drive2';
import {FACILITY_SOLIDS} from './world-obstacles.js?v=20261107-drive2';
import {renderPixelRatio,RenderBudget} from './render-quality.js?v=20261107-drive2';
import {batchStaticEnvironment} from './static-batch.js?v=20261107-drive2';
import {createEnvironmentMaterials,surfaceUV} from './environment-materials.js?v=20261107-fleet1';

// Visual coordinates use the physics convention: +X nose, +Y up, +Z right.
// This renderer only reads simulation state. Plumes and marks never exert forces.
const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
const tempObj = new THREE.Object3D();
const clamp = THREE.MathUtils.clamp;
// Parts detach in a readable sequence. Each pair is [start, fully separated].
export const EXPLODE_STAGES = Object.freeze({
  'wheel-fl':[0,.32],'wheel-fr':[0,.32],'wheel-rl':[.04,.36],'wheel-rr':[.04,.36],
  body:[.12,.5],cabin:[.22,.64],wing:[.24,.65],tank:[.38,.78],
  'drive-front':[.48,.94],'drive-rear-left':[.48,.94],'drive-rear-right':[.48,.94],'power-electronics':[.44,.9],
  battery:[.47,.88],suspension:[.56,.96],thrusters:[.66,1]
});
export function partExplodeProgress(id,progress) {
  const [start,end]=EXPLODE_STAGES[id]||[0,1];
  const t=clamp((progress-start)/(end-start),0,1);return t*t*(3-2*t);
}

export function isObjectVisible(object) {
  for(let node=object;node;node=node.parent)if(!node.visible)return false;
  return true;
}
export function updateDetailExplosion(vehicle,progress) {
  for(const [id,part] of vehicle.detailParts||[]) {
    if(vehicle.parts.get(id)===part)continue; // Hypotheses are existing assembly groups.
    const {basePosition,explodeOffset,explodeStage=[0,1]}=part.userData;
    if(!basePosition||!explodeOffset)continue;
    const [start,end]=explodeStage,t=clamp((progress-start)/(end-start),0,1);
    part.position.copy(basePosition).addScaledVector(explodeOffset,t*t*(3-2*t));
  }
}

function canvasTexture(draw, width=1024, height=1024) {
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  draw(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}
function mesh(geo,mat,x=0,y=0,z=0,parent) {
  if(mat.userData.tileMetres)surfaceUV(geo,mat.userData.tileMetres);
  const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true;m.receiveShadow=true;
  if(parent)parent.add(m); return m;
}
function line(points, color=0x536a70, opacity=1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));
}
function ring(radius,width,color,opacity=1) {
  const m=new THREE.Mesh(new THREE.RingGeometry(radius-width/2,radius+width/2,128),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:false}));
  m.rotation.x=-Math.PI/2; return m;
}
function label(text,{width=9,height=1,color='#e6eceb',bg=null,font='600',size=90}={}) {
  const tx=canvasTexture((ctx,w,h)=>{ctx.clearRect(0,0,w,h); if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${font} ${size}px sans-serif`;ctx.fillText(text,w/2,h/2);},1024,128);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:tx,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  return m;
}

// Fit the complete 3D envelope in the usable inspector viewport, retaining its
// current orbit direction instead of flattening the assembly into a front board.
export function inspectionDistance(box,direction,fov,aspect,availableWidth=1){
  const center=box.getCenter(new THREE.Vector3()),right=new THREE.Vector3().crossVectors(UP,direction).normalize();
  if(right.lengthSq()<.01)right.set(1,0,0);
  const up=new THREE.Vector3().crossVectors(direction,right).normalize();
  const tanY=Math.tan(THREE.MathUtils.degToRad(fov)/2)*.78,tanX=tanY*aspect*availableWidth;
  let distance=3;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=new THREE.Vector3(x,y,z).sub(center),near=point.dot(direction);
    distance=Math.max(distance,near+Math.abs(point.dot(right))/tanX,near+Math.abs(point.dot(up))/tanY);
  }return distance+.25;
}

export class FlightScene {
  constructor(canvas,onPartSelect=()=>{},onInspectExplode=()=>{},onCameraChange=()=>{}) {
    this.canvas=canvas;this.onPartSelect=onPartSelect;this.mode='drive';this.cameraName='chase';this.elapsed=0;this.lastPaint='';
    this.onInspectExplode=onInspectExplode;this.onCameraChange=onCameraChange;this.physicsVisualClock=new SimulationVisualClock();this.jetEmissionCarry=[];
    this.explodeTarget=0;this.explodeProgress=0;this.hiddenParts=new Set();this.isolatedPartId=null;this.showHypotheses=true;this.touchPointers=new Map();this.pinchDistance=0;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
    this.renderBudget=new RenderBudget();this.quality='smooth';this.renderer.shadowMap.enabled=false;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.shadowElapsed=1;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2(0xb6c4c9,0.0025);
    this.camera=new THREE.PerspectiveCamera(43,1,.08,1500);this.camera.position.set(7.7,3.8,7.5);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.08;
    this.controls.minDistance=3;this.controls.maxDistance=55;this.controls.maxPolarAngle=Math.PI*.485;
    this.controls.target.set(0,.65,0);this.controls.enabled=true;this.controls.enablePan=false;
    this.cameraTarget=new THREE.Vector3(0,.65,0);this.cameraPosition=this.camera.position.clone();
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.clickStart=null;
    this._onDown=e=>{
      this.clickStart=[e.clientX,e.clientY];
      if(this.mode==='city'&&this.cameraName==='hood'){
        this.cockpitDrag={id:e.pointerId,x:e.clientX,y:e.clientY};this.controls.enabled=false;
        this.canvas.focus?.({preventScroll:true});this.canvas.setPointerCapture?.(e.pointerId);e.preventDefault();e.stopImmediatePropagation();return;
      }
      // Arm OrbitControls on pointer-down so the first city drag works. A click
      // only focuses the canvas; switching from chase waits for actual movement.
      if(this.mode==='city'&&this.cameraName!=='orbit'){this.cityOrbitPending=true;this.controls.enabled=true;}
      if(this.mode!=='inspect'&&this.mode!=='city'&&this.cameraName!=='orbit'){this.setCamera('orbit');this.onCameraChange('orbit');}
      if(e.pointerType==='touch'){
        this.touchPointers.set(e.pointerId,new THREE.Vector2(e.clientX,e.clientY));
        if(this.touchPointers.size===2){const [a,b]=this.touchPointers.values();this.pinchDistance=a.distanceTo(b);this.clickStart=null;}
      }
    };
    this._onMove=e=>{
      if(this.cockpitDrag?.id===e.pointerId){
        this.cockpit.look(e.clientX-this.cockpitDrag.x,e.clientY-this.cockpitDrag.y);this.cockpitDrag.x=e.clientX;this.cockpitDrag.y=e.clientY;
        e.preventDefault();e.stopImmediatePropagation();return;
      }
      if(this.cityOrbitPending&&this.clickStart&&Math.hypot(e.clientX-this.clickStart[0],e.clientY-this.clickStart[1])>4){this.cityOrbitPending=false;this.setCamera('orbit');this.onCameraChange('orbit');}
      if(!this.touchPointers.has(e.pointerId))return;
      this.touchPointers.get(e.pointerId).set(e.clientX,e.clientY);
      if(this.mode==='inspect'&&this.touchPointers.size===2){
        const [a,b]=this.touchPointers.values(),distance=a.distanceTo(b);
        if(this.pinchDistance>0)this.setExplode(this.explodeTarget+Math.log(Math.max(1,distance)/Math.max(1,this.pinchDistance))*.85,true);
        this.pinchDistance=distance;this.clickStart=null;e.preventDefault();e.stopImmediatePropagation();
      }
    };
    this._onWheel=e=>{
      if(this.mode==='city'&&this.cameraName==='hood'){e.preventDefault();e.stopImmediatePropagation();this.cockpit.zoom(e.deltaY*(e.deltaMode===1?16:1));return;}
      if(this.mode==='inspect'){
        e.preventDefault();e.stopImmediatePropagation();
        const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.canvas.clientHeight:1);
        this.setExplode(this.explodeTarget-clamp(pixels,-160,160)*.0015,true);
      }else if(this.cameraName!=='orbit'){this.setCamera('orbit');this.onCameraChange('orbit');}
    };
    this._onCancel=e=>{this.cockpitDrag=null;this.touchPointers.delete(e.pointerId);this.pinchDistance=0;this.clickStart=null;this.cityOrbitPending=false;this.controls.enabled=this.cameraName==='orbit';};
    this._onUp=e=>{
      if(this.cockpitDrag?.id===e.pointerId){this.cockpitDrag=null;this.clickStart=null;e.preventDefault();e.stopImmediatePropagation();return;}
      if(this.cityOrbitPending){this.cityOrbitPending=false;this.controls.enabled=this.cameraName==='orbit';}
      this.touchPointers.delete(e.pointerId);this.pinchDistance=0;
      if(this.mode!=='inspect'||!this.clickStart||Math.hypot(e.clientX-this.clickStart[0],e.clientY-this.clickStart[1])>6)return;
      const r=canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObject(this.vehicle.root,true).find(v=>isObjectVisible(v.object));
      if(hit){let o=hit.object;while(o&&!o.userData.partId)o=o.parent;if(o){this.focusPart(o.userData.partId);this.onPartSelect(o.userData.partId);}}
    };
    this._onDoubleClick=e=>{if(this.mode==='city'&&this.cameraName==='hood'){this.cockpit.recenter();e.preventDefault();}};
    this._onBlur=()=>{this.cockpitDrag=null;this.cityOrbitPending=false;this.controls.enabled=this.cameraName==='orbit';};
    canvas.addEventListener('dblclick',this._onDoubleClick);window.addEventListener('blur',this._onBlur);
    canvas.addEventListener('pointerdown',this._onDown,true);canvas.addEventListener('pointerup',this._onUp,true);
    canvas.addEventListener('pointermove',this._onMove,{capture:true,passive:false});canvas.addEventListener('pointercancel',this._onCancel,true);
    canvas.addEventListener('wheel',this._onWheel,{capture:true,passive:false});
    this.tireEffects=new TireEffects(this.scene);
    this.createEnvironment();this.roadRelief.userData.dynamicGeometry=true;this.environmentDrawsSaved=batchStaticEnvironment(this.scene);
    this.inspectionOccluders=this.scene.children.filter(o=>o!==this.sky&&!o.isLight&&o!==this.sun.target&&o!==this.groundSurface&&o!==this.roadRelief&&o!==this.contactShadow);
    this.labEnvironment=this.scene.children.filter(o=>o!==this.sky&&!o.isLight&&o!==this.sun.target&&o!==this.contactShadow);
    this.skyReady=loadRealSky(this.scene,this.renderer).then(sky=>{
      this.realSky=sky;this.sky.visible=false;this.sunDirection=sky.sunDirection;
      this.sun.intensity=2.2;
      for(const light of this.scene.children)if(light.isHemisphereLight)light.intensity=.5;
    }).catch(error=>{console.warn('실사 하늘 로드 실패 · 기본 하늘 유지',error);});
    this.vehicle=createVehicle();this.scene.add(this.vehicle.root);
    this.cockpit=new CockpitView();this.cockpitMirror=new CockpitMirror();this.cockpit.setMirrorTexture(this.cockpitMirror.texture);this.scene.add(this.cockpit.root);
    this.selectedBox=new THREE.BoxHelper(this.vehicle.root,0x64ebd7);this.selectedBox.visible=false;this.selectedBox.material.transparent=true;this.selectedBox.material.opacity=.55;this.scene.add(this.selectedBox);
    this.createParticles();this.jets=[];this.forceArrows=[];this.lastMark=new THREE.Vector3(999,999,999);this.createMarks();
    this.gravityArrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),1.5,0xff9478,.18,.1);this.scene.add(this.gravityArrow);
    this.fanArrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),1,0xf6c75f,.18,.1);this.scene.add(this.fanArrow);
    this.contactArrows=Array.from({length:4},()=>{const a=new THREE.ArrowHelper(UP,new THREE.Vector3(),1,0x6bb7ff,.15,.07);this.scene.add(a);return a;});
    this.frictionArrows=Array.from({length:4},()=>{const a=new THREE.ArrowHelper(UP,new THREE.Vector3(),1,0xffb052,.14,.07);a.visible=false;this.scene.add(a);return a;});
    this.landingVisual=new LandingVisual();this.scene.add(this.landingVisual.root);
    this.resize();
  }

  setQuality(quality) {
    this.quality=quality==='detail'?'detail':'smooth';
    this.renderer.shadowMap.enabled=this.mode==='city'||this.mode==='lab'||this.quality==='detail';
    this.renderer.shadowMap.needsUpdate=true;this.resize();
    const materials=new Set();this.scene.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
    for(const m of materials){
      if(m.transmission>0||m.userData.detailTransmission>0){
        m.userData.detailTransmission??=m.transmission;m.userData.detailOpacity??=m.opacity;
        m.transmission=this.quality==='detail'?m.userData.detailTransmission:0;
        m.opacity=this.quality==='detail'?m.userData.detailOpacity:Math.min(m.userData.detailOpacity,.48);
        m.forceSinglePass=this.quality!=='detail';
      }
      m.needsUpdate=true;
    }
  }

  createEnvironment() {
    this.environmentMaterials=createEnvironmentMaterials(this.renderer);
    const pmrem=new THREE.PMREMGenerator(this.renderer);const environment=new RoomEnvironment();
    this.environmentTarget=pmrem.fromScene(environment,.04);this.scene.environment=this.environmentTarget.texture;pmrem.dispose();environment.dispose();
    this.scene.environmentIntensity=.8;
    const sky=new THREE.Mesh(new THREE.SphereGeometry(950,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x5683a6)},bottom:{value:new THREE.Color(0xc3cdcf)}},vertexShader:'varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;void main(){float h=normalize(vPos).y; vec3 c=mix(bottom,top,smoothstep(-.08,.65,h)); float glow=pow(max(0.,dot(normalize(vPos),normalize(vec3(-.7,.15,.6)))),25.);c+=vec3(.25,.19,.12)*glow; gl_FragColor=vec4(c,1.); }'}));
    this.scene.add(sky);this.sky=sky;
    this.scene.add(new THREE.HemisphereLight(0xd9e6f2,0x45413b,1.45));
    this.sun=new THREE.DirectionalLight(0xfff0d8,3.1);this.sun.position.set(-20,34,26);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{near:1,far:150,left:-24,right:24,top:24,bottom:-24});
    this.sun.shadow.bias=-.00025;this.sun.shadow.normalBias=.025;this.scene.add(this.sun,this.sun.target);
    const rim=new THREE.DirectionalLight(0xd0e3f0,.45);rim.position.set(20,8,-25);this.scene.add(rim);
    const ground=mesh(new THREE.PlaneGeometry(1800,1800),this.environmentMaterials.pavement,0,-.026,0,this.scene);ground.rotation.x=-Math.PI/2;ground.castShadow=false;this.groundSurface=ground;
    const grid=new THREE.GridHelper(56,28,0x728589,0x5b7075);grid.position.y=.001;grid.material.transparent=true;grid.material.opacity=.24;grid.material.depthWrite=false;this.scene.add(grid);
    const padRing=ring(25,.11,0x9babaa,.7);padRing.position.y=.006;this.scene.add(padRing);
    const inner=ring(7.5,.045,0xb6d2d0,.38);inner.position.y=.009;this.scene.add(inner);
    for(let k=0;k<4;k++){const p=mesh(new THREE.PlaneGeometry(.11,2.8),new THREE.MeshBasicMaterial({color:0x8de0d3,transparent:true,opacity:.6}),Math.cos(k*Math.PI/2)*7.5,.012,Math.sin(k*Math.PI/2)*7.5,this.scene);p.rotation.x=-Math.PI/2;p.rotation.z=k*Math.PI/2;p.castShadow=false;}
    const arc=ring(2.7,.055,0x77ebd4,.85);arc.position.set(0,.012,0);this.scene.add(arc);
    const padLabel=label('01  /  FLIGHT DECK',{width:8,height:1,color:'#d1ddd9',size:77});padLabel.rotation.x=-Math.PI/2;padLabel.rotation.z=Math.PI/2;padLabel.position.set(-5,.018,0);this.scene.add(padLabel);
    const axisLabel=label('COLD GAS  ·  TEST SECTOR',{width:13,height:1,color:'#a2b6b5',size:64});axisLabel.rotation.x=-Math.PI/2;axisLabel.position.set(0,.018,-12);this.scene.add(axisLabel);
    // Lane paint is visual; the tire ground uses the shared continuous relief function.
    const paint=this.environmentMaterials.lanePaint;
    for(const z of [-8.7,8.7]){let m=mesh(new THREE.PlaneGeometry(235,.085),paint,65,.008,z,this.scene);m.rotation.x=-Math.PI/2;m.castShadow=false;}
    for(let x=27;x<185;x+=8){let m=mesh(new THREE.PlaneGeometry(3.7,.1),paint,x,.012,0,this.scene);m.rotation.x=-Math.PI/2;m.castShadow=false;}
    for(let x=34;x<180;x+=25){const mark=label(String(x).padStart(3,'0'),{width:2.5,height:1,color:'#d7dedb',size:80});mark.rotation.x=-Math.PI/2;mark.rotation.z=-Math.PI/2;mark.position.set(x,.02,6.8);this.scene.add(mark);}
    for(let x=40;x<190;x+=15){for(const z of [-10,10]){mesh(new THREE.BoxGeometry(.22,.16,.3),new THREE.MeshBasicMaterial({color:0x9deada}),x,.08,z,this.scene);}}
    for(const radius of [18,22]){const r=ring(radius,.08,0xbac6bc,.45);r.position.set(65,.018,50);this.scene.add(r);}
    const sk=label('DYNAMICS / 02',{width:12,height:1.4,color:'#bdc9c4',size:80});sk.rotation.x=-Math.PI/2;sk.position.set(65,.02,50);this.scene.add(sk);
    const relief=new THREE.PlaneGeometry(160,100,160,100);relief.rotateX(-Math.PI/2);relief.translate(50,0,0);
    this.roadRelief=new THREE.Mesh(relief,this.environmentMaterials.pavement);this.roadRelief.receiveShadow=true;this.scene.add(this.roadRelief);
    this.createArchitecture();
    const shadowTx=canvasTexture((ctx,w,h)=>{const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'rgba(0,0,0,.5)');g.addColorStop(.45,'rgba(0,0,0,.24)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);},128,128);
    this.contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(6.5,4),new THREE.MeshBasicMaterial({map:shadowTx,transparent:true,depthWrite:false,opacity:.85}));this.contactShadow.rotation.x=-Math.PI/2;this.scene.add(this.contactShadow);
    // Shared contact occlusion keeps fixed structures seated even in smooth mode,
    // where full dynamic shadow rendering is deliberately disabled.
    const grounded=FACILITY_SOLIDS.filter(d=>d.center[1]-d.size[1]/2<.05);
    const fixedShadow=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:shadowTx,transparent:true,depthWrite:false,opacity:.6}),grounded.length);
    for(let i=0;i<grounded.length;i++){const d=grounded[i];tempObj.position.set(d.center[0]-.2,.008,d.center[2]+.2);tempObj.rotation.set(-Math.PI/2,0,0);tempObj.scale.set(d.size[0]+1.4,d.size[2]+1.4,1);tempObj.updateMatrix();fixedShadow.setMatrixAt(i,tempObj.matrix);}
    tempObj.scale.set(1,1,1);tempObj.rotation.set(0,0,0);this.scene.add(fixedShadow);
  }

  createArchitecture() {
    const dark=this.environmentMaterials.painted;
    const concrete=this.environmentMaterials.concrete;
    const aluminum=this.environmentMaterials.aluminum;
    const glow=new THREE.MeshBasicMaterial({color:0xa2e4de});
    const building=new THREE.Group();building.position.set(-30,0,-38);this.scene.add(building);
    const facilityMesh=(id,mat,parent)=>{const d=FACILITY_SOLIDS.find(o=>o.id===id);return mesh(new THREE.BoxGeometry(...d.size),mat,d.center[0]-parent.position.x,d.center[1]-parent.position.y,d.center[2]-parent.position.z,parent);};
    facilityMesh('hangar',dark,building);facilityMesh('hangar-roof',aluminum,building);
    for(let i=-18;i<19;i+=2.7)mesh(new THREE.BoxGeometry(.07,7.6,.15),aluminum,i,4,7.58,building);
    for(const x of [-11,11]){
      mesh(new THREE.BoxGeometry(13,5.3,.12),new THREE.MeshStandardMaterial({color:0x13272e,roughness:.3,metalness:.4}),x,2.9,7.65,building);
      mesh(new THREE.BoxGeometry(13.2,.08,.18),glow,x,5.65,7.75,building);
      for(let k=0;k<5;k++)mesh(new THREE.BoxGeometry(12.8,.04,.05),aluminum,x,.8+k,7.74,building);
    }
    const word=label('A E R O N A U T',{width:13,height:1.1,color:'#e4efef',size:86});word.position.set(0,6.9,7.8);building.add(word);
    const sub=label('PROPULSION RESEARCH FACILITY',{width:9,height:.42,color:'#8eafba',size:65});sub.position.set(0,6.12,7.81);building.add(sub);
    // A modest tower provides parallax and a legible horizon without dominating the car.
    const tower=new THREE.Group();tower.position.set(-60,0,-70);this.scene.add(tower);
    facilityMesh('tower-base',concrete,tower);facilityMesh('tower-cabin',dark,tower);
    mesh(new THREE.BoxGeometry(10.7,1.3,8.05),new THREE.MeshStandardMaterial({color:0x79a8bd,metalness:.8,roughness:.17}),0,13.2,0,tower);
    mesh(new THREE.BoxGeometry(12,.3,9),aluminum,0,14.7,0,tower);
    mesh(new THREE.CylinderGeometry(.06,.06,8,8),aluminum,0,18.5,0,tower);
    mesh(new THREE.SphereGeometry(.16,8,8),new THREE.MeshBasicMaterial({color:0xff785d}),0,22.6,0,tower);
    const boundary=FACILITY_SOLIDS.filter(o=>o.id.startsWith('boundary-'));
    const barrier=new THREE.InstancedMesh(surfaceUV(new THREE.BoxGeometry(...boundary[0].size),concrete.userData.tileMetres),concrete,boundary.length);
    for(let i=0;i<boundary.length;i++){tempObj.position.fromArray(boundary[i].center);tempObj.rotation.set(0,0,0);tempObj.updateMatrix();barrier.setMatrixAt(i,tempObj.matrix);}barrier.castShadow=true;barrier.receiveShadow=true;this.scene.add(barrier);
    const lamps=FACILITY_SOLIDS.filter(o=>o.id.startsWith('lamp-'));
    const mast=new THREE.InstancedMesh(surfaceUV(new THREE.BoxGeometry(...lamps[0].size),dark.userData.tileMetres),dark,lamps.length);
    for(let i=0;i<lamps.length;i++){tempObj.position.fromArray(lamps[i].center);tempObj.rotation.set(0,0,0);tempObj.updateMatrix();mast.setMatrixAt(i,tempObj.matrix);mesh(new THREE.BoxGeometry(1.4,.12,.35),glow,-40+i*20,6.1,21,this.scene);}this.scene.add(mast);
    // Deterministic distant ridges, intentionally outside the flat test area's collision domain.
    for(let band=0;band<3;band++){
      const verts=[],indices=[];const n=34;const z=-200-band*95;
      for(let i=0;i<=n;i++){const x=-700+i*1400/n;const h=18+band*12+Math.sin(i*1.7+band)*15+Math.cos(i*.54)*16;verts.push(x,-8,z,x,h,z+Math.sin(i*1.9)*20);}
      for(let i=0;i<n;i++)indices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.57,.13,.32+band*.05),roughness:1,side:THREE.DoubleSide}));this.scene.add(m);
    }

  }

  createParticles() {
    this.particleCount=1800;this.particleIndex=0;
    this.particlePositions=new Float32Array(this.particleCount*3);this.particleAlphas=new Float32Array(this.particleCount);this.particleSizes=new Float32Array(this.particleCount);
    this.particlesData=Array.from({length:this.particleCount},()=>({life:0,maxLife:1,vel:new THREE.Vector3()}));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3));g.setAttribute('opacity',new THREE.BufferAttribute(this.particleAlphas,1));g.setAttribute('size',new THREE.BufferAttribute(this.particleSizes,1));
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.NormalBlending,uniforms:{color:{value:new THREE.Color(0xd6f3f4)}},vertexShader:'attribute float opacity; attribute float size; varying float vAlpha; void main(){vAlpha=opacity;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=min(100.,size*(240./max(1.,-mv.z)));gl_Position=projectionMatrix*mv;}',fragmentShader:'uniform vec3 color;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),2.)*vAlpha;gl_FragColor=vec4(color,a);}' });
    this.particleGeometry=g;this.particlePoints=new THREE.Points(g,mat);this.particlePoints.frustumCulled=false;this.scene.add(this.particlePoints);
  }
  createJet() {
    const geo=new THREE.ConeGeometry(.2,1,16,1,true);geo.translate(0,-.5,0);
    const mat=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{power:{value:0},time:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float power;uniform float time;varying vec2 vUv;void main(){float bands=.75+.25*sin(vUv.y*44.-time*70.);float a=pow(vUv.y,1.8)*power*.65*bands;gl_FragColor=vec4(.67,.9,1.,a);}'});
    const plume=new THREE.Mesh(geo,mat);this.scene.add(plume);return plume;
  }
  createMarks() {
    const g=new THREE.PlaneGeometry(.65,.19);g.rotateX(-Math.PI/2);
    this.marks=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({color:0x112126,transparent:true,opacity:.28,depthWrite:false}),1000);
    this.marks.count=0;this.markIndex=0;this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(this.marks);
  }
  resize() {
    const rect=this.canvas.getBoundingClientRect();const w=Math.max(1,rect.width),h=Math.max(1,rect.height);
    const ratio=renderPixelRatio(w,h,window.devicePixelRatio||1,this.quality,this.renderBudget?.pixels||600000);
    this.renderer.setPixelRatio(ratio);this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.inspectionViewport();this.camera.updateProjectionMatrix();
  }
  updateRoadRelief(roughness=0){
    if(!this.roadRelief)return;this.roadRelief.visible=roughness>0;
    const a=this.roadRelief.geometry.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,sampleRoadSurface(a.getX(i),a.getZ(i),{roughness}).height-.003);
    a.needsUpdate=true;this.roadRelief.geometry.computeVertexNormals();
  }
  observeFrame(ms){if(this.quality==='smooth'&&this.modelStatus?.ok&&this.renderBudget.observe(ms))this.resize();}
  configureLandingShadows(){
    // r180 selects shadow casters using the view camera's layers, so changing
    // shadow.camera.layers alone cannot isolate the car. Cache only the fixed
    // lab's caster flags and restore them when leaving; never touch car/city
    // meshes. One existing shadow map supplies a genuine moving silhouette.
    if(!this.labShadowCasters){
      this.labShadowCasters=new Map();
      for(const root of this.labEnvironment||[])root.traverse?.(object=>{if(object.castShadow)this.labShadowCasters.set(object,true);});
    }
    for(const [object,original]of this.labShadowCasters)object.castShadow=this.mode==='lab'?false:original;
    const shadowCamera=this.sun?.shadow?.camera;
    if(shadowCamera){const extent=this.mode==='lab'?10:24;Object.assign(shadowCamera,{left:-extent,right:extent,top:extent,bottom:-extent});shadowCamera.updateProjectionMatrix();}
  }
  setMode(mode) {
    if(mode!==this.mode)this.resetPhysicalEffects?.();
    this.mode=mode;this.cockpitDrag=null;if(mode!=='city'){if(this.cockpit)this.cockpit.root.visible=false;if(this.vehicle)this.vehicle.root.visible=true;}this.controls.enabled=true;this.controls.enableZoom=mode!=='inspect';this.controls.minDistance=mode==='inspect'?.25:3;
    this.pinchDistance=0;
    if(this.landingVisual)this.landingVisual.root.visible=mode==='lab'&&this.landingVisual.enabled;
    // City facades need depth precision hundreds of metres away; inspection keeps its close view.
    if(this.camera){this.camera.near=mode==='city'?.25:.08;this.camera.updateProjectionMatrix?.();}
    if(mode!=='inspect')this.camera.clearViewOffset();
    for(const object of this.inspectionOccluders||[])object.visible=mode!=='inspect';
    if(this.labEnvironment){
      for(const object of this.labEnvironment)object.visible=mode!=='city'&&(mode!=='inspect'||!this.inspectionOccluders.includes(object));
    }
    if(this.city)this.city.root.visible=mode==='city';
    if(this.renderer){this.renderer.shadowMap.enabled=mode==='city'||mode==='lab'||this.quality==='detail';this.renderer.shadowMap.needsUpdate=true;}
    if(this.sun?.shadow){this.sun.shadow.camera.far=mode==='city'?650:150;this.sun.shadow.camera.updateProjectionMatrix();}
    this.configureLandingShadows?.();
    if(this.scene?.fog)this.scene.fog.density=mode==='city'?.0015:.0025;
    if(this.marks){this.marks.count=0;this.markIndex=0;}
    if(this.stageVisual)this.stageVisual.visible=mode!=='inspect';
    if(mode!=='inspect'){this.selectedBox.visible=false;this.selectedPart=null;this.selectedPartId=null;}
    this.applyInspectorVisibility?.();
  }
  setLandingExperiment(config){this.resetPhysicalEffects?.();this.landingVisual?.setExperiment(config);if(!config)this.landingFocusOffset=null;}
  setLandingLearningVisible(visible){this.landingVisual?.setVisible(visible);}
  setCamera(camera) {
    if(this.mode==='city'&&camera==='orbit'&&this.cameraName==='hood'&&this.vehicle){
      const p=this.vehicle.root.position;this.controls.target.copy(p).add(new THREE.Vector3(0,.4,0));
      this.camera.position.copy(p).add(new THREE.Vector3(-6,3.2,5).applyAxisAngle(UP,this.lastCameraHeading||0));
      this.camera.lookAt(this.controls.target);
    }
    const enteringCockpit=this.mode==='city'&&camera==='hood'&&this.cameraName!=='hood';
    this.cockpitDrag=null;if(enteringCockpit)this.cockpit?.recenter();
    if(this.cockpit)this.cockpit.root.visible=this.mode==='city'&&camera==='hood';
    if(camera!=='hood'||this.mode!=='city'){this.camera.up.copy(UP);this.camera.near=this.mode==='city'?.25:.08;if(this.vehicle)this.vehicle.root.visible=true;}
    this.cameraName=camera;this.controls.maxPolarAngle=Math.PI*.485;this.controls.enabled=camera==='orbit';this.controls.enableZoom=this.mode!=='inspect';
  }
  async loadCity(){
    if(this.cityPromise)return this.cityPromise;
    if(this.city)return this.city;
    this.cityPromise??=loadCityWorld().then(async city=>{
      this.city=city;city.root.visible=this.mode==='city';this.scene.add(city.root);
      for(const name of ['OSM building facades','OSM building roofs']){const mesh=city.root.getObjectByName(name);if(mesh)mesh.castShadow=true;}
      this.citySurfaces=await applyCitySurfaces(city,this.renderer);
      if(!this.citySurfaces.loaded)console.warn('촬영 재질 로드 실패 · 기본 재질 유지',this.citySurfaces.error);
      await attachStreamingCity(city,{treeAsset:city.treeAsset});
      // Centre pavement of divided avenues, signals and subway entrances follow the same map and physics.
      try{
        const overlay=await loadStreetOverlay(city),bind=city.streaming.bindPhysics,dispose=city.dispose.bind(city);
        city.streetOverlay=overlay;city.streaming.bindPhysics=sim=>{bind(sim);overlay.bindPhysics(sim);};city.dispose=()=>{overlay.dispose();dispose();};
      }catch(error){console.warn('도로 세부 로드 실패 · 기본 도로 유지',error);}
      return city;
    }).catch(error=>{if(this.city){this.scene.remove(this.city.root);this.city.dispose();this.city=null;}this.cityPromise=null;throw error;});
    return this.cityPromise;
  }
  frameLandingStart(sim){
    const height=Math.abs(sim.state.pos.y);
    this.camera.far=Math.max(1500,Math.min(1e12,height*2+1000));this.camera.updateProjectionMatrix();
    const p=sim.bodyPosition||sim.state.pos,release=this.landingVisual?.config?.height??Math.max(0,p.y-.67);
    const ruler=landingRulerWindow(release,release);
    // Fit the local measuring window, not the entire path of a high drop.
    // Include displaced force arrows and the ruler left of the car, and use
    // the canvas space left after the actual telemetry panel is accounted for.
    const low=Math.min(p.y-.75,ruler.start),high=Math.max(p.y+3.1,ruler.end);
    const box=new THREE.Box3(new THREE.Vector3(p.x-4.8,low,p.z-2.7),new THREE.Vector3(p.x+3.2,high,p.z+2.7));
    const center=box.getCenter(new THREE.Vector3()),direction=new THREE.Vector3(-8,3.8,4.2).normalize();
    const available=this.inspectionViewport();
    const distance=inspectionDistance(box,direction,43,this.camera.aspect,available);
    this.landingFocusOffset=center.clone().sub(p);this.camera.fov=43;
    this.cameraTarget.copy(center);this.controls.target.copy(center);this.controls.maxDistance=Math.max(55,distance*1.4);
    this.camera.position.copy(center).addScaledVector(direction,distance);this.cameraPosition.copy(this.camera.position);
    this.camera.lookAt(center);this.camera.updateProjectionMatrix();this.controls.update();this.chaseBlend=1;this.lastCameraHeading=0;
  }
  frameCityStart(sim){
    this.cockpit?.recenter();this.cockpitDrag=null;
    this.camera.far=3500;this.camera.updateProjectionMatrix();
    const p=sim.bodyPosition||sim.state.pos;
    const heading=Math.atan2(-tmpV.set(1,0,0).applyQuaternion(sim.state.q).z,tmpV.x);
    this.lastCameraHeading=heading;this.chaseBlend=1;
    this.cameraTarget.copy(p).add(new THREE.Vector3(0,.75,0));
    this.camera.position.copy(p).add(new THREE.Vector3(-8,3.5,0).applyAxisAngle(UP,heading));
    this.cameraPosition.copy(this.camera.position);this.controls.target.copy(this.cameraTarget);this.camera.lookAt(this.cameraTarget);
  }
  frameLevelDemo(sim){
    const p=sim.bodyPosition||sim.state.pos;
    this.cameraTarget.copy(p);this.cameraTarget.y+=.05;
    this.controls.maxPolarAngle=Math.PI*.65;
    this.camera.position.copy(p).add(new THREE.Vector3(6,Math.max(-.6,.12-p.y),9));
    this.cameraPosition.copy(this.camera.position);this.controls.target.copy(this.cameraTarget);this.camera.lookAt(this.cameraTarget);
  }
  frameStageStart(sim) {
    const p=sim.bodyPosition||sim.state.pos;
    this.cameraTarget.copy(p);this.cameraTarget.y+=.15;
    this.camera.position.copy(p).add(new THREE.Vector3(-8,3.8,4.2));
    this.cameraPosition.copy(this.camera.position);this.controls.target.copy(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);this.chaseBlend=1;this.lastCameraHeading=0;
  }
  setExplode(value,notify=false) {
    const old=this.explodeTarget;this.explodeTarget=clamp(Number(value)||0,0,1);
    if(this.mode==='inspect'&&old!==this.explodeTarget&&this.vehicle.fitLayout&&!this.selectedPart)this.frameWholeVehicle();
    if(notify)this.onInspectExplode(this.explodeTarget);
    return this.explodeTarget;
  }
  setStage(stageData) {
    if(this.stageVisual){this.scene.remove(this.stageVisual);disposeStageVisual(this.stageVisual);}
    this.stageVisual=stageData?createStageVisual(stageData):null;
    if(this.stageVisual){this.stageVisual.visible=this.mode!=='inspect';this.scene.add(this.stageVisual);}
  }
  getPartCatalog() {
    return this.vehicle.catalog||[];
  }
  applyInspectorVisibility() {
    if(!this.vehicle?.detailParts){
      for(const id of ['tank','battery','suspension','thrusters','wing','drive-front','drive-rear-left','drive-rear-right','power-electronics']){const part=this.vehicle?.parts?.get(id);if(part)part.visible=this.mode!=='inspect'||this.showHypotheses;}
      return;
    }
    const inspecting=this.mode==='inspect';
    for(const entry of this.getPartCatalog()) {
      const part=this.vehicle.detailParts.get(entry.id);
      if(part&&this.mode==='city'&&entry.kind==='hypothesis'){part.visible=entry.id==='thrusters';continue;}
      if(part)part.visible=inspecting?((entry.kind!=='hypothesis'||this.showHypotheses)&&!this.hiddenParts.has(entry.id)&&(!this.isolatedPartId||entry.id===this.isolatedPartId)):(this.cutaway?(entry.kind==='hypothesis'||entry.category==='wheels'):!['drive-front','drive-rear-left','drive-rear-right','power-electronics',...(this.vehicle.profileId?['wing','tank','battery','suspension']:[])].includes(entry.id));
    }
    if(this.selectedBox)this.selectedBox.visible=inspecting&&!!this.selectedPart&&isObjectVisible(this.selectedPart);
  }
  setHypothesesVisible(show) {
    this.showHypotheses=!!show;
    if(!show&&this.getPartCatalog().some(p=>p.id===this.isolatedPartId&&p.kind==='hypothesis'))this.isolatedPartId=null;
    this.applyInspectorVisibility();
  }
  togglePartVisibility(id) {
    if(!this.vehicle.detailParts?.has(id))return;
    if(this.hiddenParts.has(id))this.hiddenParts.delete(id);else this.hiddenParts.add(id);
    this.applyInspectorVisibility();
  }
  isolatePart(id) {
    if(!this.vehicle.detailParts?.has(id))return;
    this.isolatedPartId=this.isolatedPartId===id?null:id;
    this.hiddenParts.delete(id);this.applyInspectorVisibility();
  }
  restoreParts() {
    this.hiddenParts.clear();this.isolatedPartId=null;this.applyInspectorVisibility();
  }
  focusPart(id) {
    if(id===null||id===undefined){this.selectedPart=null;this.selectedPartId=null;this.selectedBox.visible=false;return;}
    const part=this.vehicle.detailParts?.get(id)||this.vehicle.parts.get(id);if(!part)return;
    this.selectedPart=part;this.selectedPartId=id;
    if(this.isolatedPartId)this.isolatedPartId=id;
    this.hiddenParts.delete(id);this.applyInspectorVisibility();
    this.vehicle.root.updateMatrixWorld(true);this.selectedBox.setFromObject(part);
    this.selectedBox.visible=this.mode==='inspect'&&isObjectVisible(part);
  }
  frameSelectedPart() {
    if(!this.selectedPart||this.mode!=='inspect')return;
    this.vehicle.root.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(this.selectedPart);
    if(box.isEmpty())return;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    const distance=clamp(size.length()/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))*1.35,.5,12);
    this.camera.position.copy(center).addScaledVector(direction,distance);
    this.controls.target.copy(center);this.cameraTarget.copy(center);this.controls.update();
  }
  inspectionBounds(amount=this.explodeTarget) {
    const base=this.vehicle.assemblyBounds||new THREE.Box3(new THREE.Vector3(-2.8,-.6,-1.3),new THREE.Vector3(2.8,1.6,1.3));
    const box=base.clone(),full=this.vehicle.explosionBounds,t=amount*amount*(3-2*amount);
    if(full){box.min.lerp(full.min,t);box.max.lerp(full.max,t);}return box;
  }
  inspectionViewport() {
    const w=this.canvas?.clientWidth||1280,h=this.canvas?.clientHeight||720;
    if(this.mode==='lab'){
      const getRect=id=>typeof document!=='undefined'?document.getElementById(id)?.getBoundingClientRect():null;
      const rightPanel=getRect('telemetry'),leftPanel=w>1000?getRect('left-panel'):null;
      const right=Math.min(w*.4,rightPanel?.width?Math.max(0,w-rightPanel.left):w<=700?197:w<=1000?182:272);
      const left=w>1000?Math.min(w*.36,leftPanel?.right||334):0;
      this.camera.setViewOffset(w,h,(right-left)/2,0,w,h);
      return Math.max(.25,1-(left+right)/w);
    }
    const panel=this.mode==='inspect'&&w>1000?Math.min(360,w*.36):0;
    if(panel)this.camera.setViewOffset(w,h,-panel/2,0,w,h);else this.camera.clearViewOffset();
    return 1-panel/w;
  }
  frameWholeVehicle({resetView=false}={}) {
    if(this.mode==='inspect'&&this.vehicle.fitLayout){
      this.vehicle.root.updateMatrixWorld(true);
      const box=this.inspectionBounds().applyMatrix4(this.vehicle.root.matrixWorld);
      const center=box.getCenter(new THREE.Vector3());
      const direction=resetView?new THREE.Vector3(1,.65,1.3):this.camera.position.clone().sub(this.controls.target);
      if(direction.lengthSq()<.01)direction.set(1,.65,1.3);direction.normalize();
      const available=this.inspectionViewport();
      const distance=inspectionDistance(box,direction,this.camera.fov,this.camera.aspect,available);
      this.controls.maxDistance=Math.max(55,distance*1.4);
      this.camera.position.copy(center).addScaledVector(direction,distance);
      this.controls.target.copy(center);this.cameraTarget.copy(center);this.controls.update();return;
    }
    this.camera.clearViewOffset();
    const center=this.vehicle.root.position.clone();center.y+=.15;
    this.camera.position.copy(center).add(new THREE.Vector3(7.2,3.4,7.4));
    this.controls.target.copy(center);this.cameraTarget.copy(center);this.controls.update();
  }
  async loadVehicle(profile) {
    this.vehicleCache??=new Map();
    let vehicle=this.vehicleCache.get(profile.id);
    if(!vehicle){
      vehicle=profile.id==='roadster'?await loadRoadsterVehicle(createVehicle()):await loadRealVehicle(profile);
      prepareAssessmentVehicle(vehicle);
      configureVehicleFit(vehicle,profile);
      vehicle.profileId=profile.id;this.vehicleCache.set(profile.id,vehicle);
    }
    this.vehicleCache.delete(profile.id);this.vehicleCache.set(profile.id,vehicle);
    const previous=this.vehicle;
    vehicle.root.position.copy(previous.root.position);vehicle.root.quaternion.copy(previous.root.quaternion);
    this.scene.remove(previous.root);this.vehicle=vehicle;this.scene.add(vehicle.root);
    this.cockpit?.setVehicle(vehicle);
    if(![...this.vehicleCache.values()].includes(previous))disposeVehicle(previous);
    this.focusPart(null);this.lastPaint='';this.lastExplosion=undefined;this.lastFitExplosion=undefined;this.hasCustomModel=false;
    // Keep only three decoded assemblies resident when comparing a large fleet.
    while(this.vehicleCache.size>3){const id=this.vehicleCache.keys().next().value;const evicted=this.vehicleCache.get(id);this.vehicleCache.delete(id);disposeVehicle(evicted);}
    this.setExplode(0,true);this.restoreParts();this.setQuality(this.quality);
    if(this.customModel)this.customModel.visible=false;
    this.modelStatus={ok:true,loading:false,...vehicle.assetInfo,meshCount:vehicle.sourceMeshCount};
    return vehicle;
  }
  async setModelGLB(file) {
    const result=await new GLTFLoader().parseAsync(await file.arrayBuffer(),'');
    const model=new THREE.Group();model.add(result.scene);
    model.updateMatrixWorld(true);let box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
    if(size.z>size.x){result.scene.rotation.y=Math.PI/2;model.updateMatrixWorld(true);box.setFromObject(model);size=box.getSize(new THREE.Vector3());}
    if(size.x<.0001)throw new Error('모델의 크기를 확인할 수 없습니다.');
    const center=box.getCenter(new THREE.Vector3()),scale=4.6/size.x;
    result.scene.position.sub(center);model.scale.setScalar(scale);model.position.y=-.6+size.y*scale/2;
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    if(this.customModel)this.scene.remove(this.customModel);
    this.customPivot=new THREE.Group();this.customPivot.add(model);this.scene.add(this.customPivot);this.customModel=this.customPivot;this.hasCustomModel=true;
    return {name:file.name,length:4.6,normalized:true};
  }

  updateWheels(wheels,cg,explode=0) {
    for(let i=0;i<this.vehicle.wheels.length;i++){
      if(this.mode==='inspect'&&this.vehicle.fitLayout)continue;
      const w=this.vehicle.wheels[i],physicsWheel=wheels?.[i];if(!physicsWheel)continue;
      const offset=w.userData.explodeOffset||tmpV.set(0,0,0);
      const base=w.userData.basePosition;
      w.position.set((physicsWheel.pos?.x??base.x)+cg.x,(physicsWheel.pos?.y??-.31)+cg.y+(physicsWheel.compression||0),(physicsWheel.pos?.z??base.z)+cg.z).addScaledVector(offset,partExplodeProgress(w.userData.partId,explode));
      w.rotation.y=physicsWheel.steer||0;
      if(w.userData.spinGroup)w.userData.spinGroup.rotation.z=-(physicsWheel.spinAngle||0);
    }
  }

  update(sim,dt,options={}) {
    dt=Math.min(Math.max(dt||0,0),.1);this.elapsed+=dt;
    const mode=options.mode||this.mode,camera=options.camera||this.cameraName;
    if(mode!==this.mode)this.setMode(mode);if(camera!==this.cameraName)this.setCamera(camera);
    if(this.cutaway!==!!options.cutaway){this.cutaway=!!options.cutaway;this.applyInspectorVisibility();}
    const state=options.renderState||sim.state,position=state.pos,q=state.q;
    const wheels=options.renderState?.wheels||sim.wheels;
    const cg=sim.cg||new THREE.Vector3();
    const bodyPosition=options.renderState?.bodyPosition||sim.bodyPosition||position.clone().sub(cg.clone().applyQuaternion(q));
    const thrusters=options.renderState?.thrusters||sim.thrusters;
    const view={state,bodyPosition,wheels,thrusters};
    const visualClock=(this.physicsVisualClock??=new SimulationVisualClock()).advance(state.time,sim.state.time);
    if(visualClock.reset)this.clearExhaustParticles();
    this.telemetry=sim.telemetry?.()||{};
    if(this.mode==='city'&&this.city?.treeAsset)updateTreeWind(this.city.treeAsset,sim.state.time,1.4+(sim.params.windX||0),.6+(sim.params.windZ||0));
    if(this.mode==='city')this.city?.streetOverlay?.update(position.x,position.z);
    this.vehicle.root.position.copy(bodyPosition);
    if(this.mode==='inspect')this.vehicle.root.quaternion.identity();else this.vehicle.root.quaternion.copy(q);
    if(Number.isFinite(options.explode))this.setExplode(options.explode);
    const targetExplode=this.mode==='inspect'?this.explodeTarget:0;
    this.explodeProgress=THREE.MathUtils.lerp(this.explodeProgress,targetExplode,1-Math.exp(-9*dt));
    if(Math.abs(this.explodeProgress-targetExplode)<.0001)this.explodeProgress=targetExplode;
    const explode=this.explodeProgress;
    if(options.paint&&options.paint!==this.lastPaint){for(const m of this.vehicle.paintMaterials)m.color.set(options.paint);this.lastPaint=options.paint;}
    if(!this.vehicle.fitLayout&&this.lastExplosion!==explode){
    for(const [id,part] of this.vehicle.parts){
      const base=part.userData.basePosition,offset=part.userData.explodeOffset;
      if(base&&offset)part.position.copy(base).addScaledVector(offset,partExplodeProgress(id,explode));
    }
    updateDetailExplosion(this.vehicle,explode);this.lastExplosion=explode;
    }
    this.updateWheels(wheels,cg,explode);
    for(const unit of this.vehicle.driveRotors||[]){const phase=unit.wheelIndices.reduce((sum,i)=>sum+(wheels[i]?.spinAngle||0),0)/unit.wheelIndices.length;unit.rotor.rotation.z=-phase*(sim.params.gearRatio||9);unit.gear.rotation.z=phase;}
    for(let i=0;i<(this.vehicle.valveIndicators?.length||0);i++){const valve=this.vehicle.valveIndicators[i];valve.scale.y=.35+.65*(thrusters[i]?.opening||0);}
    const lamp=this.vehicle.tank?.userData.supplyLamp;if(lamp)lamp.scale.setScalar(.7+.3*Math.min(1,(sim.massFlowKgS||0)/50));
    if(this.lastRoadRoughness!==sim.params.roadRoughness){this.lastRoadRoughness=sim.params.roadRoughness;this.updateRoadRelief(sim.params.roadRoughness);}
    if(this.mode==='city')this.roadRelief.visible=false;
    if(this.vehicle.wing?.userData.foil)this.vehicle.wing.userData.foil.rotation.z=(sim.params?.wingEnabled===false?0:.05)+(options.wing?-.11:0);
    for(const fan of this.vehicle.fans||[])fan.rotation.y+=visualClock.dt*((this.telemetry.fanN||0)>10?18:0);
    const insideCockpit=this.mode==='city'&&this.cameraName==='hood';
    // Use the inspected original cabin, or its model-specific reference interior.
    // Cloned inside materials preserve the shared exterior and explosion view.
    this.vehicle.root.visible=(!this.hasCustomModel||this.mode==='inspect')&&!insideCockpit;
    this.cockpit.root.visible=insideCockpit;if(insideCockpit){this.cockpit.setVehicle(this.vehicle);if(options.paint)this.cockpit.setPaint(options.paint);}
    if(this.customModel){this.customModel.visible=!!this.hasCustomModel&&this.mode!=='inspect'&&!insideCockpit;this.customModel.position.copy(bodyPosition);this.customModel.quaternion.copy(q);}
    for(let i=0;i<(this.vehicle.gimbalNozzles?.length||0);i++){const nozzle=this.vehicle.gimbalNozzles[i];if(thrusters[i])nozzle.quaternion.setFromUnitVectors(UP,thrusters[i].dir);}
    updateNozzleCovers(this.vehicle,thrusters,this.mode==='inspect');
    if(this.vehicle.fitLayout&&(this.lastFitExplosion!==explode||this.lastFitMode!==this.mode)){
      updateVehicleExplosion(this.vehicle,explode,{inspect:this.mode==='inspect'});this.lastFitExplosion=explode;this.lastFitMode=this.mode;
    }
    // The landing diagram uses one shared linear force scale. Keep the older
    // driving/inspection vectors available without drawing both sets together.
    const showVectors=!!options.vectors&&!(mode==='lab'&&this.landingVisual?.enabled);
    this.updateJets(view,visualClock.dt,showVectors,visualClock.time);
    this.gravityArrow.visible=showVectors;
    if(showVectors){
    this.gravityArrow.position.copy(position);this.gravityArrow.setLength(Math.max(.4,(this.telemetry.totalMass||2150)*9.80665/16000),.18,.1);
    this.fanArrow.visible=showVectors&&(this.telemetry.fanN||0)>100;
    this.fanArrow.position.copy(bodyPosition).add(new THREE.Vector3(-.1,-.25,0).applyQuaternion(q));this.fanArrow.setDirection(tmpV.set(0,-1,0).applyQuaternion(q));this.fanArrow.setLength(Math.max(.3,(this.telemetry.fanN||0)/16000),.16,.09);
    for(let i=0;i<4;i++){const a=this.contactArrows[i],w=wheels?.[i];a.visible=showVectors&&(w?.load||0)>100;if(w){a.position.copy(w.pos).applyQuaternion(q).add(position);a.position.y=.06+(w.surfaceY||0);a.setLength(.25+(w.load||0)/10000,.15,.07);}}
    }else{this.fanArrow.visible=false;for(const a of this.contactArrows)a.visible=false;}
    for(let i=0;i<4;i++){
      const a=this.frictionArrows[i],w=wheels[i],force=Math.hypot(w?.forceX||0,w?.forceY||0,w?.forceZ||0);
      a.visible=showVectors&&mode!=='inspect'&&force>10;
      if(a.visible){a.position.copy(w.pos).applyQuaternion(q).add(position);a.position.y=(w.surfaceY||0)+.09;a.setDirection(tmpV.set(w.forceX,w.forceY||0,w.forceZ).normalize());a.setLength(.15+Math.min(2.5,force/4500),.14,.07);}
    }
    if(this.selectedPart&&this.mode==='inspect')this.selectedBox.setFromObject(this.selectedPart);
    this.tireEffects.update(sim,view,this.mode==='city');
    this.contactShadow.position.set(position.x,.016,position.z);
    this.contactShadow.rotation.z=-Math.atan2(tmpV.set(1,0,0).applyQuaternion(q).z,tmpV.x);
    this.contactShadow.material.opacity=(mode==='lab'?.28:.65)*Math.exp(-Math.max(0,position.y-.6)*.35);
    const height=Math.max(0,position.y-.6);this.contactShadow.scale.setScalar(1+height*.065);
    if(this.sunDirection)this.sun.position.copy(position).addScaledVector(this.sunDirection,this.mode==='city'?300:50);
    else this.sun.position.set(position.x-20,34+Math.min(position.y,20),position.z+26);
    this.sun.target.position.copy(position);this.sun.target.updateMatrixWorld();
    this.sky.position.set(position.x,position.y,position.z);
    if(this.stageVisual){
      updateStageVisual(this.stageVisual,options.stageProgress||0,this.elapsed);
      const hit=this.telemetry.lastObstacleImpact;
      for(const [id,g] of this.stageVisual.userData.obstacles){const mat=g.children[0]?.material;if(mat?.emissive){mat.emissive.setHex(0xff6e34);mat.emissiveIntensity=hit?.id===id?Math.max(0,1-(sim.state.time-hit.lastTime)/1.4)*.8:0;}}
    }
    this.updateCamera(view,dt);
    this.landingVisual?.update(sim,view,this.camera,mode);
    if(insideCockpit&&this.cockpit.mirrorSurface)this.cockpitMirror.update(this.renderer,this.scene,{bodyPosition,quaternion:q,eye:this.cockpit.seat.eye},dt,[this.vehicle.root,this.customModel,this.cockpit.root]);
    this.shadowElapsed+=dt;if(this.renderer.shadowMap.enabled&&this.shadowElapsed>=(this.mode==='city'||this.mode==='lab'?1/12:1/20)){this.renderer.shadowMap.needsUpdate=true;this.shadowElapsed=0;}
    this.renderer.render(this.scene,this.camera);
  }

  updateCamera(sim,dt) {
    const p=sim.bodyPosition||sim.state.pos;const v=sim.state.vel;const speed=v.length();
    if(this.mode==='city'&&this.cameraName==='hood'){
      this.cockpit.setVehicle(this.vehicle);const pose=this.cockpit.update(this.camera,sim,dt,this.telemetry);
      this.cameraTarget.copy(pose.target);this.controls.target.copy(this.cameraTarget);return;
    }
    if(this.mode==='inspect'||this.cameraName==='orbit'){
      if(this.selectedPart&&this.mode==='inspect')new THREE.Box3().setFromObject(this.selectedPart).getCenter(this.cameraTarget);
      else if(this.mode==='inspect'&&this.vehicle.fitLayout){
        this.inspectionBounds(this.explodeProgress).getCenter(this.cameraTarget).applyMatrix4(this.vehicle.root.matrixWorld);
      }else{this.cameraTarget.copy(p);if(this.mode==='lab'&&this.landingFocusOffset)this.cameraTarget.add(this.landingFocusOffset);else this.cameraTarget.y+=.15;}
      // Translate eye and pivot equally: driving follows without resetting the user's orbit.
      this.camera.position.add(tmpV.copy(this.cameraTarget).sub(this.controls.target));
      this.controls.target.copy(this.cameraTarget);this.camera.fov=43;this.camera.updateProjectionMatrix();
      this.controls.update();return;
    }
    const target=tmpV.copy(p);target.y+=.1;
    let offset;
    if(this.cameraName==='top'){offset=tmpV2.set(-.5,20,.01);this.camera.fov=43;}
    else{
      this.chaseBlend=THREE.MathUtils.lerp(this.chaseBlend||0,this.stageVisual||speed>1.5?1:0,1-Math.exp(-1.6*dt));
      offset=tmpV2.set(THREE.MathUtils.lerp(7.2,-7.9,this.chaseBlend),3.4+(Math.min(speed,60)/60)*.7,THREE.MathUtils.lerp(7.4,3.8,this.chaseBlend));
      if(this.mode==='city')offset.set(-8-Math.min(speed*.035,2),3.2+Math.min(speed*.01,.6),0);
      const forward=new THREE.Vector3(1,0,0).applyQuaternion(sim.state.q);
      if(Math.hypot(forward.x,forward.z)>.15)this.lastCameraHeading=Math.atan2(-forward.z,forward.x);
      const heading=this.lastCameraHeading||0;
      offset.applyAxisAngle(UP,heading);
      this.camera.fov=43+Math.min(speed/7,6);
      if(this.mode==='city')this.camera.fov=52+Math.min(speed*.16,10);
      if(speed>.5){target.x+=v.x*.06;target.z+=v.z*.06;}
    }
    this.cameraTarget.lerp(target,1-Math.exp(-6*dt));
    this.cameraPosition.copy(p).add(offset);
    this.camera.position.lerp(this.cameraPosition,1-Math.exp(-3.5*dt));this.camera.lookAt(this.cameraTarget);this.camera.updateProjectionMatrix();
    this.controls.target.copy(this.cameraTarget);
  }

  clearExhaustParticles(){
    for(const particle of this.particlesData||[])particle.life=0;
    this.particleAlphas?.fill(0);this.particleSizes?.fill(0);this.jetEmissionCarry=[];this.particleIndex=0;
    if(this.particlePoints)this.particlePoints.visible=false;
    if(this.particleGeometry)this.particleGeometry.attributes.opacity.needsUpdate=true;
    for(const plume of this.jets||[])plume.visible=false;
  }
  resetPhysicalEffects(){this.physicsVisualClock?.reset();this.clearExhaustParticles();}

  updateJets(sim,dt,showVectors,visualTime=sim.state.time) {
    dt=Number.isFinite(dt)?Math.max(0,dt):0;
    const phase=Number.isFinite(visualTime)?visualTime:0;
    this.jetEmissionCarry??=[];
    const thrusters=sim.thrusters||[];const state=sim.state;let particlesActive=false;
    for(let i=0;i<thrusters.length;i++){
      if(!this.jets[i])this.jets[i]=this.createJet();
      if(!this.forceArrows[i]){this.forceArrows[i]=new THREE.ArrowHelper(UP,new THREE.Vector3(),1,0x71f4dd,.17,.09);this.scene.add(this.forceArrows[i]);}
      const t=thrusters[i],power=clamp((t.force||0)/14000,0,1);
      if(power<=.005&&!showVectors){this.jets[i].visible=false;this.forceArrows[i].visible=false;continue;}
      const worldPosition=t.pos.clone().applyQuaternion(state.q).add(state.pos),forceDir=t.dir.clone().applyQuaternion(state.q);
      const nozzle=this.vehicle.gimbalNozzles?.[i];
      if(nozzle&&!this.hasCustomModel){nozzle.updateWorldMatrix(true,false);worldPosition.copy(nozzle.userData.exitOffset).applyMatrix4(nozzle.matrixWorld);}
      else if(!this.hasCustomModel&&i>=4&&this.vehicle.jetMounts?.[i])worldPosition.copy(this.vehicle.jetMounts[i].pos).applyQuaternion(state.q).add(sim.bodyPosition);
      const plume=this.jets[i];plume.visible=power>.005&&this.mode!=='inspect';
      plume.position.copy(worldPosition);
      // Cone extends along -Y, so local +Y is the reaction-force direction.
      plume.quaternion.setFromUnitVectors(UP,forceDir);plume.scale.set(.8+power*.7,.35+power*1.1,.8+power*.7);
      plume.material.uniforms.power.value=power;plume.material.uniforms.time.value=phase+i;
      const arrow=this.forceArrows[i];arrow.visible=showVectors&&(t.force||0)>100;arrow.position.copy(worldPosition);arrow.setDirection(forceDir);arrow.setLength(.3+Math.min(3,(t.force||0)/10000),.18,.09);
      if(dt>0&&power>.005&&this.mode!=='inspect'){
        const accumulated=(this.jetEmissionCarry[i]||0)+power*100*dt;
        const count=Math.floor(accumulated+1e-9);this.jetEmissionCarry[i]=Math.max(0,accumulated-count);
        for(let j=0;j<count;j++){
          const k=this.particleIndex++%this.particleCount,particle=this.particlesData[k];particle.maxLife=particle.life=.32+Math.random()*.45;
          this.particlePositions[k*3]=worldPosition.x;this.particlePositions[k*3+1]=worldPosition.y;this.particlePositions[k*3+2]=worldPosition.z;
          particle.vel.copy(state.vel).addScaledVector(forceDir,-(13+Math.random()*10));particle.vel.x+=(Math.random()-.5)*2;particle.vel.y+=(Math.random()-.5)*2;particle.vel.z+=(Math.random()-.5)*2;
          this.particleSizes[k]=.3+Math.random()*.3;
        }
      }
    }
    if(dt===0){this.particlePoints.visible=this.mode!=='inspect'&&this.particlesData.some(p=>p.life>0);return;}
    for(let i=0;i<this.particleCount;i++){
      const p=this.particlesData[i];if(p.life>0)particlesActive=true;p.life-=dt;if(p.life<=0){this.particleAlphas[i]=0;continue;}
      p.vel.multiplyScalar(Math.exp(-2*dt));this.particlePositions[i*3]+=p.vel.x*dt;this.particlePositions[i*3+1]+=p.vel.y*dt;this.particlePositions[i*3+2]+=p.vel.z*dt;
      if(this.particlePositions[i*3+1]<.04){this.particlePositions[i*3+1]=.04;p.vel.y=Math.abs(p.vel.y)*.1;const spread=Math.pow(1.02,dt*60);p.vel.x*=spread;p.vel.z*=spread;}
      this.particleAlphas[i]=.3*(p.life/p.maxLife);this.particleSizes[i]+=dt*.9;
    }
    this.particlePoints.visible=particlesActive;
    if(particlesActive){
    this.particleGeometry.attributes.position.needsUpdate=true;this.particleGeometry.attributes.opacity.needsUpdate=true;this.particleGeometry.attributes.size.needsUpdate=true;
    }
  }
  updateMarks(sim) {
    const p=sim.state.pos,speed=sim.state.vel.length();if(this.mode==='inspect'||speed<2||this.lastMark.distanceToSquared(p)<.25)return;
    const slip=this.telemetry?.slip||0;if(Math.abs(slip)<.16)return;
    this.lastMark.copy(p);
    for(const w of sim.wheels||[]){
      if((w.load||0)<100)continue;
      const pos=w.pos.clone();pos.y+=w.compression||0;pos.applyQuaternion(sim.state.q).add(p);
      tempObj.position.set(pos.x,.026+(w.surfaceY||0),pos.z);tempObj.rotation.set(0,Math.atan2(-sim.state.vel.z,sim.state.vel.x),0);tempObj.scale.set(1,1,1);tempObj.updateMatrix();
      this.marks.setMatrixAt(this.markIndex%1000,tempObj.matrix);this.markIndex++;this.marks.count=Math.min(1000,this.markIndex);
    }
    this.marks.instanceMatrix.needsUpdate=true;
  }
  dispose() {
    this.landingVisual?.dispose();
    this.canvas.removeEventListener('pointerdown',this._onDown,true);this.canvas.removeEventListener('pointerup',this._onUp,true);
    this.canvas.removeEventListener('pointermove',this._onMove,true);this.canvas.removeEventListener('pointercancel',this._onCancel,true);
    this.canvas.removeEventListener('dblclick',this._onDoubleClick);window.removeEventListener('blur',this._onBlur);this.cockpit?.dispose();this.cockpitMirror?.dispose();
    this.canvas.removeEventListener('wheel',this._onWheel,true);this.touchPointers.clear();this.controls.dispose();
    if(this.stageVisual){disposeStageVisual(this.stageVisual);this.stageVisual=null;}
    this.citySurfaces?.dispose();if(this.city){this.scene.remove(this.city.root);this.city.dispose();this.city=null;}
    this.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
    for(const vehicle of this.vehicleCache?.values()||[])disposeVehicle(vehicle);this.vehicleCache?.clear();
    const environmentTextures=new Set();for(const material of Object.values(this.environmentMaterials||{})){for(const value of Object.values(material))if(value?.isTexture)environmentTextures.add(value);material.dispose();}
    for(const texture of environmentTextures)texture.dispose();
    this.realSky?.dispose();this.environmentTarget?.dispose();this.renderer.dispose();
  }
}
