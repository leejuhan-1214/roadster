// Original lightweight landmark reconstructions. The architectural source
// photographs are consulted as references only; no third-party meshes or image
// pixels are copied into this asset. Run from the repository root.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

const out=path.resolve('dist/assets/city-buildings');
await fs.mkdir(out,{recursive:true});
const city=JSON.parse(await fs.readFile('dist/assets/city/gangnam.json','utf8'));
const research=JSON.parse(await fs.readFile('docs/research/gangnam-landmark-footprints.json','utf8'));
const sources=Array.isArray(research)?research:research.buildings;
const gt=city.buildings.find(b=>b.id===301605795);
const samsungSources=sources.filter(b=>[8311183,8311184,8311185].includes(b.id));
const lifeWings=city.buildings.filter(b=>[504227059,504227064].includes(b.id));
const buildings=[{...gt,kind:'gt',label:'GT Tower East'},...samsungSources.map((b,i)=>({...b,id:'r'+b.id,relationId:b.id,
  documentedBaseHeight:b.height,height:b.id===8311183?150:b.height,
  footprintPoints:[...(b.rings||[b.points]).flat(),...(b.id===8311183?lifeWings.flatMap(w=>w.points):[])],
  kind:'samsung',label:b.name,variant:i}))];
const root=new THREE.Group();root.name='Gangnam original landmark reconstructions';
const buckets=new Map();
const collisionSolids=[];let currentBuilding='';
const materials={
  glass:new THREE.MeshPhysicalMaterial({name:'Architectural blue reflective glass',color:0xffffff,vertexColors:true,metalness:.38,roughness:.19,clearcoat:.85,clearcoatRoughness:.14}),
  frame:new THREE.MeshStandardMaterial({name:'Silver curtain-wall mullions',color:0xc4ced3,metalness:.72,roughness:.37}),
  dark:new THREE.MeshStandardMaterial({name:'Recessed shadow spandrels',color:0x243640,metalness:.35,roughness:.38}),
  stone:new THREE.MeshStandardMaterial({name:'Stone podium and entry paving',color:0xbcb9ad,metalness:.02,roughness:.86}),
  roof:new THREE.MeshStandardMaterial({name:'Flat roof and plant screens',color:0x697477,metalness:.15,roughness:.7}),
  garden:new THREE.MeshStandardMaterial({name:'Podium planted terrace',color:0x3f5b45,metalness:0,roughness:1}),
};
const glassColors=[0x66838f,0x698692,0x6b8894,0x678490,0x688591].map(c=>new THREE.Color(c));
function panelColor(floor,column,side,seed){
  let value=Math.imul(floor+seed*29+1,374761393)^Math.imul(column+side*17+3,668265263);
  value=Math.imul(value^(value>>>13),1274126177);value=(value^(value>>>16))>>>0;
  return glassColors[value%glassColors.length];
}
const neutral=new THREE.Color(0xffffff),tmp1=new THREE.Vector3(),tmp2=new THREE.Vector3(),tmp3=new THREE.Vector3();
function bucket(name){if(!buckets.has(name))buckets.set(name,{positions:[],normals:[],colors:[],uvs:[],indices:[]});return buckets.get(name);}
function quad(name,a,b,c,d,color=neutral){
  const target=bucket(name),start=target.positions.length/3;
  tmp1.fromArray(b).sub(tmp2.fromArray(a));tmp3.fromArray(c).sub(tmp2);tmp1.cross(tmp3).normalize();
  for(const p of [a,b,c,d]){target.positions.push(...p);target.normals.push(tmp1.x,tmp1.y,tmp1.z);target.colors.push(color.r,color.g,color.b);}
  target.uvs.push(0,0,1,0,1,1,0,1);target.indices.push(start,start+1,start+2,start,start+2,start+3);
}
function frameFor(b){
  const points=(b.footprintPoints||b.points).slice();if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
  const theta=-Math.PI*20.45/180,c=Math.cos(theta),s=Math.sin(theta);
  const local=points.map(([x,z])=>[x*c+z*s,-x*s+z*c]);
  const minU=Math.min(...local.map(p=>p[0])),maxU=Math.max(...local.map(p=>p[0])),minV=Math.min(...local.map(p=>p[1])),maxV=Math.max(...local.map(p=>p[1]));
  const u=(minU+maxU)/2,v=(minV+maxV)/2;
  return {width:maxU-minU,depth:maxV-minV,center:[c*u-s*v,s*u+c*v],angle:theta,
    point:(u,y,v)=>[c*(u+(minU+maxU)/2)-s*(v+(minV+maxV)/2),y,s*(u+(minU+maxU)/2)+c*(v+(minV+maxV)/2)]};
}
function box(f,x,y,z,w,h,d,material='stone'){
  const p=(u,v,t)=>f.point(x+u*w/2,y+v*h/2,z+t*d/2);
  quad(material,p(-1,-1,1),p(1,-1,1),p(1,1,1),p(-1,1,1));
  quad(material,p(1,-1,-1),p(-1,-1,-1),p(-1,1,-1),p(1,1,-1));
  quad(material,p(-1,-1,-1),p(-1,-1,1),p(-1,1,1),p(-1,1,-1));
  quad(material,p(1,-1,1),p(1,-1,-1),p(1,1,-1),p(1,1,1));
  quad(material,p(-1,1,1),p(1,1,1),p(1,1,-1),p(-1,1,-1));
  quad(material,p(-1,-1,-1),p(1,-1,-1),p(1,-1,1),p(-1,-1,1));
}
function ribbon(f,side,a,b,y0,y1,at,material='frame'){
  // Front/back and side face order gives outward normals without double-sided
  // materials. The trim is thin geometry, independent of any texture atlas.
  const p=(u,y)=>side<2?f.point(u,y,at(y)):f.point(at(y),y,u);
  if(side===0||side===2)quad(material,p(a(y0),y0),p(b(y0),y0),p(b(y1),y1),p(a(y1),y1));
  else quad(material,p(b(y0),y0),p(a(y0),y0),p(a(y1),y1),p(b(y1),y1));
}
function collideBox(f,x,y,z,w,h,d){
  const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{const p=f.point(x+u*w/2,0,z+v*d/2);return [p[0],p[2]];});
  const min=Math.min(...points.map(p=>p[1])),max=Math.max(...points.map(p=>p[1])),n=Math.ceil((max-min)/2.5),depth=(max-min)/n;
  const cuts=zz=>{const hits=[];for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];if((a[1]<=zz&&b[1]>zz)||(b[1]<=zz&&a[1]>zz))hits.push(a[0]+(zz-a[1])*(b[0]-a[0])/(b[1]-a[1]));}return hits.sort((a,b)=>a-b);};
  for(let k=0;k<n;k++){
    const z0=min+k*depth+.01,z1=min+(k+1)*depth-.01,levels=[cuts(z0),cuts((z0+z1)/2),cuts(z1)];
    if(levels.some(x=>x.length!==2))continue;
    const x0=Math.max(...levels.map(x=>x[0]))+.01,x1=Math.min(...levels.map(x=>x[1]))-.01;
    if(x1-x0>.12)collisionSolids.push({id:'landmark-'+currentBuilding+'-'+collisionSolids.length,center:[(x0+x1)/2,y,(z0+z1)/2],size:[x1-x0,h,z1-z0]});
  }
}
function curtainBox(f,x,y,z,w,h,d,{levels=Math.max(2,Math.round(h/4)),vertical=false,seed=0,canopy=false}={}){
  const bottom=y-h/2,top=y+h/2;
  collideBox(f,x,y,z,w,h,d);
  box(f,x,y,z,w,h,d,'dark');
  const columns=[Math.max(2,Math.round(w/2.1)),Math.max(2,Math.round(d/2.1))];
  for(let side=0;side<4;side++){
    const extent=side<2?w:d,offset=side<2?x:z,count=columns[side<2?0:1];
    // Keep the glass clear of its opaque backing at distant city-camera depths.
    const fixed=side<2?z+(side===0?1:-1)*(d/2+.18):x+(side===3?1:-1)*(w/2+.18);
    const p=(u,v)=>side<2?f.point(u,v,fixed):f.point(fixed,v,u);
    for(let floor=0;floor<levels;floor++)for(let col=0;col<count;col++){
      const u0=offset-extent/2+extent*col/count+.045,u1=offset-extent/2+extent*(col+1)/count-.045;
      const y0=bottom+h*floor/levels+.09,y1=bottom+h*(floor+1)/levels-.09;
      const color=panelColor(floor,col,side,seed);
      if(side===0||side===2)quad('glass',p(u0,y0),p(u1,y0),p(u1,y1),p(u0,y1),color);
      else quad('glass',p(u1,y0),p(u0,y0),p(u0,y1),p(u1,y1),color);
    }
    const edge=side<2?z+(side===0?1:-1)*(d/2+.22):x+(side===3?1:-1)*(w/2+.22);
    for(let col=0;col<=count;col++){
      const u=offset-extent/2+extent*col/count,t=vertical?.10:.045;
      ribbon(f,side,()=>u-t,()=>u+t,bottom,top,()=>edge);
    }
    for(let floor=0;floor<=levels;floor++){
      const yy=bottom+h*floor/levels,t=vertical?.045:.12;
      ribbon(f,side,()=>offset-extent/2,()=>offset+extent/2,yy-t,yy+t,()=>edge);
    }
  }
  box(f,x,top+.13,z,w+.28,.26,d+.28,'roof');
  if(canopy){
    box(f,x,bottom+3.2,z+d/2+1.1,w*.45,.28,2.8,'frame');
    box(f,x,bottom+1.55,z+d/2+.03,w*.42,3.1,.12,'dark');
    for(const shift of [-1,0,1])box(f,x+shift*w*.13,bottom+1.55,z+d/2+.15,.12,3.1,.12,'frame');
  }
}
function gtTower(b,f){
  const w=f.width,d=f.depth,base=8.2,height=120;
  const delta=y=>Math.sin((y-base)/height*Math.PI*5),centerX=y=>1.8*delta(y),centerZ=y=>2.4*delta(y);
  curtainBox(f,0,4.1,0,w*.98,8.2,d*.98,{levels:2,vertical:true,canopy:true});
  collideBox(f,0,(base+130)/2,0,w,130-base,d);
  const rows=80,cols=[18,24];
  for(let side=0;side<4;side++){
    const extent=side<2?w:d,columns=cols[side<2?0:1];
    const p=(u,y,extra=0)=>side<2?f.point(centerX(y)+u,y,centerZ(y)+(side===0?1:-1)*(d/2+extra)):
      f.point(centerX(y)+(side===3?1:-1)*(w/2+extra),y,centerZ(y)+u);
    for(let r=0;r<rows;r++)for(let col=0;col<columns;col++){
      const y0=base+height*r/rows,y1=base+height*(r+1)/rows,u0=-extent/2+extent*col/columns,u1=-extent/2+extent*(col+1)/columns;
      const color=glassColors[(Math.floor(r/4)*2+col+side)%glassColors.length];
      if(side===0||side===2)quad('glass',p(u0,y0),p(u1,y0),p(u1,y1),p(u0,y1),color);
      else quad('glass',p(u1,y0),p(u0,y0),p(u0,y1),p(u1,y1),color);
    }
    for(let col=0;col<=columns;col++)for(let r=0;r<rows;r++){
      const u=-extent/2+extent*col/columns,y0=base+height*r/rows,y1=base+height*(r+1)/rows;
      if(side===0||side===2)quad('frame',p(u-.055,y0,.035),p(u+.055,y0,.035),p(u+.055,y1,.035),p(u-.055,y1,.035));
      else quad('frame',p(u+.055,y0,.035),p(u-.055,y0,.035),p(u-.055,y1,.035),p(u+.055,y1,.035));
    }
    for(let floor=0;floor<=48;floor++){
      const yy=base+height*floor/48;
      if(side===0||side===2)quad('frame',p(-extent/2,yy-.075,.06),p(extent/2,yy-.075,.06),p(extent/2,yy+.075,.06),p(-extent/2,yy+.075,.06));
      else quad('frame',p(extent/2,yy-.075,.06),p(-extent/2,yy-.075,.06),p(-extent/2,yy+.075,.06),p(extent/2,yy+.075,.06));
    }
  }
  box(f,0,128.8,0,w*.94,1.6,d*.94,'roof');
  for(const z of [-d*.25,d*.25])box(f,0,129.3,z,w*.23,1.4,d*.19,'dark');
}
function samsungTower(b,f){
  const w=f.width*.96,d=f.depth*.96,h=b.height,podium=h*.19;
  // Interlocking vertical and horizontal curtain-wall masses follow the KPF
  // design principle. Detailed dimensions/offsets are visual approximations.
  curtainBox(f,0,podium/2,0,w,podium,d,{levels:Math.round(podium/4.4),vertical:true,seed:1,canopy:true});
  const mainH=h-podium-2,mainW=w*.60,mainD=Math.min(d*.69,w*.94),towerZ=d>90?-d*.16:d*.08;
  curtainBox(f,-w*.16,podium+mainH/2,towerZ,mainW,mainH,mainD,{levels:Math.max(12,Math.round(mainH/4.2)),seed:b.variant+2});
  const wingH=h*.80-podium,wingW=w*.37,wingD=Math.min(d*.80,w*1.08);
  curtainBox(f,w*.30,podium+wingH/2,towerZ-d*.12,wingW,wingH,wingD,{levels:Math.max(12,Math.round(wingH/4.3)),vertical:true,seed:b.variant+1});
  const bridgeH=h*.105,bridgeY=h*.61;
  curtainBox(f,w*.04,bridgeY,towerZ,w*.77,bridgeH,Math.min(d*.89,w*1.12),{levels:Math.max(2,Math.round(bridgeH/4.2)),seed:3});
  // Strong setback seams and a projecting crown give each tower the source
  // silhouette rather than a single extruded footprint.
  box(f,-w*.16,h-.85,towerZ,mainW+1.15,.40,mainD+1.15,'frame');
  box(f,w*.30,h*.80+.12,towerZ-d*.12,wingW+.45,.24,wingD+.45,'frame');
  box(f,-w*.28,podium+.20,-d*.34,w*.30,.30,d*.20,'garden');
  for(const offset of [-.15,.15])box(f,offset*w,podium+.45,-d*.40,w*.13,.8,d*.09,'roof');
}
for(const b of buildings){currentBuilding=b.id;const f=frameFor(b);if(b.kind==='gt')gtTower(b,f);else samsungTower(b,f);b.modelFrame={center:f.center,angle:f.angle,width:f.width,depth:f.depth};}
let triangles=0;
for(const [name,b]of buckets){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));geometry.setIndex(b.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,materials[name]);mesh.name='Landmarks · '+name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);triangles+=b.indices.length/3;
}
if(triangles>80000)throw new Error('Landmark triangle budget exceeded: '+triangles);
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}};
const glb=Buffer.from(await new GLTFExporter().parseAsync(root,{binary:true}));
await fs.writeFile(path.join(out,'original-landmarks.glb'),glb);
const additionalBuildings=samsungSources.flatMap(b=>(b.rings||[b.points]).map((points,index)=>({
  id:'r'+b.id+(index?'p'+(index+1):''),name:b.name,height:b.height,levels:b.levels,points,type:'relation',relationId:b.id,
})));
const removedBuildingIds=[...new Set(samsungSources.flatMap(b=>b.componentIds||[]))];
const manifest={version:1,title:'Original Gangnam landmark reconstructions',generator:'scripts/build-gangnam-landmarks.mjs',license:'CC0-1.0 for original mesh; ODbL-1.0 for OSM-derived placement/footprint data',
  sourcePolicy:'Original geometry built from public architectural design facts and OSM footprints. No Mobiltech or other third-party downloaded geometry or photographic texture is redistributed.',
  limitations:'Recognizable exterior massing and facade rhythm; not survey/CAD accuracy. KPF tower offsets, setbacks and podium proportions are visual approximations. Samsung Life uses the documented 150 m high wing above its 136 m relation; the small 504227064 wing has an assumed 12 m fallback height. GT collision uses a straight shaft approximation of its wavy facade. No interiors.',
  geometry:{file:'original-landmarks.glb',bytes:glb.length,sha256:createHash('sha256').update(glb).digest('hex'),triangles,drawCalls:root.children.length},
  sources:[{title:'GT Tower East — Convexarchitecten',url:'https://convexarchitecten.nl/projecten/kantoren/gt-tower-east',facts:'Wavy glass tower; official diagram shows 2.5 wave lengths in five 24 m sections and diagonal facade displacement marked 1.8 m and 2.4 m.'},{title:'Samsung Seocho — KPF',url:'https://www.kpf.com/project/samsung-seocho',facts:'Interrelated joined volumes, distinct vertical and horizontal mullion systems, public plaza and podium volumes.'},{title:'OpenStreetMap',url:'https://www.openstreetmap.org/copyright',facts:'Geographical footprints, orientation, height and level tags; ODbL.'}],
  buildings:buildings.map(({id,name,label,kind,height,documentedBaseHeight,levels,points,rings,componentIds=[],modelFrame})=>({id,name:label||name,kind,height,documentedBaseHeight,levels,points,rings,componentIds,modelFrame})),
  additionalBuildings,removedBuildingIds,
  replacedBuildingIds:[...new Set([gt.id,...additionalBuildings.map(b=>b.id),...removedBuildingIds,...lifeWings.map(b=>b.id)])],
  collisionSolids,skipCollisionBuildingIds:[gt.id,...additionalBuildings.map(b=>b.id),...removedBuildingIds,...lifeWings.map(b=>b.id)],
  buildingHeightOverrides:Object.fromEntries([[gt.id,gt.height],...additionalBuildings.map(b=>[b.id,b.height]),[504227059,150],[504227064,12]]),
};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(out,'LICENSE.txt'),'Original Gangnam Landmark Meshes\n\nThese newly authored visualization meshes are dedicated under CC0 1.0:\nhttps://creativecommons.org/publicdomain/zero/1.0/\n\nOpenStreetMap-derived geographic footprints and placement remain under ODbL 1.0.\n© OpenStreetMap contributors — https://www.openstreetmap.org/copyright\n\nArchitectural design references: Convexarchitecten GT Tower East and KPF Samsung Seocho.\nThe photographs, architectural drawings, logos and third-party model files are not bundled.\nThese are independent simplified exterior reconstructions, not official manufacturer or architect CAD.\nFull references, limitations and checksums: manifest.json\n');
console.log(JSON.stringify({bytes:glb.length,triangles,drawCalls:root.children.length,buildings:buildings.map(b=>({id:b.id,name:b.label,height:b.height,frame:b.modelFrame}))},null,2));
