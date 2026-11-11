import * as THREE from 'three';

// A diagram over the real rendered vehicle. This module never changes a physics
// state: metre marks, spring travel and force arrows all read the solver.
const UP=new THREE.Vector3(0,1,0), DOWN=new THREE.Vector3(0,-1,0);
const COLORS={gravity:0xff9478,thrust:0x78efd3,ground:0x89bcff,height:0xcbd9e0,brake:0xffbf75};
const TRACE_CAPACITY=768;
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;

/** One scale for all force vectors. Retain it until a force would exceed 3 m;
 * then increase to a readable 1/2/5 decade. No minimum-length fake forces. */
export function landingForceScale(maximum,previous=10000){
  const old=Math.max(1,finite(previous,10000)),force=Math.max(0,finite(maximum));
  if(force<=old*3)return old;
  const needed=force/2.5,decade=10**Math.floor(Math.log10(needed));
  return [1,2,5,10].map(n=>n*decade).find(n=>n>=needed)||needed;
}

/** Keep at most 13 real metre ticks near the vehicle, even for unrestricted
 * launch heights. The ruler is never squeezed to imply a false spatial scale. */
export function landingRulerWindow(height=3,clearance=0){
  const current=Math.max(0,finite(clearance)),release=Math.max(0,finite(height,3));
  if(Math.max(release,current)<=10)return {start:0,end:Math.max(4,Math.ceil(Math.max(release,current))+1),step:1};
  const start=Math.max(0,Math.floor(current)-4);
  return {start,end:start+12,step:1};
}

function makeText(text,color,width=1.15){
  // Geometry contracts are tested headlessly; the live browser adds a texture.
  if(typeof document==='undefined'){const group=new THREE.Group();group.userData.text=text;return group;}
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const context=canvas.getContext('2d');
  context.clearRect(0,0,256,64);context.fillStyle='rgba(11,27,35,.82)';
  context.fillRect(0,5,256,54);context.font='600 30px system-ui, sans-serif';
  context.fillStyle='#'+new THREE.Color(color).getHexString();context.textAlign='center';context.textBaseline='middle';context.fillText(text,128,33);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);sprite.scale.set(width,width/4,1);sprite.renderOrder=8;
  sprite.userData.text=text;return sprite;
}
function replaceText(old,text,color,width){
  const parent=old.parent,position=old.position.clone();old.material?.map?.dispose();old.material?.dispose();old.removeFromParent();
  const label=makeText(text,color,width);label.position.copy(position);parent?.add(label);return label;
}
// One digit atlas and one mesh serve every ruler tick. Fast high-altitude drops
// update only small vertex buffers; they never allocate/upload text canvases.
const TICK_GLYPHS='0123456789m.-+e ';
function tickTextMesh(){
  let texture=null;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=64;
    const context=canvas.getContext('2d');context.clearRect(0,0,1024,64);context.font='600 42px system-ui, sans-serif';context.textAlign='center';context.textBaseline='middle';context.lineWidth=7;context.strokeStyle='rgba(11,27,35,.9)';context.fillStyle='#cbd9e0';
    [...TICK_GLYPHS].forEach((char,index)=>{context.strokeText(char,index*64+32,33);context.fillText(char,index*64+32,33);});
    texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(13*24*6*3),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('offset',new THREE.BufferAttribute(new Float32Array(13*24*6*2),2).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(13*24*6*2),2).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.ShaderMaterial({uniforms:{map:{value:texture}},transparent:true,depthWrite:false,depthTest:false,toneMapped:false,
    vertexShader:'attribute vec2 offset; varying vec2 vUv; void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);p.xy+=offset;gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);}' });
  // Register the texture for the common disposal path as well as the uniform.
  material.map=texture;
  const result=new THREE.Mesh(geometry,material);result.frustumCulled=false;result.renderOrder=8;geometry.setDrawRange(0,0);return result;
}
function updateTickText(mesh,values){
  const {position,offset,uv}=mesh.geometry.attributes;
  const corners=[[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]];
  let count=0;
  for(const value of values){
    const text=(value>=1e6?value.toExponential(2):String(value))+' m';
    [...text].slice(0,24).forEach((char,index)=>{
      const slot=Math.max(0,TICK_GLYPHS.indexOf(char));
      for(const [x,y]of corners){
        position.setXYZ(count,-.22,value,0);offset.setXY(count,(index-text.length+x)*.16,(y-.5)*.32);
        uv.setXY(count,(slot+x)/16,y);count++;
      }
    });
  }
  position.needsUpdate=offset.needsUpdate=uv.needsUpdate=true;mesh.geometry.setDrawRange(0,count);
}
function lineSegments(positions,color,opacity=1){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false});
  return new THREE.LineSegments(geometry,material);
}
function rectangle(width,depth,color){
  const x=width/2,z=depth/2;
  return lineSegments([-x,0,-z,x,0,-z,x,0,-z,x,0,z,x,0,z,-x,0,z,-x,0,z,-x,0,-z],color,.72);
}
function springLine(){
  const points=[];for(let i=0;i<=80;i++){const t=i/80,angle=t*Math.PI*12;points.push(new THREE.Vector3(Math.cos(angle)*.075,t,Math.sin(angle)*.075));}
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xb8d9e5,transparent:true,opacity:.85,depthWrite:false,toneMapped:false}));
}

export class LandingVisual {
  constructor(){
    this.root=new THREE.Group();this.root.name='landing physics diagram';this.root.visible=false;
    this.enabled=true;this.config=null;this.scale=10000;this.metrics={gravityN:0,thrustN:0,thrustVerticalN:0,groundN:0,groundVerticalN:0,forceScaleNPerM:this.scale,clearance:0,compression:0,velocityY:0};
    this._position=new THREE.Vector3();this._direction=new THREE.Vector3();this._thrust=new THREE.Vector3();this._right=new THREE.Vector3(1,0,0);this._point=new THREE.Vector3();
    this.forces=new THREE.Group();this.root.add(this.forces);this.forceArrows={};this.forceLabels={};
    for(const [key,text]of [['gravity','mg'],['thrust','T'],['ground','N']]){
      const arrow=new THREE.ArrowHelper(key==='gravity'?DOWN:UP,new THREE.Vector3(),1,COLORS[key],.17,.09);
      arrow.name='landing '+key+' force';arrow.line.material.toneMapped=false;arrow.cone.material.toneMapped=false;
      this.forces.add(arrow);this.forceArrows[key]=arrow;
      const label=makeText(text,COLORS[key],.5);this.forces.add(label);this.forceLabels[key]=label;
    }
    this.ruler=new THREE.Group();this.root.add(this.ruler);this.rulerLines=lineSegments(new Float32Array(14*2*3),COLORS.height,.75);this.rulerLines.frustumCulled=false;this.ruler.add(this.rulerLines);this.tickLabels=[];this.tickText=tickTextMesh();this.ruler.add(this.tickText);
    this.heightMarker=rectangle(5.6,3.4,COLORS.height);this.brakeMarker=rectangle(6.0,3.8,COLORS.brake);
    this.heightLabel=makeText('h₀',COLORS.height,.75);this.brakeLabel=makeText('hᵦ',COLORS.brake,.75);
    this.heightMarker.add(this.heightLabel);this.brakeMarker.add(this.brakeLabel);this.heightLabel.position.set(-3.35,0,-1.8);this.brakeLabel.position.set(-3.35,0,2.1);
    this.root.add(this.heightMarker,this.brakeMarker);
    this.clearanceLine=lineSegments([0,0,0,0,1,0],COLORS.thrust,.9);this.root.add(this.clearanceLine);
    this.origin=rectangle(5.6,3.4,0x7a9caa);this.origin.position.y=.025;this.root.add(this.origin);
    this.tracePositions=new Float32Array(TRACE_CAPACITY*3);this.traceGeometry=new THREE.BufferGeometry();this.traceGeometry.setAttribute('position',new THREE.BufferAttribute(this.tracePositions,3).setUsage(THREE.DynamicDrawUsage));this.traceGeometry.setDrawRange(0,0);
    this.trace=new THREE.Line(this.traceGeometry,new THREE.LineBasicMaterial({color:0xd4e1e7,transparent:true,opacity:.6,depthWrite:false,toneMapped:false}));this.trace.frustumCulled=false;this.trace.name='centre of mass render trace';this.root.add(this.trace);
    this.traceCount=0;this.lastTraceTime=-Infinity;this.lastSimTime=-Infinity;
    this.contactMarks=[];this.springs=[];
    const ringGeometry=new THREE.RingGeometry(.19,.23,24);ringGeometry.rotateX(-Math.PI/2);
    for(let i=0;i<4;i++){
      const ring=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:COLORS.ground,transparent:true,opacity:.65,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));ring.name='wheel contact '+i;this.root.add(ring);this.contactMarks.push(ring);
      const spring=springLine();spring.name='wheel compression '+i;this.root.add(spring);this.springs.push(spring);
    }
  }

  setExperiment(config){
    this.config=config?{height:Math.max(0,finite(Number(config.height),3)),brakeHeight:Math.max(0,finite(Number(config.brakeHeight))),method:config.method||'free'}:null;
    this.scale=10000;this.resetTrace();
    this.heightMarker.visible=!!this.config;
    this.brakeMarker.visible=this.config?.method==='brake';
    if(this.config){
      this.heightMarker.position.y=this.config.height;this.brakeMarker.position.y=this.config.brakeHeight;
      const heightText=value=>value>=1e5?value.toExponential(2):String(Number(value.toPrecision(5)));
      this.heightLabel=replaceText(this.heightLabel,'h₀ '+heightText(this.config.height)+' m',COLORS.height,1.45);
      this.brakeLabel=replaceText(this.brakeLabel,'hᵦ '+heightText(this.config.brakeHeight)+' m',COLORS.brake,1.45);
    }
    this.rulerKey='';
  }
  setVisible(visible){this.enabled=!!visible;if(!this.enabled)this.root.visible=false;}
  resetTrace(){this.traceCount=0;this.traceGeometry.setDrawRange(0,0);this.lastTraceTime=-Infinity;this.lastSimTime=-Infinity;}

  updateRuler(height,clearance,x,z){
    const range=landingRulerWindow(height,clearance),key=range.start+':'+range.end;
    this.ruler.position.set(x-3.25,0,z-2.1);
    if(key===this.rulerKey)return;
    this.rulerKey=key;
    this.tickLabels.length=0;
    const a=this.rulerLines.geometry.attributes.position;
    a.setXYZ(0,0,range.start,0);a.setXYZ(1,0,range.end,0);
    let count=2;
    const ticks=Math.min(13,Math.max(1,Math.floor((range.end-range.start)/range.step)+1));
    for(let index=0;index<ticks;index++){
      const h=range.start+index*range.step;
      a.setXYZ(count++,0,h,0);a.setXYZ(count++,.32,h,0);
      this.tickLabels.push(h);
    }
    a.needsUpdate=true;this.rulerLines.geometry.setDrawRange(0,count);updateTickText(this.tickText,this.tickLabels);
  }

  update(sim,view,camera,mode='lab'){
    this.root.visible=mode==='lab'&&this.enabled;if(!this.root.visible)return;
    const state=view?.state||sim.state,wheels=view?.wheels||sim.wheels;
    const position=state.pos,q=state.q;
    let clearance=Infinity,compression=0;
    for(const w of wheels){
      this._point.copy(w.pos).applyQuaternion(q).add(position);
      clearance=Math.min(clearance,this._point.y-sim.params.wheelRadius);
      compression=Math.max(compression,finite(w.compression));
    }
    clearance=finite(clearance);
    // Force values read the un-interpolated solver, unlike the smoothly moving
    // geometry. In particular an airborne wheel must never show a ghost load.
    this._thrust.set(0,0,0);
    for(const thruster of sim.thrusters||[]){this._direction.copy(thruster.dir).applyQuaternion(sim.state.q);this._thrust.addScaledVector(this._direction,Math.max(0,finite(thruster.force)));}
    const gravity=Math.max(0,finite(sim.mass)*finite(sim.params.gravity)),thrust=this._thrust.length(),ground=Math.max(0,finite(sim.groundForceN));
    this.scale=landingForceScale(Math.max(gravity,thrust,ground),this.scale);
    Object.assign(this.metrics,{gravityN:gravity,thrustN:thrust,thrustVerticalN:this._thrust.y,groundN:ground,groundVerticalN:ground,forceScaleNPerM:this.scale,clearance,compression,velocityY:state.vel.y});
    // Displace the parallel force diagram beside the vehicle, rather than
    // pretending the displaced arrows show their physical points of application.
    this._right.set(1,0,0).applyQuaternion(camera?.quaternion||new THREE.Quaternion());this._right.y=0;this._right.normalize();
    if(this._right.lengthSq()<.01)this._right.set(1,0,0);
    const diagramHeight=Math.max(position.y+.9,gravity/this.scale+.35);
    this._position.copy(position).addScaledVector(this._right,-(finite(sim.params.bodyWidth,2)*.5+1.4));this._position.y=diagramHeight;
    for(const [index,key,value]of [[0,'gravity',gravity],[1,'thrust',thrust],[2,'ground',ground]]){
      const arrow=this.forceArrows[key],label=this.forceLabels[key],length=value/this.scale;
      arrow.visible=label.visible=value>1;
      if(!arrow.visible)continue;
      arrow.position.copy(this._position).addScaledVector(this._right,(index-1)*.65);
      if(key==='gravity')this._direction.copy(DOWN);else if(key==='thrust')this._direction.copy(this._thrust).normalize();else this._direction.copy(UP);
      arrow.setDirection(this._direction);arrow.setLength(length,Math.min(.2,length*.24),Math.min(.11,length*.13));
      label.position.copy(arrow.position).addScaledVector(this._direction,length+.18);
    }
    const originX=this.config?0:position.x,originZ=this.config?0:position.z;
    this.updateRuler(this.config?.height??3,clearance,originX,originZ);
    this.origin.position.set(originX,.025,originZ);
    this.heightMarker.visible=!!this.config;this.brakeMarker.visible=this.config?.method==='brake';
    this.clearanceLine.position.set(originX-3.25,0,originZ-2.05);this.clearanceLine.scale.y=Math.max(0,clearance);this.clearanceLine.visible=clearance>.005;
    for(let i=0;i<4;i++){
      const wheel=wheels[i],physical=sim.wheels[i],mark=this.contactMarks[i],spring=this.springs[i];
      if(!wheel){mark.visible=spring.visible=false;continue;}
      this._point.copy(wheel.pos).applyQuaternion(q).add(position);
      mark.position.set(this._point.x,(finite(physical?.surfaceY))+.028,this._point.z);
      mark.visible=!!physical?.grounded&&(physical.load||0)>1;
      mark.material.opacity=.25+.55*Math.min(1,(physical?.load||0)/Math.max(1,gravity/4));
      // Place a small measuring spring just outside each wheel. Its actual
      // length change equals solver travel (no exaggerated compression).
      this._point.copy(wheel.pos);this._point.z+=Math.sign(wheel.pos.z||1)*.35;this._point.y+=finite(wheel.compression);
      spring.position.copy(this._point).applyQuaternion(q).add(position);spring.quaternion.copy(q);
      spring.scale.y=Math.max(.015,.55-finite(wheel.compression));spring.visible=true;
      spring.material.color.setHex(finite(wheel.compression)>.22?0xff9478:0xb8d9e5);
    }
    const time=finite(sim.state.time);
    if(time<this.lastSimTime-1e-7)this.resetTrace();this.lastSimTime=time;
    if(this.config&&(time-this.lastTraceTime>=.025||this.traceCount===0)){
      if(this.traceCount===TRACE_CAPACITY){this.tracePositions.copyWithin(0,3);this.traceCount--;}
      const i=this.traceCount++*3;this.tracePositions[i]=position.x;this.tracePositions[i+1]=position.y;this.tracePositions[i+2]=position.z;
      this.traceGeometry.attributes.position.needsUpdate=true;this.traceGeometry.setDrawRange(0,this.traceCount);this.lastTraceTime=time;
    }
  }

  dispose(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    this.root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){materials.add(material);if(material.map)textures.add(material.map);}});
    for(const value of [...geometries,...textures,...materials])value.dispose();this.root.removeFromParent();this.root.clear();
  }
}
