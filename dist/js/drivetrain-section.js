import * as THREE from 'three';

const TAU = 2 * Math.PI;
// These are categorical cycle markers. Their colors carry no measured
// temperature, stress, pressure or combustion-intensity values.
export const ENGINE_STROKES=Object.freeze([
  {id:'intake',label:'흡입',color:'#52b6ef'},
  {id:'compression',label:'압축',color:'#e5b949'},
  {id:'expansion',label:'팽창',color:'#ef7359'},
  {id:'exhaust',label:'배기',color:'#ad91dc'},
].map(Object.freeze));
export const ROADSTER_DRIVE_PARTS = ['battery','drive-front','drive-rear-left','drive-rear-right','power-electronics'];
export const ROADSTER_REFERENCE = 'https://petersen.org/pages/petersen-vehicle/2017-tesla-roadster-2';
export const ENGINE_LAYOUTS = {
  'honda-civic': {title:'시빅 EG6 · B16A 가로배치 직렬 4기통', banks:[0], throws:4, cc:1595, boreMm:81, strokeMm:77.4, timing:'belt', transverse:true, source:'https://www.honda.co.jp/factbook/auto/CIVIC/19910910/cv91-028.html'},
  'toyota-ae86': {title:'트레노 AE86 · 4A-GEU 직렬 4기통', banks:[0], throws:4, cc:1587, boreMm:81, strokeMm:77, timing:'belt', source:'https://www.toyota-global.com/company/history_of_toyota/75years/vehicle_lineage/car/id60009032/'},
  'nissan-gt-r': {title:'스카이라인 GT-R R34 · RB26DETT 직렬 6기통', banks:[0], throws:6, cc:2568, boreMm:86, strokeMm:73.7, timing:'belt', source:'https://www.nismo.co.jp/products/web_catalogue/engine_parts/head_gasket.html'},
  'mazda-miata-mx-5': {title:'MX-5 NA · 직렬 4기통', banks:[0], throws:4, cc:1597, boreMm:78, strokeMm:83.6, timing:'belt', source:'https://www.mazda.com/en/about/history/greatcar/roadster/03/'},
  bmw: {title:'M3 E30 · S14 직렬 4기통', banks:[0], throws:4, cc:2302, boreMm:93.4, strokeMm:84, timing:'chain', source:'https://www.press.bmwgroup.com/canada/article/attachment/T0030387EN/51014'},
  'toyota-supra-mk': {title:'수프라 RZ · 2JZ-GTE 직렬 6기통', banks:[0], throws:6, cc:2997, boreMm:86, strokeMm:86, timing:'belt', source:'https://assets.sia.toyota.com/publications/en/om/OM14524U/pdf/omsource/1996om/96supom/sect8/81.pdf'},
  ferrari: {title:'458 Spider · 90° V8', banks:[-Math.PI/4,Math.PI/4], throws:4, cc:4497, boreMm:94, strokeMm:81, timing:'chain', midRear:true, source:'https://www.ferrari.com/en-EN/auto/458-spider'},
};

function metal(color,metalness,roughness){
  return new THREE.MeshStandardMaterial({color,metalness,roughness});
}
function materials(){
  return {alloy:metal(0xb6c1c4,.67,.43),iron:metal(0x495359,.65,.38),steel:metal(0xc9ced0,.83,.24),
    copper:metal(0xc4743c,.69,.29),seal:metal(0x222629,.12,.68),orange:metal(0xe77526,.12,.46)};
}
function mesh(parent,name,geometry,material,x=0,y=0,z=0){
  const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);parent.add(m);m.receiveShadow=true;return m;
}
function group(parent,name,x=0,y=0,z=0){
  const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;
}
function cylinder(parent,name,radius,length,material,x,y,z,axis='z'){
  const m=mesh(parent,name,new THREE.CylinderGeometry(radius,radius,length,24),material,x,y,z);
  if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=-Math.PI/2;return m;
}
function ring(parent,name,radius,tube,material,x,y,z){
  return mesh(parent,name,new THREE.TorusGeometry(radius,tube,6,32),material,x,y,z);
}
function repeatAround(parent,name,geometry,material,n,radius,z,start=0,arc=TAU){
  const m=new THREE.InstancedMesh(geometry,material,n),dummy=new THREE.Object3D();m.name=name;
  for(let i=0;i<n;i++){
    const a=start+i*arc/n;dummy.position.set(radius*Math.cos(a),radius*Math.sin(a),z);dummy.rotation.z=a;dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);
  }
  m.computeBoundingBox();m.computeBoundingSphere();parent.add(m);return m;
}
// Pitch diameters and center spacing agree for both 12:36 stages. The tooth
// outline is a visualization of the pitch relationship rather than a gear drawing.
function gear(parent,name,teeth,pitchRadius,width,material,z,phase=0){
  const shape=new THREE.Shape();
  for(let i=0;i<teeth;i++)for(const [offset,scale] of [[0,.94],[.16,.94],[.32,1.055],[.62,1.055],[.83,.94]]){
    const a=(i+offset)*TAU/teeth+phase,x=pitchRadius*scale*Math.cos(a),y=pitchRadius*scale*Math.sin(a);
    if(i===0&&offset===0)shape.moveTo(x,y);else shape.lineTo(x,y);
  }
  shape.closePath();
  const holes=teeth>12?5:0;
  for(let i=0;i<holes;i++){const a=i*TAU/holes;const h=new THREE.Path();h.absarc(Math.cos(a)*pitchRadius*.55,Math.sin(a)*pitchRadius*.55,pitchRadius*.17,0,TAU,true);shape.holes.push(h);}
  return mesh(parent,name,new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:5}),material,0,0,z-width/2);
}
function cvAxle(parent,inner,outer,mat){
  const span=outer.clone().sub(inner),len=span.length(),axis=group(parent,'CV half-shaft');
  axis.position.copy(inner);axis.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),span.normalize());
  cylinder(axis,'half-shaft bar',.018,len,mat.steel,0,len/2,0,'y');
  const bootLength=Math.min(.09,len*.32);
  for(const end of [0,1]){
    const profile=[];
    for(let i=0;i<=12;i++){
      const t=i/12,y=end?len-t*bootLength:t*bootLength;
      profile.push(new THREE.Vector2(.038-.014*t+(i%2)*.005,y));
    }
    if(end)profile.reverse();
    mesh(axis,'corrugated CV boot',new THREE.LatheGeometry(profile,16),mat.seal);
    cylinder(axis,'joint clamp',.040,.009,mat.steel,0,end?len-.005:.005,0,'y');
  }
}

export function buildElectricDrive(part,wheels){
  const mat=materials(),rotors=[];
  for(const [id,indices,offset] of [['drive-front',[0,1],[1.15,.35,0]],['drive-rear-left',[2],[-.8,.35,-1.1]],['drive-rear-right',[3],[-.8,.35,1.1]]]){
    const g=part(id,offset);g.userData.powertrainSection=true;
    const hub=wheels[indices[0]],z=indices.length===2?0:hub.z*.42,front=indices.length===2;
    const direction=front?1:-1,spacing=.136;
    const motor=group(g,'sectioned traction motor',hub.x-direction*spacing*2,hub.y+.035,z);
    const shell=mesh(motor,'sectioned water jacket',new THREE.CylinderGeometry(.153,.153,.23,40,1,true,Math.PI*.72,Math.PI*1.27),mat.alloy);
    shell.rotation.x=Math.PI/2;mat.alloy.side=THREE.DoubleSide;
    const stator=mesh(motor,'stationary laminated stator',new THREE.CylinderGeometry(.13,.13,.205,40,1,true,Math.PI*.73,Math.PI*1.24),mat.iron);
    stator.rotation.x=Math.PI/2;mat.iron.side=THREE.DoubleSide;
    for(const face of [-.114,.114])ring(motor,'machined end flange',.143,.011,mat.alloy,0,0,face);
    // Racetrack end turns around longitudinal stator teeth; the open quarter
    // of the section exposes the rotor and its independent axis.
    const coilPoints=[[-.012,-.103],[-.018,-.083],[-.018,.083],[-.012,.103],[.012,.103],[.018,.083],[.018,-.083],[.012,-.103]]
      .map(([y,z])=>new THREE.Vector3(0,y,z));
    const coil=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints,true),30,.0045,6,true);
    repeatAround(motor,'stationary copper windings',coil,mat.copper,15,.116,0,Math.PI*.76,Math.PI*1.5);
    repeatAround(motor,'cast longitudinal ribs',new THREE.BoxGeometry(.012,.008,.21),mat.alloy,9,.155,0,Math.PI*.84,Math.PI*1.2);
    const rotor=group(motor,'rotor and input pinion');
    cylinder(rotor,'rotor stack',.079,.202,mat.iron,0,0,0);
    repeatAround(rotor,'rotor laminations witness lines',new THREE.BoxGeometry(.005,.012,.185),mat.steel,8,.080,0);
    cylinder(rotor,'motor shaft',.022,.38,mat.steel,0,0,.028);
    gear(rotor,'first pinion',12,.034,.033,mat.steel,.15);
    const middle=group(motor,'compound reduction shaft',direction*spacing,0,0);
    gear(middle,'first driven gear',36,.102,.033,mat.iron,.15,Math.PI/36);
    gear(middle,'second pinion',12,.034,.033,mat.steel,.202);
    cylinder(middle,'intermediate shaft',.018,.105,mat.steel,0,0,.18);
    const output=group(motor,'final drive output',direction*2*spacing,0,0);
    gear(output,'final driven gear',36,.102,.033,mat.alloy,.202,Math.PI/36);
    cylinder(output,'output shaft',.024,.49,mat.steel,0,0,0);
    if(front){const carrier=mesh(output,'differential carrier',new THREE.SphereGeometry(.080,20,12),mat.iron);carrier.scale.set(.88,.88,1.45);}
    for(const i of indices){
      const target=wheels[i],sign=Math.sign(target.z);
      cvAxle(g,new THREE.Vector3(hub.x,hub.y+.035,z+sign*.245),new THREE.Vector3(target.x,target.y,target.z-sign*.07),mat);
    }
    rotors.push({rotor,middle,gear:output,wheelIndices:indices,ratio:9});
  }
  return rotors;
}

export function buildEngineSection(part,layout,anchors){
  const mat=materials(),assembly=part('engine-assembly',[layout.midRear?-.9:.9,.8,0]);
  assembly.userData.powertrainSection=true;
  const axle=anchors[layout.midRear?2:0],engine=group(assembly,'sectioned engine',axle.x*(layout.midRear?.73:layout.transverse?1:.78),axle.y+.03,0);
  if(layout.transverse)engine.rotation.y=Math.PI/2;
  // Nominal drawing proportions. The pin and rod do not change length during motion.
  const spacing=layout.throws===6?.098:.105,throwRadius=layout.strokeMm/2000,boreRadius=layout.boreMm/2000;
  const rodLength=.134,bankGap=layout.banks.length===2?.017:0;
  const length=layout.throws*spacing,crank=group(engine,'crankshaft and webs'),cylinders=[],cams=[];
  for(let i=0;i<=layout.throws;i++)cylinder(crank,'main bearing journal',.022,.045,mat.steel,(i-layout.throws/2)*spacing,0,0,'x');
  const flywheel=group(crank,'flywheel and ring gear',-length/2-.027);
  flywheel.rotation.y=Math.PI/2;gear(flywheel,'starter ring',60,.107,.022,mat.iron,0);
  ring(flywheel,'machined flywheel rim',.091,.005,mat.steel,0,0,-.012);
  repeatAround(flywheel,'flywheel bolts',new THREE.CylinderGeometry(.004,.004,.008,6).rotateX(Math.PI/2),mat.steel,6,.032,-.014);
  const springCurve=[];
  for(let i=0;i<=36;i++){
    const t=i/36,a=TAU*4.5*t;
    springCurve.push(new THREE.Vector3(.006*Math.cos(a),t*.015,.006*Math.sin(a)));
  }
  const valveSpring=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springCurve),45,.0013,4,false);
  // A translucent sector only covers the open side of the cutaway. A slim
  // rim remains legible at top dead center when the gas space is smallest.
  const sectorAngle=Math.PI*.94,sectorStart=-sectorAngle/2;
  const chamberSection=new THREE.CylinderGeometry(boreRadius*.98,boreRadius*.98,.1,32,1,true,sectorStart,sectorAngle);
  const chamberLip=new THREE.CylinderGeometry(boreRadius*1.015,boreRadius*1.015,.0035,32,1,true,sectorStart,sectorAngle);
  // Compression TDC events span two turns; opposite strokes can share a
  // crank throw. Four-cylinder banks use a representative four-stroke sequence.
  const firingOrder=layout.throws===6?[1,5,3,6,2,4]:[1,3,4,2];
  const tdc=Array.from({length:layout.throws},(_,i)=>firingOrder.indexOf(i+1)*2*TAU/layout.throws);
  const phases=tdc.map(value=>-value);
  for(let i=0;i<layout.throws;i++){
    const x=((layout.throws-1)/2-i)*spacing,throwGroup=group(crank,'crank throw '+(i+1),x);
    throwGroup.rotation.x=phases[i];cylinder(throwGroup,'crank pin',.016,bankGap*.95+.046,mat.steel,0,throwRadius,0,'x');
    for(const side of [-1,1]){
      const cheek=mesh(throwGroup,'counterweight',new THREE.CylinderGeometry(.049,.049,.012,22),mat.iron,side*(.027+bankGap*.65),-.009,0);
      cheek.rotation.z=Math.PI/2;cheek.scale.x=1.26;
    }
  }
  for(const angle of layout.banks){
    const bank=group(engine,'cylinder bank');bank.rotation.x=angle;
    const stagger=bankGap*Math.sign(angle);
    const driveEnd=stagger+length/2+.039;
    timingPath(bank,driveEnd,layout.timing==='chain'?mat.iron:mat.seal);
    cylinder(crank,'crank timing wheel',.012,.015,mat.iron,driveEnd,0,0,'x');
    mesh(bank,'block cut face',new THREE.BoxGeometry(length+.02,.15,.013),mat.alloy,stagger,.102,-.057);
    mesh(bank,'cylinder head cut face',new THREE.BoxGeometry(length+.02,.045,.02),mat.iron,stagger,.218,-.052);
    for(const z of [-.027,.027]){
      const cam=group(bank,z>0?'intake camshaft':'exhaust camshaft',stagger,.252,z);
      cylinder(cam,'camshaft journal',.009,length+.018,mat.steel,0,0,0,'x');cams.push(cam);
      const sprocket=group(cam,'cam timing wheel',length/2+.039);
      sprocket.rotation.y=Math.PI/2;gear(sprocket,'timing teeth',24,.024,.012,mat.iron,0);
      for(let i=0;i<layout.throws;i++)for(const delta of [-.018,.018]){
        const peakAngle=tdc[i]+angle+(z>0?2.5:1.5)*Math.PI;
        const a=Math.PI-peakAngle/2,x=((layout.throws-1)/2-i)*spacing+delta;
        cylinder(cam,'cam lobe',.014,.012,mat.iron,x,.006*Math.cos(a),.006*Math.sin(a),'x');
      }
    }
    for(let i=0;i<layout.throws;i++){
      const x=((layout.throws-1)/2-i)*spacing+stagger;
      const liner=mesh(bank,'sectioned cylinder liner',new THREE.CylinderGeometry(boreRadius,boreRadius,.118,30,1,true,Math.PI*.64,Math.PI*1.08),mat.alloy,x,.149,0);
      liner.material.side=THREE.DoubleSide;
      const piston=group(bank,'piston '+(i+1),x);
      cylinder(piston,'piston crown and skirt',boreRadius-.0006,.044,mat.alloy,0,.009,0,'y');
      for(const y of [.020,.025])cylinder(piston,'compression ring',boreRadius-.0001,.0022,mat.iron,0,y,0,'y');
      cylinder(piston,'wrist pin',.009,.071,mat.steel,0,0,0,'x');
      const rod=group(bank,'connecting rod '+(i+1),x);
      mesh(rod,'forged connecting rod',new THREE.BoxGeometry(.012,rodLength,.016),mat.steel,0,rodLength/2,0);
      for(const [r,y] of [[.021,0],[.013,rodLength]]){const eye=ring(rod,'rod bearing',r,.005,mat.iron,0,y,0);eye.rotation.y=Math.PI/2;}
      const valves=[],springs=[];
      for(const intake of [false,true]){
        const z=intake?.027:-.027;
        const pair=group(bank,intake?'intake valves':'exhaust valves',x,.208,z);
        const springPair=group(bank,'valve return springs',x,.218,z);
        for(const dx of [-.018,.018]){
          cylinder(pair,'valve head',.011,.003,mat.steel,dx,0,0,'y');
          cylinder(pair,'valve stem',.003,.025,mat.steel,dx,.013,0,'y');
          cylinder(pair,'tappet',.008,.006,mat.iron,dx,.027,0,'y');
          mesh(springPair,'valve return spring',valveSpring,mat.iron,dx,0,0);
        }
        valves.push(pair);springs.push(springPair);
      }
      const indicator=group(bank,'four-stroke indicator',x);
      indicator.visible=false;
      const tint=new THREE.MeshBasicMaterial({transparent:true,opacity:.30,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,fog:false});
      tint.forceSinglePass=true;
      const chamber=mesh(indicator,'working stroke',chamberSection,tint,0,.17);
      chamber.scale.y=.40;
      const lip=mesh(indicator,'stroke marker',chamberLip,new THREE.MeshBasicMaterial({toneMapped:false,fog:false,side:THREE.DoubleSide}),0,.21);
      cylinders.push({piston,rod,valves,springs,indicator,chamber,lip,strokeIndex:-1,phase:phases[i]-angle,tdc:tdc[i]+angle});
    }
  }
  const sump=mesh(engine,'oil pan',new THREE.BoxGeometry(length+.045,.04,layout.banks.length===2?.21:.14),mat.iron,0,-.074,0);
  mesh(sump,'sump flange',new THREE.BoxGeometry(length+.06,.009,layout.banks.length===2?.222:.156),mat.alloy,0,.022,0);
  const rig={crank,cams,cylinders,throwRadius,rodLength,strokeDisplay:false};setEngineAngle(rig,0);return rig;
}

// The timing drive wraps around both cam wheels and the crank wheel. External
// tangents keep the return run clear of all three sprockets for each bank.
function timingPath(bank,x,material){
  const circles=[[0,0,.012],[.027,.252,.024],[-.027,.252,.024]];
  const tangents=circles.map(([u,v,r],i)=>{
    const [u1,v1,r1]=circles[(i+1)%3],du=u1-u,dv=v1-v,len=Math.hypot(du,dv),d=(r-r1)/len,h=Math.sqrt(1-d*d);
    return Math.atan2((d*dv-h*du)/len,(d*du+h*dv)/len);
  });
  const pos=[],indices=[];
  circles.forEach(([u,v,r],i)=>{
    const from=tangents[(i+2)%3],arc=(tangents[i]-from+TAU)%TAU;
    for(let j=0;j<=14;j++){
      const a=from+arc*j/14;
      for(const dx of [-.007,.007])pos.push(x+dx,v+(r+.001)*Math.sin(a),u+(r+.001)*Math.cos(a));
    }
  });
  for(let i=0,n=pos.length/3;i<n;i+=2){const j=(i+2)%n;indices.push(i,j,j+1,i,j+1,i+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();
  const loop=mesh(bank,'timing drive loop',g,material);loop.material.side=THREE.DoubleSide;
}

function setEngineAngle(rig,theta,refresh=false){
  if(!refresh&&rig.lastAngle===theta)return;
  rig.lastAngle=theta;
  rig.crank.rotation.x=theta;
  for(const cam of rig.cams)cam.rotation.x=theta/2;
  for(const cylinder of rig.cylinders){
    const {piston,rod,valves,springs,phase,tdc}=cylinder;
    const a=theta+phase,pinY=rig.throwRadius*Math.cos(a),pinZ=rig.throwRadius*Math.sin(a);
    const rise=Math.sqrt(rig.rodLength**2-pinZ**2);
    rod.position.y=pinY;rod.position.z=pinZ;rod.rotation.x=Math.atan2(-pinZ,rise);piston.position.y=pinY+rise;
    const cycle=((theta-tdc)%(2*TAU)+2*TAU)%(2*TAU);
    if(rig.strokeDisplay){
      const index=(Math.floor(cycle/Math.PI)+2)%4;
      if(index!==cylinder.strokeIndex){
        cylinder.strokeIndex=index;
        cylinder.chamber.material.color.set(ENGINE_STROKES[index].color);
        cylinder.lip.material.color.copy(cylinder.chamber.material.color);
      }
      const crown=piston.position.y+.031,head=cylinder.lip.position.y;
      cylinder.chamber.position.y=(crown+head)/2;
      cylinder.chamber.scale.y=(head-crown)/.1;
    }
    // An ideal cycle with closed valves on compression and expansion. The
    // opening profile is illustrative (no OEM timing or valve overlap data).
    for(let i=0;i<2;i++){
      const start=(i+1)*Math.PI,t=cycle-start;
      const lift=t>0&&t<Math.PI?.008*Math.sin(t)**2:0;
      valves[i].position.y=.208-lift;springs[i].scale.y=1-lift/.015;
    }
  }
}

export function setEngineStrokeDisplay(vehicle,enabled){
  const rig=vehicle?.engineSection;
  if(!rig)return false;
  const show=!!enabled;
  if(rig.strokeDisplay!==show){
    rig.strokeDisplay=show;
    for(const cylinder of rig.cylinders)cylinder.indicator.visible=show;
    if(show)setEngineAngle(rig,rig.lastAngle,true);
  }
  return show;
}

export function updateDrivetrainSection(vehicle,wheelAngles,previewCrankRadians=null){
  for(const unit of vehicle.driveRotors||[]){
    let spin=0;
    for(const i of unit.wheelIndices)spin+=wheelAngles[i]||0;
    spin/=unit.wheelIndices.length;
    if(previewCrankRadians!==null)spin=previewCrankRadians/unit.ratio;
    unit.rotor.rotation.z=spin*unit.ratio;unit.middle.rotation.z=-spin*3;unit.gear.rotation.z=spin;
  }
  if(vehicle.engineSection)setEngineAngle(vehicle.engineSection,previewCrankRadians??0);
}
