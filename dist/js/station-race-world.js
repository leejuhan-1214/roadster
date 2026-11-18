import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RACE_COURSE,sampleCourse} from './station-race.js?v=20261118-flight1531';
import {AIR_GATES,airLaneOffset} from './station-race-air.js?v=20261118-flight1531';

const halfWidth=RACE_COURSE.width/2;
const white=0xf1eee1,red=0xc63e37,dark=0x212c32,steel=0x829499,mint=0x5cf2cb;
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});

function mesh(parent,geometry,mat,name){
  const object=new THREE.Mesh(geometry,mat);
  object.name=name;object.receiveShadow=true;parent.add(object);
  return object;
}

// Every strip closes at the same arc length used by the AI and checkpoint model.
function ribbon(root,name,mat,inner,outer,height,segmentLength,tileSize=3,alternate=false){
  const count=Math.ceil(RACE_COURSE.length/segmentLength);
  const positions=[],uv=[],indices=[];
  for(let i=0;i<=count;i++){
    const s=i*RACE_COURSE.length/count;
    for(const side of [inner,outer]){
      const {x,z}=sampleCourse(s,side);positions.push(x,height,z);uv.push(x/tileSize,z/tileSize);
    }
    if(i<count&&(!alternate||i%2===0)){
      const a=2*i;indices.push(a,a+1,a+2,a+1,a+3,a+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(root,geometry,mat,name);
}

// Follow the same corner vertices in the rendered walls and their collision prisms.
function boundary(root,obstacles,side){
  const near=side*(halfWidth+2.4),far=side*(halfWidth+2.84),height=.84;
  const count=Math.ceil(RACE_COURSE.length/5),positions=[],indices=[];
  for(let i=0;i<=count;i++){
    const s=i*RACE_COURSE.length/count;
    const a=sampleCourse(s,near),b=sampleCourse(s,far);
    positions.push(a.x,0,a.z,a.x,height,a.z,b.x,height,b.z,b.x,0,b.z);
    if(i===count)continue;
    const j=i*4;
    for(let k=0;k<3;k++)indices.push(j+k,j+k+1,j+k+4,j+k+1,j+k+5,j+k+4);
    const e=(i+1)*RACE_COURSE.length/count,c=sampleCourse(e,far),d=sampleCourse(e,near);
    const footprint=[a,b,c,d].map(p=>[p.x,p.z]);
    const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    obstacles.push({kind:'prism',id:'race-barrier-'+side+'-'+i,footprint,
      center:[(x0+x1)/2,height/2,(z0+z1)/2],size:[x1-x0,height,z1-z0]});
  }
  // The outside wall's winding is opposite the inside wall's winding.
  if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();mesh(root,g,material(0xa4abab,{side:THREE.DoubleSide}),'Circuit safety wall');
}

function billBoard(root,text,w,h,x,y,z,heading,background,foreground){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');
  canvas.width=1024;canvas.height=Math.max(64,Math.round(1024*h/w));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=foreground;ctx.font='bold '+Math.round(canvas.height*.62)+'px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,canvas.width/2,canvas.height*.53,canvas.width*.94);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const panel=mesh(root,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}),text);
  panel.position.set(x,y,z);panel.rotation.y=heading-Math.PI/2;
}

// Static gantry, grandstands, grid paint and pit buildings share one draw.
function facilities(root,obstacles){
  const blocks=[],tmp=new THREE.Object3D();
  function box(x,y,z,l,h,w,color,yaw=0){
    tmp.position.set(x,y,z);tmp.rotation.set(0,yaw,0);tmp.scale.set(l,h,w);tmp.updateMatrix();
    blocks.push([tmp.matrix.clone(),color]);
  }
  for(const side of [-1,1])box(0,3.2,side*(halfWidth+1.4),.6,6.4,.6,steel);
  box(0,6.4,0,.55,1.4,2*halfWidth+4,dark);
  for(const side of [-1,1])obstacles.push({id:'starting-gantry-post-'+side,center:[0,3.2,side*(halfWidth+1.4)],size:[.6,6.4,.6]});
  obstacles.push({id:'starting-gantry-header',center:[0,6.4,0],size:[.55,1.4,2*halfWidth+4]});
  billBoard(root,'STATION CIRCUIT',16,1.35,-.29,6.4,0,0,'#152b30','#9df5dc');
  const columns=32,size=2*halfWidth/columns;
  for(let column=0;column<columns;column++)for(let row=0;row<3;row++)
    box((row-1)*size,.014,-halfWidth+(column+.5)*size,size,.014,size,(row+column)%2===0?white:dark);
  for(const [s,side] of [[-6,-3.15],[-4,3.15],[-12,-3.15],[-14,3.15]]){
    const p=sampleCourse(s,side);
    box(p.x+2.1,.019,p.z,.15,.012,2.85,white);
    for(const sign of [-1,1])box(p.x+1.57,.019,p.z+sign*1.37,1.15,.012,.12,white);
  }
  for(const center of [-26,14]){
    const front=halfWidth+7;
    for(let i=0;i<5;i++){
      const y=.4+i*.63,z=front+i*1.12;
      box(center,y/2,z,33,y,1.12,0x939b9a);
      for(let row=0;row<3;row++)
        box(center+(row-1)*10.6,y+.12,z+.14,9.4,.22,.55,(row+i)%3?0x406b76:0xc76d48);
    }
    box(center,6.65,front+3.7,36,.32,10.6,0x7e8f90);
    for(const dx of [-15,-5,5,15])box(center+dx,3.2,front+6,.22,6.4,.25,steel);
  }
  const pit=-(halfWidth+8.6);
  box(-3,1.8,pit,35,3.6,7,0xa9aca6);box(-3,3.82,pit,36,.38,8.2,steel);
  for(let i=0;i<7;i++)box(-18+i*5,1.45,pit+3.52,4,2.9,.1,0x394e55);
  box(17,3.75,pit,6.1,7.5,6.75,0xb8aaa0);box(17,6,pit+3.38,5.8,1.9,.12,0x344e58);
  box(17,7.65,pit,7,.35,7.8,white);
  for(const gate of RACE_COURSE.gates.slice(1)){
    const p=sampleCourse(gate.distance,halfWidth+3.6);
    box(p.x,1.45,p.z,.15,2.9,.17,steel,p.heading);
    billBoard(root,String(gate.index).padStart(2,'0'),1.45,.88,p.x,2.62,p.z,p.heading,'#1b4146','#c8fff0');
  }
  // Warn on the approach to each bend. Place boards outside the safety wall.
  let onBend=false;
  for(let s=0;s<RACE_COURSE.length;s+=3){
    const p=sampleCourse(s),ahead=sampleCourse(s+3);
    const turning=Math.abs(Math.sin(ahead.heading-p.heading))>.015;
    if(turning&&!onBend){
      const sign=sampleCourse(s-4,halfWidth+3.4);
      box(sign.x,1.5,sign.z,.2,3,.22,steel,sign.heading);
      billBoard(root,'❮  ❮  ❮',4.1,1.48,sign.x,2.75,sign.z,sign.heading,'#182429','#ffe07a');
    }
    onBend=turning;
  }
  for(let i=0;i<15;i++){
    const d=i*RACE_COURSE.length/15,p=sampleCourse(d,halfWidth+6.7);
    box(p.x,5,p.z,.18,10,.18,steel,p.heading);
    box(p.x,10,p.z,1.8,.22,1.2,0xc1cbca,p.heading);
  }
  const instance=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(0xffffff),blocks.length);
  blocks.forEach(([matrix,color],i)=>{instance.setMatrixAt(i,matrix);instance.setColorAt(i,new THREE.Color(color));});
  instance.name='Grandstands, pit lane and start grid';instance.castShadow=instance.receiveShadow=true;root.add(instance);
}

function hills(root){
  const positions=[],colors=[],land=new THREE.Color(),tri=(a,b,c,color)=>{
    positions.push(...a,...b,...c);land.setHex(color);for(let i=0;i<3;i++)colors.push(land.r,land.g,land.b);
  };
  for(let i=0;i<40;i++){
    const k=i/40*2*Math.PI,j=(i+1)/40*2*Math.PI;
    const p=(t,r,y)=>[Math.cos(t)*r,y,Math.sin(t)*r-48];
    const crest=t=>26+12*Math.sin(t*5+1)+7*Math.sin(t*9);
    const a=p(k,245,-.4),b=p(j,245,-.4),c=p(k,355,crest(k)),d=p(j,355,crest(j));
    tri(a,c,d,0x72897a);tri(a,d,b,0x758a79);
    const e=p(k,460,crest(k)*.42),f=p(j,460,crest(j)*.42);
    tri(c,e,f,0x82938a);tri(c,f,d,0x81928a);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  mesh(root,geo,material(0xffffff,{vertexColors:true,side:THREE.DoubleSide,flatShading:true}),'Distant hills');
}

function turfMaterial(){
  const size=128,pixels=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++){
    const x=i%size,y=Math.floor(i/size);
    const grain=((Math.imul(i+7,0x9e3779b1)>>>20)/4095-.5)*17;
    const tone=grain+4*Math.sin(2*Math.PI*x/size)+2*Math.cos(4*Math.PI*y/size);
    pixels.set([88+tone,105+tone,69+tone*.7,255],i*4);
  }
  const map=new THREE.DataTexture(pixels,size,size);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(110,110);
  map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  return material(0xffffff,{map});
}

// Trees stand beyond the track walls. Reuse the Seoul library's middle-distance
// geometry and atlas; the whole circuit submits one draw per tree species.
function tracksideTrees(root,library){
  const grove=new THREE.Group();
  if(!library)return grove;
  const matrix=new THREE.Object3D(),tint=new THREE.Color();
  const placements=[[],[]];
  for(let i=0;i<64;i++){
    const outer=i<44,k=outer?i:i-44;
    const distance=(k+.32)*RACE_COURSE.length/(outer?44:20);
    const side=outer?34+9*Math.sin(i*1.8):-27-5*Math.sin(i*2.3);
    const p=sampleCourse(distance,side);
    if(Math.abs(p.x)<40&&p.z>-28&&p.z<30)continue;
    placements[i%2].push({p,i});
  }
  for(const [index,species] of ['zelkova','pine'].entries()){
    const variant=library.variant(species,0),points=placements[index];
    for(const part of variant.levels[1]){
      const trees=new THREE.InstancedMesh(part.geometry,part.material,points.length);
      trees.name='Circuit '+species;trees.receiveShadow=true;
      points.forEach(({p,i},n)=>{
        matrix.position.set(p.x,-.03,p.z);matrix.rotation.y=i*2.4;
        matrix.scale.setScalar((6.8+4.6*(.5+.5*Math.sin(i*4.94)))/variant.height);matrix.updateMatrix();
        trees.setMatrixAt(n,matrix.matrix);trees.setColorAt(n,tint.setScalar(.85+.11*Math.cos(i)));
      });
      trees.computeBoundingSphere();grove.add(trees);
    }
  }
  root.add(grove);return grove;
}

// Longitudinal cross-sections let the low-detail rivals retain a coupe silhouette.
function shell(sections){
  const positions=[],indices=[];
  for(const [x,bottom,top,width,roofWidth] of sections)
    positions.push(x,bottom,-width,x,top,-roofWidth,x,top,roofWidth,x,bottom,width);
  indices.push(0,2,1,0,3,2);
  for(let i=0;i<sections.length-1;i++)for(let k=0;k<4;k++){
    const a=i*4+k,b=i*4+(k+1)%4;indices.push(a,b,a+4,b,b+4,a+4);
  }
  const n=positions.length/3-4;indices.push(n,n+1,n+2,n,n+2,n+3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}

// The aqua marks are optical timing gates, open to aircraft and road cars.
// All dimensions use the same apertures tested by the sporting logic.
function airCourse(root){
  const group=new THREE.Group();group.name='Roadster air route';root.add(group);
  const frames=[];
  for(const gate of AIR_GATES){
    const p=sampleCourse(RACE_COURSE.gates[gate.index].distance,gate.lateral);
    const frame=new THREE.Group();frame.name='Air gate '+gate.index;frame.position.set(p.x,0,p.z);frame.rotation.y=p.heading;
    group.add(frame);
    const parts=[];
    const bar=(y,z,h,w)=>parts.push(new THREE.BoxGeometry(.16,h,w).translate(0,y,z));
    for(const sign of [-1,1]){
      const lateral=sign*(gate.halfWidth+.10);
      const side=(gate.maxY-gate.minY)/2-.25;
      for(const edge of [-1,1])bar((gate.minY+gate.maxY)/2+edge*(side/2+.25),lateral,side,.20);
      bar(gate.maxY+.10,sign*(gate.halfWidth/2+.28),.20,gate.halfWidth-.36);
      bar(gate.minY-.07,sign*(gate.halfWidth/2+.28),.14,gate.halfWidth-.36);
    }
    const geo=mergeGeometries(parts);
    for(const part of parts)part.dispose();
    mesh(frame,geo,material(0x54deef,{emissive:0x196c86,emissiveIntensity:.9,roughness:.38}),'Air timing aperture');
    frames.push(frame);
  }
  const dashes=[];
  for(let distance=0;distance<RACE_COURSE.length;distance+=5){
    const offset=airLaneOffset(distance,RACE_COURSE.length);
    if(offset===null)continue;
    const p=sampleCourse(distance,offset);
    dashes.push(new THREE.BoxGeometry(1.6,.016,.19).rotateY(p.heading).translate(p.x,.032,p.z));
  }
  const path=mergeGeometries(dashes);
  for(const piece of dashes)piece.dispose();
  mesh(group,path,material(0x5bb9c8),'Aerial route ground trace');
  const sign=sampleCourse(RACE_COURSE.length*.355,halfWidth+3.8);
  billBoard(group,'공중 게이트  ·  SPACE ↑',7.3,1.4,sign.x,3.18,sign.z,sign.heading,'#113746','#94f2ff');
  return frames;
}

function rivalCar(color){
  const root=new THREE.Group(),wheels=[];
  root.name='AI GT';
  const paint=material(color,{roughness:.34,metalness:.5}),glass=material(0x20303d,{roughness:.19,metalness:.65});
  const body=mesh(root,shell([[-2.16,.38,.82,.78,.76],[-1.65,.32,.96,.99,.87],[-.55,.31,1.0,.96,.88],[.65,.30,.94,.96,.87],[1.7,.32,.79,.98,.86],[2.2,.39,.64,.81,.75]]),paint,'GT bodywork');
  body.castShadow=true;
  mesh(root,shell([[-1.55,.91,.92,.80,.78],[-.79,.92,1.39,.82,.58],[-.05,.91,1.4,.83,.60],[.89,.89,.92,.80,.77]]),glass,'Windshield and side glass').castShadow=true;
  function parts(name,mat,boxes){
    const sources=boxes.map(([x,y,z,l,h,w])=>new THREE.BoxGeometry(l,h,w).translate(x,y,z));
    const geometry=mergeGeometries(sources);sources.forEach(g=>g.dispose());return mesh(root,geometry,mat,name);
  }
  parts('Roof and rear wing pylons',paint,[[-.42,1.404,0,.8,.05,1.2],[-1.72,.98,-.56,.12,.35,.1],[-1.72,.98,.56,.12,.35,.1]]).castShadow=true;
  parts('Splitter, wing and diffuser',material(0x172024),[[1.92,.32,0,.55,.08,1.85],[-1.85,1.18,0,.45,.095,2.12],[-2.06,.37,0,.32,.14,1.75]]).castShadow=true;
  parts('Headlamps',material(0xf0f0d9,{emissive:0xbbc9bc,emissiveIntensity:.5}),[[2.13,.64,-.62,.09,.09,.4],[2.13,.64,.62,.09,.09,.4]]);
  parts('Tail lamps',material(red,{emissive:0xff210c,emissiveIntensity:.62}),[[-2.15,.72,-.55,.075,.087,.45],[-2.15,.72,.55,.075,.087,.45]]);
  const tire=new THREE.CylinderGeometry(.345,.345,.26,16);tire.rotateX(Math.PI/2);
  const spokes=[];
  for(let i=0;i<3;i++)spokes.push(new THREE.BoxGeometry(.44,.048,.277).rotateZ(i*Math.PI/3));
  const hub=mergeGeometries(spokes);spokes.forEach(g=>g.dispose());
  const rubber=material(0x242629),alloy=material(0xb9c0c2,{metalness:.7,roughness:.34});
  for(const x of [1.25,-1.34])for(const side of [-1,1]){
    const pivot=new THREE.Group(),spin=new THREE.Group();root.add(pivot);pivot.add(spin);
    pivot.position.set(x,.345,side*.904);
    mesh(spin,tire,rubber,'Tyre').castShadow=true;mesh(spin,hub,alloy,'Alloy wheel');
    wheels.push({pivot,spin,front:x>0});
  }
  return {root,wheels};
}

export function createStationRaceWorld(roadMaterial,treeLibrary){
  const root=new THREE.Group(),obstacles=[],cars=[];
  root.name='Station Circuit';root.visible=false;
  const ground=mesh(root,new THREE.PlaneGeometry(1500,1500),turfMaterial(),'Circuit grass');
  ground.rotation.x=-Math.PI/2;ground.position.y=-.025;
  // The city offsets road paint towards the camera to resolve overlapping OSM
  // streets. The circuit is continuous so keep paint and kerbs above asphalt.
  const asphalt=roadMaterial?roadMaterial.clone():material(0x484d52);
  asphalt.polygonOffset=false;asphalt.vertexColors=false;
  if(roadMaterial)asphalt.color.multiplyScalar(.74);
  ribbon(root,'Track asphalt',asphalt,-halfWidth-.8,halfWidth+.8,.001,2,roadMaterial?.map?.image?4:2);
  const paintedWhite=material(white),paintedRed=material(red),apron=material(0x797c76);
  for(const side of [-1,1]){
    const curb=[side*halfWidth,side*(halfWidth+.76)].sort((a,b)=>a-b);
    const edge=[side*(halfWidth-.12),side*(halfWidth+.02)].sort((a,b)=>a-b);
    const runOff=[side*(halfWidth+.74),side*(halfWidth+2.95)].sort((a,b)=>a-b);
    ribbon(root,'Run-off',apron,...runOff,.003,2);
    ribbon(root,'Kerb white',paintedWhite,...curb,.009,2.8);
    ribbon(root,'Kerb red',paintedRed,...curb,.014,2.8,3,true);
    ribbon(root,'White edge line',paintedWhite,...edge,.018,2);boundary(root,obstacles,side);
  }
  facilities(root,obstacles);hills(root);
  const airFrames=airCourse(root);
  const grove=tracksideTrees(root,treeLibrary);
  const nextGate=new THREE.Group();nextGate.name='Next checkpoint';root.add(nextGate);
  const markerMaterial=new THREE.MeshBasicMaterial({color:mint});
  for(const side of [-1,1]){
    const marker=mesh(nextGate,new THREE.BoxGeometry(.20,2.2,.22),markerMaterial,'Checkpoint marker');
    marker.position.set(0,1.1,side*(halfWidth+.82));
    const fin=mesh(nextGate,new THREE.BoxGeometry(.17,.42,.9),markerMaterial,'Checkpoint flag');
    fin.position.set(0,2.02,side*(halfWidth+.47));
  }
  function update(race){
    for(let i=0;i<race.rivals.length;i++){
      const rival=race.rivals[i];
      if(!cars[i]){cars[i]=rivalCar(rival.color);root.add(cars[i].root);}
      const car=cars[i];car.root.name=rival.name;car.root.position.set(rival.x,rival.heave||0,rival.z);car.root.rotation.y=rival.heading;
      const ahead=sampleCourse(rival.distance+2,rival.lateral);
      const angle=ahead.heading-rival.heading;
      const steer=rival.steerAngle??Math.atan2(Math.sin(angle),Math.cos(angle))*1.35;
      for(const {spin,pivot,front} of car.wheels){spin.rotation.z=-(rival.wheelDistance??rival.distance)/.345;pivot.rotation.y=front?steer:0;}
    }
    const gate=RACE_COURSE.gates[race.nextGate];
    for(let i=0;i<airFrames.length;i++){
      const active=race.nextGate===AIR_GATES[i].index;
      airFrames[i].children[0].material.emissiveIntensity=active?1.6:.55;
    }
    nextGate.visible=!!gate&&race.phase==='racing';
    if(gate){nextGate.position.set(gate.x,0,gate.z);nextGate.rotation.y=gate.heading;}
  }
  function dispose(){
    const meshes=new Set(),materials=new Set(),textures=new Set();
    grove.removeFromParent();grove.traverse(o=>{if(o.isInstancedMesh)o.dispose();});grove.clear();
    root.traverse(o=>{
      if(o.geometry)meshes.add(o.geometry);
      if(o.material){
        materials.add(o.material);
        if(o.material.map&&o.material.map!==roadMaterial?.map)textures.add(o.material.map);
      }
      if(o.isInstancedMesh)o.dispose();
    });
    for(const g of meshes)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
    root.clear();root.removeFromParent();
  }
  return {root,obstacles,update,dispose};
}
