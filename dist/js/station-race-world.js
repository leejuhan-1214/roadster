import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CITY_ROAD_LEVELS as surfaceY} from './city-road-levels.js?v=20261122-wheel-repair';
import {RACE_COURSE,sampleCourse,circuitStations,runoffWidth} from './station-race-course.js?v=20261119-ai158';
import {AIR_APPROACH,rivalAirPath} from './station-race-air.js?v=20261119-ai158';
import {circuitUrbanTrackStages,CIRCUIT_BASIN} from './circuit-urban-track.js?v=20261122-roadhandling';
import {circuitCityscapeStages} from './circuit-cityscape.js?v=20261119-metropolis159';
import {addCircuitLighting} from './circuit-lighting.js?v=20261122-roadhandling';

import {createTireContactShadows,updateTireContactShadows} from './tire-contact-shadows.js?v=20261122-roadhandling';

const halfWidth=RACE_COURSE.width/2;
const white=0xf1eee1,red=0xc63e37,dark=0x212c32,steel=0x829499,mint=0x5cf2cb;
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.78,...extra});

function mesh(parent,geometry,mat,name){
  const object=new THREE.Mesh(geometry,mat);
  object.name=name;object.receiveShadow=true;parent.add(object);
  return object;
}

// Every strip closes at the same arc length used by the AI and checkpoint model.
function ribbon(root,name,mat,inner,outer,height,stations=circuitStations,tileSize=3,alongUV=false){
  const positions=[],uv=[],indices=[];
  for(const [i,s] of stations.entries()){
    for(const [j,offset] of [inner,outer].entries()){
      const lateral=typeof offset==='function'?offset(s):offset;
      const {x,z}=sampleCourse(s,lateral);
      positions.push(x,height,z);
      if(alongUV)uv.push(s/tileSize,j);else uv.push(x/tileSize,z/tileSize);
    }
    if(i+1<stations.length){
      const a=2*i;indices.push(a,a+1,a+2,a+1,a+3,a+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return mesh(root,geometry,mat,name);
}

function kerbMaterial(){
  const pixels=new Uint8Array([195,46,43,255,226,223,206,255]);
  const map=new THREE.DataTexture(pixels,2,1);
  map.colorSpace=THREE.SRGBColorSpace;map.wrapS=THREE.RepeatWrapping;
  map.magFilter=THREE.NearestFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.needsUpdate=true;
  return material(0xffffff,{map});
}

// A wheel uses the very same quadrilateral as the striped top. Kerbs can
// support the underbody from below but their short edge is not a crash wall.
function addKerbSupports(obstacles,strip,id,height){
  const v=strip.geometry.attributes.position;
  for(let i=0;i+3<v.count;i+=2){
    const footprint=[i,i+1,i+3,i+2].map(k=>[v.getX(k),v.getZ(k)]);
    const x=footprint.map(p=>p[0]),z=footprint.map(p=>p[1]);
    const minX=Math.min(...x),maxX=Math.max(...x),minZ=Math.min(...z),maxZ=Math.max(...z);
    obstacles.push({id:id+'-'+i/2,kind:'prism',topContactOnly:true,footprint,
      center:[(minX+maxX)/2,height/2,(minZ+maxZ)/2],size:[maxX-minX,height,maxZ-minZ]});
  }
}

function precastWallMaterial(){
  const w=256,h=96,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    // UVs wrap up the first face, across the cap, and down the reverse face.
    const fromBase=Math.min(y,h-y-1),cap=fromBase>=38,edge=Math.min(x,w-1-x);
    const grain=((Math.imul(x+3,4001)^Math.imul(y+7,7039))>>>3)%15-7;
    const streak=3*Math.sin(x*.10)+2*Math.sin(x*.51);
    const dirt=cap?0:Math.max(0,1-fromBase/24)*(17+streak);
    const tieHole=!cap&&(Math.min(Math.abs(x-37),Math.abs(x-218))**2+(fromBase-24)**2<4);
    const tone=108+grain+streak-dirt+(cap?24:0)-(edge<1?37:edge<2?12:0)-(tieHole?29:0);
    const i=(y*w+x)*4;pixels[i]=tone-7;pixels[i+1]=tone+1;pixels[i+2]=tone+10;pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,w,h);
  map.name='Cast concrete panels with tie holes and joints';map.wrapS=THREE.RepeatWrapping;
  map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.needsUpdate=true;map.anisotropy=4;
  return material(0x8895a5,{map,roughness:.94,flatShading:true,side:THREE.DoubleSide});
}

// Follow the same corner vertices in the rendered walls and their collision prisms.
function boundary(root,obstacles,side,concrete){
  const count=circuitStations.length-1,height=.84,positions=[],indices=[],uv=[];
  const edgePoints=d=>{
    const near=halfWidth+runoffWidth(d,side);
    return [sampleCourse(d,side*near),sampleCourse(d,side*(near+.44))];
  };
  for(let i=0;i<=count;i++){
    const s=circuitStations[i],u=s/5;
    const [a,b]=edgePoints(s);
    positions.push(a.x,0,a.z,a.x,height,a.z,b.x,height,b.z,b.x,0,b.z);
    uv.push(u,0,u,.4,u,.6,u,1);
    if(i===count)continue;
    const j=i*4;
    for(let k=0;k<3;k++)indices.push(j+k,j+k+1,j+k+4,j+k+1,j+k+5,j+k+4);
    const [d,c]=edgePoints(circuitStations[i+1]);
    const footprint=[a,b,c,d].map(p=>[Math.fround(p.x),Math.fround(p.z)]);
    const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
    const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
    obstacles.push({kind:'prism',id:'race-barrier-'+side+'-'+i,footprint,
      center:[(x0+x1)/2,height/2,(z0+z1)/2],size:[x1-x0,height,z1-z0]});
  }
  // The outside wall's winding is opposite the inside wall's winding.
  if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();mesh(root,g,concrete,'Circuit safety wall');
}

function billBoard(root,text,w,h,x,y,z,heading,background,foreground){
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');
  canvas.width=w>6?512:128;canvas.height=Math.max(40,Math.round(canvas.width*h/w));
  const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=foreground;ctx.font='bold '+Math.round(canvas.height*.62)+'px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,canvas.width/2,canvas.height*.53,canvas.width*.94);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const panel=mesh(root,new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}),text);
  panel.position.set(x,y,z);panel.rotation.y=heading-Math.PI/2;
}

// One atlas and one batched sign mesh per bend. Real-distance boards on the
// outside of each braking zone are legible on approach without a HUD.
function addBrakeBoards(root){
  if(typeof document==='undefined')return;
  const signs=['150','100','50','‹‹','››',...RACE_COURSE.bends.map(b=>'T'+b.turn)];
  const columns=4,rows=Math.ceil(signs.length/columns),px=128,py=80;
  const canvas=document.createElement('canvas');
  canvas.width=px*columns;canvas.height=py*rows;
  const ctx=canvas.getContext('2d');
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 53px sans-serif';
  for(const [i,label] of signs.entries()){
    const x=(i%columns)*px,y=Math.floor(i/columns)*py;
    ctx.fillStyle=i<3?'#efeadc':'#213238';ctx.fillRect(x,y,px,py);
    ctx.fillStyle=i<3?'#1d2224':'#ffdd76';ctx.fillText(label,x+px/2,y+py*.53,px-10);
  }
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=2;
  const mat=new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide});
  for(const b of RACE_COURSE.bends){
    const pos=[],uv=[],indices=[],side=Math.sign(b.curvature);
    const board=(d,label,w,h)=>{
      const p=sampleCourse(d,side*(halfWidth+runoffWidth(d,side)+1.6));
      const index=signs.indexOf(label),x=index%columns,y=Math.floor(index/columns);
      const base=pos.length/3;
      for(const [j,k] of [[0,0],[1,0],[0,1],[1,1]]){
        const across=(j-.5)*w;
        pos.push(p.x+Math.sin(p.heading)*across,1.2+k*h,p.z+Math.cos(p.heading)*across);
        uv.push((x+.015+j*.97)/columns,1-(y+.985-k*.97)/rows);
      }
      indices.push(base,base+1,base+2,base+2,base+1,base+3);
    };
    for(const metres of [150,100,50])board(b.start-metres,String(metres),2.05,1.25);
    board(b.start-7,'T'+b.turn,2.1,1.3);
    board(b.start+b.length*.43,side===1?'‹‹':'››',2.8,1);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
    mesh(root,g,mat,'Braking boards T'+b.turn);
  }
}

// Painted grid rectangles are flat decals and do not cast building shadows.
function facilities(root,obstacles){
  const blocks=[],grid=[],tmp=new THREE.Object3D();
  function box(x,y,z,l,h,w,color,yaw=0){
    tmp.position.set(x,y,z);tmp.rotation.set(0,yaw,0);tmp.scale.set(l,h,w);tmp.updateMatrix();
    blocks.push([tmp.matrix.clone(),color]);
  }
  function paint(x,z,l,w,color){
    tmp.position.set(x,surfaceY.centreLine,z);tmp.rotation.set(0,0,0);tmp.scale.set(l,1,w);tmp.updateMatrix();
    grid.push([tmp.matrix.clone(),color]);
  }
  for(const side of [-1,1])box(0,3.2,side*(halfWidth+1.4),.6,6.4,.6,steel);
  box(0,6.4,0,.55,1.4,2*halfWidth+4,dark);
  for(const side of [-1,1])obstacles.push({id:'starting-gantry-post-'+side,center:[0,3.2,side*(halfWidth+1.4)],size:[.6,6.4,.6]});
  obstacles.push({id:'starting-gantry-header',center:[0,6.4,0],size:[.55,1.4,2*halfWidth+4]});
  billBoard(root,'STATION GRAND PRIX',16,1.35,-.29,6.4,0,0,'#152b30','#9df5dc');
  const columns=32,size=2*halfWidth/columns;
  for(let column=0;column<columns;column++)for(let row=0;row<3;row++)
    paint((row-1)*size,-halfWidth+(column+.5)*size,size,size,(row+column)%2===0?white:dark);
  for(const [s,side] of [[-6,-3.15],[-4,3.15],[-12,-3.15],[-14,3.15]]){
    const p=sampleCourse(s,side);
    paint(p.x+2.1,p.z,.15,2.85,white);
    for(const sign of [-1,1])paint(p.x+1.57,p.z+sign*1.37,1.15,.12,white);
  }
  for(const center of [-158,-118,-78,-38,2,42,82,122]){
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
  const pit=-(halfWidth+15);
  box(-32,-.001,pit+6.4,250,.002,6.3,0x535b59);
  for(let garage=0;garage<4;garage++){
    const x=-100+garage*39;
    box(x,2.3,pit,38,4.6,9.2,0xb2b8b4);box(x,4.8,pit,39,.38,10.5,steel);
    box(x,5.8,pit,37,1.7,8.6,0x485e65);box(x,6.8,pit,39,.24,9.4,white);
    for(let i=0;i<7;i++)box(x-15+i*5,1.48,pit+4.61,4,2.96,.1,0x394e55);
  }
  box(46,5,pit,7.8,10,8.8,0xb8aaa0);box(46,7.8,pit+4.42,6.6,2.7,.12,0x344e58);
  box(46,10.1,pit,8.9,.38,9.8,white);
  for(let i=0;i<15;i++){
    const d=i*RACE_COURSE.length/15,p=sampleCourse(d,halfWidth+6.7);
    box(p.x,5,p.z,.18,10,.18,steel,p.heading);
    box(p.x,10,p.z,1.8,.22,1.2,0xc1cbca,p.heading);
  }
  const instance=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(0xffffff),blocks.length);
  blocks.forEach(([matrix,color],i)=>{instance.setMatrixAt(i,matrix);instance.setColorAt(i,new THREE.Color(color));});
  instance.name='Grandstands and pit lane';instance.castShadow=instance.receiveShadow=true;root.add(instance);
  const marking=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),
    material(0xffffff,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),grid.length);
  grid.forEach(([matrix,color],i)=>{marking.setMatrixAt(i,matrix);marking.setColorAt(i,new THREE.Color(color));});
  marking.name='Start stripe and grid boxes';marking.receiveShadow=true;root.add(marking);
}

// Continuous world-space UVs keep the paving joints aligned on both embankments.
function addCityPaving(root){
  const {minX,maxX,minZ,maxZ}=CIRCUIT_BASIN,bounds=RACE_COURSE.extent;
  const west=bounds.minX-750,east=bounds.maxX+750,north=bounds.minZ-750,south=bounds.maxZ+750;
  const positions=[],uv=[],indices=[];
  for(const [left,right,top,bottom] of [[west,east,north,minZ],[west,east,maxZ,south],
    [west,minX,minZ,maxZ],[maxX,east,minZ,maxZ]]){
    const base=positions.length/3;
    for(const [x,z] of [[left,top],[left,bottom],[right,top],[right,bottom]]){
      positions.push(x,-.11,z);uv.push(x/96,z/96);
    }
    indices.push(base,base+1,base+2,base+2,base+1,base+3);
  }
  // A block has a narrow service street, drainage curb and stone pavement.
  // Keep them on the terrain so the bridge opening remains unobstructed.
  const size=256,pixels=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++){
    const x=i%size,z=Math.floor(i/size),dx=Math.min(x,size-1-x),dz=Math.min(z,size-1-z);
    const edge=Math.min(dx,dz),along=dx<dz?z:x,other=Math.max(dx,dz);
    const grain=((Math.imul(i+1,0x9e3779b1)>>>20)/4095-.5)*7;
    let r=62,g=70,b=83;
    if(edge<12){
      const stripe=(edge===1&&along%22<9&&other>21)||(other>=18&&other<=23&&edge%4<2);
      r=stripe?122:33;g=stripe?136:40;b=stripe?144:50;
    }else if(edge<15){r=102;g=111;b=114;}
    else if(edge<24){r=73;g=81;b=87;}
    else if(dx>40&&dx<78&&dz>46&&dz<102){r=43;g=64;b=65;}
    const joint=edge>14&&(z%6===0||(x+3*Math.floor(z/6))%12===0)?7:0;
    pixels.set([r+grain-joint,g+grain-joint,b+grain-joint,255],i*4);
  }
  const map=new THREE.DataTexture(pixels,size,size);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const ground=mesh(root,geometry,material(0x9facb9,{map,roughness:.93,depthWrite:false}),'Quayside paving');
  ground.renderOrder=-10;
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

// The inside of the illuminated trim is the scoring ellipse, in the Y/Z plane.
function ovalBand(radiusZ,radiusY,outer,depth){
  const positions=[],indices=[],steps=64;
  for(let i=0;i<steps;i++){
    const angle=i*2*Math.PI/steps,sy=Math.sin(angle),cz=Math.cos(angle);
    for(const [x,margin] of [[-depth/2,0],[-depth/2,outer],[depth/2,outer],[depth/2,0]]){
      positions.push(x,(radiusY+margin)*sy,(radiusZ+margin)*cz);
    }
    const next=(i+1)%steps;
    for(let j=0;j<4;j++){
      const a=i*4+j,b=i*4+(j+1)%4,c=next*4+j,d=next*4+(j+1)%4;
      indices.push(a,c,b,b,c,d);
    }
  }
  const shape=new THREE.BufferGeometry();
  shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  shape.setIndex(indices);shape.computeVertexNormals();return shape;
}

function airCourse(root){
  const group=new THREE.Group();group.name='Roadster air route';root.add(group);
  const frames=[],gates=RACE_COURSE.gates.filter(gate=>gate.air);
  const metal=material(0x324047,{metalness:.76,roughness:.31,side:THREE.DoubleSide});
  for(const courseGate of gates){
    const gate=courseGate.aperture;
    const p=sampleCourse(courseGate.distance,gate.lateral);
    const midY=(gate.minY+gate.maxY)/2,radiusY=(gate.maxY-gate.minY)/2;
    const frame=new THREE.Group();frame.name='Air gate '+courseGate.index;frame.userData.gateIndex=courseGate.index;
    frame.position.set(p.x,midY,p.z);frame.rotation.y=p.heading;
    group.add(frame);
    const trim=new THREE.MeshBasicMaterial({color:0x55d9ee,side:THREE.DoubleSide,toneMapped:false});
    mesh(frame,ovalBand(gate.halfWidth,radiusY,.13,.35),trim,'Air timing aperture');
    mesh(frame,ovalBand(gate.halfWidth+.13,radiusY+.13,.24,.29),metal,'Timing instrument housing');
    // Twin outward-facing pointers distinguish the target even without its color.
    const markers=[];
    for(const sign of [-1,1]){
      const y=sign*(radiusY+.55);
      for(const side of [-1,1])markers.push(new THREE.BoxGeometry(.22,.12,.66)
        .rotateX(-side*sign*.50).translate(-.18,y+sign*.11,side*.28));
    }
    const pointer=mesh(frame,mergeGeometries(markers),trim,'Active ring pointers');
    markers.forEach(g=>g.dispose());
    pointer.visible=false;
    frames.push(frame);
  }
  const arrows=[],first=gates[0].distance,last=gates.at(-1).distance;
  for(let d=first-AIR_APPROACH;d<=last+95;d+=8){
    if(gates.some(gate=>Math.abs(gate.distance-d)<3))continue;
    const guide=rivalAirPath(d,RACE_COURSE);
    const p=sampleCourse(d,guide.lateral),y=Math.max(.045,guide.height-.36);
    for(const side of [-1,1]){
      const dz=side*.29;
      arrows.push(new THREE.BoxGeometry(.92,.045,.13).rotateY(side*.60+p.heading)
        .translate(p.x+Math.sin(p.heading)*dz,y,p.z+Math.cos(p.heading)*dz));
    }
  }
  mesh(group,mergeGeometries(arrows),new THREE.MeshBasicMaterial({color:0x58adb6}),'Air corridor chevrons');
  arrows.forEach(g=>g.dispose());
  const sign=sampleCourse(gates[0].distance-AIR_APPROACH,halfWidth+3.8);
  billBoard(group,'필수 비행  ·  SPACE ↑',7.3,1.4,sign.x,3.18,sign.z,sign.heading,'#113746','#94f2ff');
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
  const mount=new THREE.Group(),patches=createTireContactShadows();
  const cones=[];
  for(const x of [-1.32,1.35])for(const z of [-.73,.73]){
    cones.push(new THREE.CylinderGeometry(.042,.17,1,8,1,true).translate(x,-.5,z));
  }
  const jetGeometry=mergeGeometries(cones);cones.forEach(g=>g.dispose());
  const jets=new THREE.Mesh(jetGeometry,new THREE.MeshBasicMaterial({color:0xb7e4ec,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide}));
  jets.name='Rival lift exhaust';jets.visible=false;jets.position.y=.24;
  mount.add(root,patches,jets);
  const car={root:mount,placeholder:root,wheels,fallbackWheels:wheels,patches,jets};fitTirePatches(car);return car;
}

function fitTirePatches(car){
  const scale=car.skin?.root.scale.x||1,origin=car.skin?.root.position||new THREE.Vector3();
  const wheels=car.wheels.map(wheel=>{
    wheel.baseY=wheel.pivot.position.y;
    return {pos:wheel.pivot.position.clone().multiplyScalar(scale).add(origin),surfaceY:0,compression:0,steer:0,load:3000};
  });
  updateTireContactShadows(car.patches,new THREE.Vector3(),new THREE.Quaternion(),wheels,
    car.wheels.map(w=>({radius:w.radius||.345})),'city');
}

export function createStationRaceWorld(...args){
  const stages=stationRaceWorldStages(...args);
  let stage;
  do{stage=stages.next();}while(!stage.done);
  return stage.value;
}

// City driving prepares one batch per idle slice. A portal reached early can
// finish the same iterator synchronously, preserving the single world and its assets.
export function* stationRaceWorldStages(roadMaterial,treeLibrary,{loadExterior=typeof document==='undefined'?null:
  ()=>import('./rival-exterior.js?v=20261122-roadhandling').then(m=>m.loadRivalExterior())}={}){
  const root=new THREE.Group(),obstacles=[],cars=[];
  root.name='Station Circuit';root.visible=false;
  addCityPaving(root);
  yield;
  // The city offsets road paint towards the camera to resolve overlapping OSM
  // streets. The circuit is continuous so keep paint and kerbs above asphalt.
  const asphalt=roadMaterial?roadMaterial.clone():material(0x484d52);
  asphalt.polygonOffset=false;asphalt.vertexColors=false;
  if(roadMaterial){asphalt.color.setHex(0x536880);asphalt.roughness=.86;}
  ribbon(root,'Track asphalt',asphalt,-halfWidth-.8,halfWidth+.8,surfaceY.asphalt,circuitStations,roadMaterial?.map?.image?4:2);
  const paintedWhite=material(white,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const kerb=kerbMaterial(),apron=material(0x414f60,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const precast=precastWallMaterial(),bendDetails=[];
  for(const side of [-1,1]){
    const edge=[side*(halfWidth-.12),side*(halfWidth+.02)].sort((a,b)=>a-b);
    const inner=side*(halfWidth+.12),outer=d=>side*(halfWidth+runoffWidth(d,side)+.5);
    ribbon(root,'Run-off',apron,side<0?outer:inner,side<0?inner:outer,surfaceY.median);
    ribbon(root,'White edge line',paintedWhite,...edge,surfaceY.centreLine);boundary(root,obstacles,side,precast);
    yield;
  }
  for(const bend of RACE_COURSE.bends){
    const details=new THREE.Group();details.name='Corner '+bend.turn;root.add(details);
    const end=bend.start+bend.length,stations=[bend.start-12,...circuitStations.filter(d=>d>=bend.start&&d<=end),end+12];
    for(const side of [-1,1]){
      const offsets=[side*(halfWidth+.12),side*(halfWidth+1.08)].sort((a,b)=>a-b);
      const kerbHeight=.028,strip=ribbon(details,'Striped kerb',kerb,...offsets,kerbHeight,stations,5,true);
      addKerbSupports(obstacles,strip,'race-kerb-'+bend.turn+'-'+side,kerbHeight);
    }
    const p=sampleCourse(bend.start+bend.length/2);
    bendDetails.push({details,x:p.x,z:p.z});
  }
  addBrakeBoards(root);
  yield;
  facilities(root,obstacles);
  yield;
  addCircuitLighting(root,obstacles);
  yield;
  const airFrames=airCourse(root);
  yield;
  yield* circuitUrbanTrackStages(root,obstacles);
  yield* circuitCityscapeStages(root,obstacles);
  const nextGate=new THREE.Group();nextGate.name='Next checkpoint';root.add(nextGate);
  let exterior=null,disposed=false;
  function dress(car){
    car.skin=exterior.create(car.color);
    car.root.add(car.skin.root);car.placeholder.visible=false;car.wheels=car.skin.wheels;fitTirePatches(car);
  }
  const rivalModelsReady=loadExterior?Promise.resolve().then(loadExterior).then(template=>{
    if(disposed){template.dispose();return false;}
    exterior=template;for(const car of cars)dress(car);return true;
  }).catch(error=>{console.warn('AI 경주차 외형을 불러올 수 없습니다.',error);return false;}):Promise.resolve(false);
  const markerMaterial=new THREE.MeshBasicMaterial({color:mint});
  for(const side of [-1,1]){
    const marker=mesh(nextGate,new THREE.BoxGeometry(.20,2.2,.22),markerMaterial,'Checkpoint marker');
    marker.position.set(0,1.1,side*(halfWidth+.82));
    const fin=mesh(nextGate,new THREE.BoxGeometry(.17,.42,.9),markerMaterial,'Checkpoint flag');
    fin.position.set(0,2.02,side*(halfWidth+.47));
  }
  function update(race,viewer=sampleCourse(race.progress)){
    for(const {details,x,z} of bendDetails)details.visible=(viewer.x-x)**2+(viewer.z-z)**2<800**2;
    for(let i=0;i<race.rivals.length;i++){
      const rival=race.rivals[i];
      if(!cars[i]){cars[i]=rivalCar(rival.color);cars[i].color=rival.color;root.add(cars[i].root);if(exterior)dress(cars[i]);}
      const car=cars[i];car.root.name=rival.name;car.root.position.set(rival.x,rival.heave||0,rival.z);car.root.rotation.y=rival.heading;
      const distanceSq=(rival.x-viewer.x)**2+(rival.z-viewer.z)**2;
      car.root.visible=distanceSq<750**2;
      if(!car.root.visible)continue;
      if(car.skin){
        const close=distanceSq<(car.skin.root.visible?180:155)**2;
        car.skin.root.visible=close;car.placeholder.visible=!close;
        car.wheels=close?car.skin.wheels:car.fallbackWheels;
      }
      const ahead=sampleCourse(rival.distance+2,rival.lateral);
      const angle=ahead.heading-rival.heading;
      const steer=rival.steerAngle??Math.atan2(Math.sin(angle),Math.cos(angle))*1.35;
      const heave=rival.heave||0,scale=car.skin?.root.visible?car.skin.root.scale.x:1;
      car.jets.visible=rival.liftAcceleration>0&&heave>.04;
      if(car.jets.visible)car.jets.scale.y=Math.min(.24+heave,.12+rival.liftAcceleration*.085);
      car.patches.position.y=-heave;car.patches.material.opacity=Math.max(0,1-Math.max(0,heave)/.14)**2;
      for(const {spin,pivot,front,radius=.345,baseY} of car.wheels){
        spin.rotation.z=-(rival.wheelDistance??rival.distance)/radius;pivot.rotation.y=front?steer:0;
        pivot.position.y=baseY-Math.min(heave,0)/scale;
      }
    }
    const gate=RACE_COURSE.gates[race.nextGate];
    for(let i=0;i<airFrames.length;i++){
      const frame=airFrames[i],active=race.nextGate===frame.userData.gateIndex;
      const state=active?'target':i<race.airGatesThisLap?'passed':'upcoming';
      if(frame.userData.state===state)continue;
      frame.userData.state=state;
      frame.children[0].material.color.setHex(active?0xffbe62:state==='passed'?0x456374:0x55d9ee);
      frame.getObjectByName('Active ring pointers').visible=active;
    }
    nextGate.visible=!!gate&&!gate.air&&race.phase==='racing';
    if(gate){nextGate.position.set(gate.x,0,gate.z);nextGate.rotation.y=gate.heading;}
  }
  function dispose(){
    if(disposed)return;disposed=true;
    for(const car of cars)car.skin?.dispose();exterior?.dispose();
    const meshes=new Set(),materials=new Set(),textures=new Set();
    root.traverse(o=>{
      if(o.geometry)meshes.add(o.geometry);
      if(o.material){
        materials.add(o.material);
        for(const slot of ['map','emissiveMap','roughnessMap','normalMap']){
          const texture=o.material[slot];
          if(texture&&texture!==roadMaterial?.[slot])textures.add(texture);
        }
      }
      if(o.isInstancedMesh)o.dispose();
    });
    for(const g of meshes)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();
    root.clear();root.removeFromParent();
  }
  return {root,obstacles,update,dispose,rivalModelsReady};
}
