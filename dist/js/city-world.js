import * as THREE from 'three';
import {createTreeGroves,loadCityTreeAsset} from './city-trees.js?v=20261111-species1';
import {speciesForRoad} from './city-tree-mix.js?v=20261111-species1';
import {loadGangnamLandmarks} from './gangnam-landmarks.js?v=20261110-seoul1';
import {loadExtraGangnamBuildings} from './gangnam-extra-buildings.js?v=20261110-seoul1';
import {createStreetDetails} from './city-facades.js?v=20261110-seoul1';
import {buildingColliders} from './city-building-collision.js?v=20261110-seoul1';

const UP=new THREE.Vector3(0,1,0),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const palette=[0x9aa6ac,0xaeb9bd,0x81939d,0xc3beb3,0x8598a5,0xb8c0c3];
const hash=id=>((Math.imul(Number(id)|0,1664525)+1013904223)>>>0)/4294967296;
export function mergeCityBuildingData(data,assets=[]){
  const buildings=new Map(data.buildings.map(b=>[String(b.id),b]));
  for(const asset of assets){
    for(const id of asset.removedBuildingIds||[])buildings.delete(String(id));
    for(const building of asset.additionalBuildings||[])buildings.set(String(building.id),building);
    for(const [id,height] of Object.entries(asset.buildingHeightOverrides||{})){
      const building=buildings.get(String(id));
      if(building&&Number.isFinite(height)&&height>0)buildings.set(String(id),{...building,height});
    }
  }
  return {...data,buildings:[...buildings.values()]};
}
export function roadWidth(road){
  if(road.width>2&&road.width<55)return road.width;
  if(road.lanes>0&&road.lanes<15)return road.lanes*3.15+.8;
  return ({trunk:15,primary:13,secondary:11,tertiary:9,residential:6.2,unclassified:6.2,living_street:5,service:4.5})[road.type]||6;
}
export function pointInPolygon(x,z,points){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[i],b=points[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
function clipSegment(a,b,bounds){
  let lo=0,hi=1;const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const [p,q]of [[-dx,a[0]-bounds.minX],[dx,bounds.maxX-a[0]],[-dz,a[1]-bounds.minZ],[dz,bounds.maxZ-a[1]]]){
    if(Math.abs(p)<1e-12){if(q<0)return null;continue;}
    const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi)return null;
  }
  return [[a[0]+lo*dx,a[1]+lo*dz],[a[0]+hi*dx,a[1]+hi*dz]];
}
function stripIntersections(points,z){
  const values=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if((a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z))values.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  return values.sort((a,b)=>a-b);
}
export function createCityPlan(data,{landmarkAssets=[]}={}){
  if(!Array.isArray(data?.roads)||!Array.isArray(data?.buildings)||!Array.isArray(data?.bbox))throw new TypeError('A bounded OSM city extract is required.');
  const [south,west,north,east]=data.bbox,[lat,lon]=data.origin;
  const metreLon=111320*Math.cos(lat*Math.PI/180);
  const bounds={minX:(west-lon)*metreLon,maxX:(east-lon)*metreLon,minZ:-(north-lat)*111320,maxZ:-(south-lat)*111320};
  const roads=[],segments=[],junctions=new Map();
  for(const source of data.roads){
    const road={...source,width:roadWidth(source)};roads.push(road);
    for(let i=1;i<road.points.length;i++){
      const ends=clipSegment(road.points[i-1],road.points[i],bounds);if(!ends)continue;
      const [a,b]=ends,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.2)continue;
      const segment={road,a,b,dx:dx/length,dz:dz/length,length};segments.push(segment);
      for(const p of [a,b]){const key=p.map(n=>n.toFixed(1)).join(',');const j=junctions.get(key)||{point:p,width:0,count:0};j.width=Math.max(j.width,road.width);j.count++;junctions.set(key,j);}
    }
  }
  const buildings=data.buildings.map(source=>{
    const points=source.points.slice();if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.01)points.pop();
    const center=points.reduce((c,p)=>[c[0]+p[0]/points.length,c[1]+p[1]/points.length],[0,0]);
    const footprint=area(points),inferred=footprint>900?30+hash(source.id)*45:footprint>250?15+hash(source.id)*25:7+hash(source.id)*12;
    const height=clamp(source.height||source.levels*3.3||inferred,3,280);
    return {...source,points,center,height,heightKnown:!!(source.height||source.levels),footprint};
  }).filter(b=>b.points.length>=3&&b.footprint>8&&b.footprint<150000&&b.center[0]>bounds.minX&&b.center[0]<bounds.maxX&&b.center[1]>bounds.minZ&&b.center[1]<bounds.maxZ);
  const skipCollisionIds=new Set(landmarkAssets.flatMap(a=>[...(a.skipCollisionBuildingIds||[])]).map(String));
  const obstacles=buildings.filter(b=>!skipCollisionIds.has(String(b.id))).flatMap(buildingColliders);
  for(const asset of landmarkAssets)for(const solid of asset.collisionSolids||[]){
    if(solid.center?.length!==3||solid.size?.length!==3||!solid.center.every(Number.isFinite)||!solid.size.every(n=>Number.isFinite(n)&&n>0))throw new TypeError('Invalid landmark collision solid: '+solid.id);
    obstacles.push(solid);
  }
  // Pick a straight stretch of the real main road near the station; the offset
  // is a legal right-hand lane in the source way's direction.
  const main=segments.filter(s=>s.road.name.includes('강남대로')&&s.length>20);
  const candidates=main.length?main:segments.filter(s=>s.road.width>=9&&s.length>20);
  const chosen=candidates.sort((a,b)=>Math.hypot((a.a[0]+a.b[0])/2,(a.a[1]+a.b[1])/2)-Math.hypot((b.a[0]+b.b[0])/2,(b.a[1]+b.b[1])/2))[0]||segments[0];
  const offset=chosen.road.width*(chosen.road.oneway?.16:.23);
  const spawn={position:[(chosen.a[0]+chosen.b[0])/2-chosen.dz*offset,0,(chosen.a[1]+chosen.b[1])/2+chosen.dx*offset],heading:Math.atan2(-chosen.dz,chosen.dx)};
  return {roads,segments,buildings,junctions:[...junctions.values()],obstacles,spawn,bounds,attribution:data.attribution||'© OpenStreetMap contributors',source:data};
}

function accumulator(){return {positions:[],normals:[],uvs:[],colors:[]};}
function triangle(out,a,b,c,normal,color,uv=[[0,0],[1,0],[1,1]]){
  for(let i=0;i<3;i++){out.positions.push(...[a,b,c][i]);out.normals.push(...normal);out.uvs.push(...uv[i]);out.colors.push(color.r,color.g,color.b);}
}
function quad(out,a,b,c,d,normal,color,uv=[[0,0],[1,0],[1,1],[0,1]]){
  triangle(out,a,b,c,normal,color,[uv[0],uv[1],uv[2]]);triangle(out,a,c,d,normal,color,[uv[0],uv[2],uv[3]]);
}
function pavement(out,a,b,width,y,color){
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/length*width/2,nz=(b[0]-a[0])/length*width/2;
  const corners=[[a[0]+nx,y,a[1]+nz],[b[0]+nx,y,b[1]+nz],[b[0]-nx,y,b[1]-nz],[a[0]-nx,y,a[1]-nz]];
  // Adjacent road ways and junction patches overlap. World-aligned samples
  // keep the same asphalt under every triangle, avoiding visible patch seams.
  quad(out,...corners,[0,1,0],color,corners.map(p=>[p[0]/4,p[2]/4]));
}
function disk(out,p,r,y,color){
  for(let i=0;i<16;i++){
    const a=i*Math.PI/8,b=(i+1)*Math.PI/8,points=[[p[0],y,p[1]],[p[0]+Math.cos(b)*r,y,p[1]+Math.sin(b)*r],[p[0]+Math.cos(a)*r,y,p[1]+Math.sin(a)*r]];
    triangle(out,...points,[0,1,0],color,points.map(point=>[point[0]/4,point[2]/4]));
  }
}
function mesh(out,material,name){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(out.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(out.normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(out.uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(out.colors,3));geometry.computeBoundingSphere();
  const result=new THREE.Mesh(geometry,material);result.name=name;result.receiveShadow=true;return result;
}
function cityTexture(kind){
  const size=64,bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let mixed=Math.imul(x+1,374761393)^Math.imul(y+7,668265263);
    mixed=Math.imul(mixed^(mixed>>>13),1274126177);
    const i=(y*size+x)*4,n=((mixed^(mixed>>>16))>>>0)/4294967295;let c;
    if(kind==='glass'){
      const frame=x<2||y<3||x===32,band=y>53;
      c=frame?[76,84,89]:band?[58,75,84]:[105+n*10,138+n*10,151+n*10];
    }else if(kind==='wall'){
      const glass=x>9&&x<54&&y>13&&y<55;
      c=glass?[49+(y/size)*20,72+(y/size)*20,88+(y/size)*20]:[177+n*10,182+n*10,182+n*10];
      if(x===32&&glass)c=[152,161,165];
    }else{const grey=kind==='asphalt'?79+n*18:164+n*12;c=[grey,grey+2,grey+3];}
    bytes[i]=c[0];bytes[i+1]=c[1];bytes[i+2]=c[2];bytes[i+3]=255;
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}
function instanced(root,geometry,material,transforms,name){
  if(!transforms.length){geometry.dispose();return;}
  const result=new THREE.InstancedMesh(geometry,material,transforms.length);result.name=name;
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  transforms.forEach((t,i)=>{position.set(t[0],t[1],t[2]);q.setFromAxisAngle(UP,t[6]||0);scale.set(t[3],t[4],t[5]);matrix.compose(position,q,scale);result.setMatrixAt(i,matrix);});
  result.instanceMatrix.needsUpdate=true;result.computeBoundingSphere();root.add(result);
}
function labelTexture(text){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#167857';ctx.fillRect(0,0,512,128);ctx.strokeStyle='#d0f2e6';ctx.lineWidth=6;ctx.strokeRect(5,5,502,118);ctx.fillStyle='white';ctx.font='bold 45px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,63,480);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createCityWorld(data,{treeAsset=null,landmarkAssets=[]}={}){
  const plan=createCityPlan(mergeCityBuildingData(data,landmarkAssets),{landmarkAssets}),root=new THREE.Group();root.name='Seoul Gangnam · OpenStreetMap';
  const landmarkIds=new Set(landmarkAssets.flatMap(a=>[...(a.replacedBuildingIds||[])]).map(String));
  const neutral=new THREE.Color(0xffffff),asphaltColor=new THREE.Color(0xabb3b5),sidewalkColor=new THREE.Color(0xb6b4aa),white=new THREE.Color(0xd9ddda),yellow=new THREE.Color(0xe5b950);
  const asphaltTexture=cityTexture('asphalt'),wallTexture=cityTexture('wall'),concreteTexture=cityTexture('concrete');
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,vertexColors:true,roughness:.9,...extra});
  const roadMaterial=material(0xffffff,{map:asphaltTexture,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}),walkMaterial=material(0xffffff,{map:concreteTexture,side:THREE.DoubleSide}),paintMaterial=material(0xffffff,{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8}),wallMaterial=material(0xffffff,{map:wallTexture,roughness:.68}),roofMaterial=material(0xffffff);
  const base=new THREE.Mesh(new THREE.PlaneGeometry(plan.bounds.maxX-plan.bounds.minX+500,plan.bounds.maxZ-plan.bounds.minZ+500),new THREE.MeshStandardMaterial({color:0x92968a,roughness:1}));base.rotation.x=-Math.PI/2;base.position.y=-.04;root.add(base);
  const glassMaterial=material(0xffffff,{map:cityTexture('glass'),roughness:.24,metalness:.28,envMapIntensity:.9});
  const streets=accumulator(),walks=accumulator(),paint=accumulator(),walls=accumulator(),glassWalls=accumulator(),roofs=accumulator();
  const junctionByKey=new Map(plan.junctions.map(j=>[j.point.map(n=>n.toFixed(1)).join(','),j]));
  const poles=[],arms=[],lamps=[],trunks=[],trees=[],roofBoxes=[];
  const spatialBuildings=new Map();
  for(const b of plan.buildings){const key=Math.floor(b.center[0]/60)+','+Math.floor(b.center[1]/60);if(!spatialBuildings.has(key))spatialBuildings.set(key,[]);spatialBuildings.get(key).push(b);}
  const occupied=(x,z)=>{if(x<plan.bounds.minX||x>=plan.bounds.maxX||z<plan.bounds.minZ||z>=plan.bounds.maxZ)return true;const gx=Math.floor(x/60),gz=Math.floor(z/60);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const b of spatialBuildings.get((gx+dx)+','+(gz+dz))||[])if(pointInPolygon(x,z,b.points))return true;return false;};
  const onRoad=(x,z)=>plan.segments.some(s=>{const t=Math.max(0,Math.min(s.length,(x-s.a[0])*s.dx+(z-s.a[1])*s.dz));return Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)<s.road.width/2+.5;});
  let signs=0;
  for(const s of plan.segments){
    const width=s.road.width;pavement(walks,s.a,s.b,width+4.6,.005,sidewalkColor);pavement(streets,s.a,s.b,width,.014,asphaltColor);
    const point=(t,offset=0)=>[s.a[0]+s.dx*t-s.dz*offset,s.a[1]+s.dz*t+s.dx*offset];
    const startJ=junctionByKey.get(s.a.map(n=>n.toFixed(1)).join(',')),endJ=junctionByKey.get(s.b.map(n=>n.toFixed(1)).join(','));
    const start=startJ?.count>2?Math.max(startJ.width/2+3,8):1,end=s.length-(endJ?.count>2?Math.max(endJ.width/2+3,8):1);
    if(end>start&&width>=6){
      if(!s.road.oneway)pavement(paint,point(start),point(end),.16,.027,yellow);
      const lanes=Math.max(1,s.road.lanes||Math.round(width/3.2));
      for(let lane=1;lane<lanes;lane++){
        const offset=-width/2+width*lane/lanes;if(!s.road.oneway&&Math.abs(offset)<.3)continue;
        for(let t=start+2;t<end-2;t+=10)pavement(paint,point(t,offset),point(Math.min(t+4,end),offset),.13,.026,white);
      }
      for(const side of [-1,1])pavement(paint,point(start,side*(width/2-.3)),point(end,side*(width/2-.3)),.12,.026,white);
    }
    // Zebra crossings are attached to actual branching road nodes.
    if(width>=8&&s.length>28)for(const [j,t]of [[startJ,start],[endJ,end]])if(j?.count>2){
      for(let offset=-width/2+1;offset<width/2-1;offset+=1.4)pavement(paint,point(t-1.8,offset),point(t+1.8,offset),.65,.029,white);
    }
    if(s.length>35&&width>=8)for(let t=15;t<s.length-10;t+=48)for(const side of [-1,1]){
      const p=point(t,side*(width/2+1.65));if(occupied(...p)||onRoad(...p))continue;
      poles.push([p[0],3.4,p[1],.13,6.8,.13]);
      const inward=-side,tip=point(t,side*(width/2+.15));
      arms.push([(p[0]+tip[0])/2,6.75,(p[1]+tip[1])/2,1.65,.12,.12,Math.atan2(-s.dx,s.dz)]);
      lamps.push([tip[0],6.7,tip[1],.75,.14,.32,Math.atan2(-s.dz,s.dx)]);
      const tree=point(t+12,side*(width/2+1.6));if(!occupied(...tree)&&!onRoad(...tree)){
        const variation=hash(s.road.id+t*101+side*73),height=5.8+variation*1.4;
        trunks.push([tree[0],height*.28,tree[1],.21,height*.56,.21]);
        trees.push({x:tree[0],z:tree[1],height,rotation:variation*Math.PI*2,species:speciesForRoad(s.road),seed:variation});
      }
    }
    if(signs<14&&s.road.name&&s.length>65&&width>=11&&hash(s.road.id)>.35){
      const texture=labelTexture(s.road.name);if(texture){const sign=new THREE.Mesh(new THREE.PlaneGeometry(5.6,1.4),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));const p=point(19,width/2+1.9);sign.position.set(p[0],5.4,p[1]);sign.rotation.y=Math.atan2(s.dx,s.dz);root.add(sign);signs++;}
    }
  }
  for(const j of plan.junctions){disk(walks,j.point,j.width/2+2.3,.004,sidewalkColor);disk(streets,j.point,j.width/2,.018,asphaltColor);}
  for(const b of plan.buildings){
    if(landmarkIds.has(String(b.id)))continue;
    const color=new THREE.Color(palette[Math.floor(hash(b.id)*palette.length)]),roofColor=color.clone().multiplyScalar(.63),points=b.points;
    const contour=points.map(p=>new THREE.Vector2(p[0],p[1]));
    const faces=THREE.ShapeUtils.triangulateShape(contour,[]);
    for(const f of faces){const vertices=f.map(i=>[points[i][0],b.height,points[i][1]]);triangle(roofs,vertices[0],vertices[2],vertices[1],[0,1,0],roofColor);}
    let distance=0;const signed=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    for(let i=0;i<points.length;i++){
      const a=points[i],c=points[(i+1)%points.length],length=Math.hypot(c[0]-a[0],c[1]-a[1]);if(length<.03)continue;
      const normal=[(c[1]-a[1])/length*(signed>0?1:-1),0,-(c[0]-a[0])/length*(signed>0?1:-1)];
      const vertices=[[a[0],0,a[1]],[a[0],b.height,a[1]],[c[0],b.height,c[1]],[c[0],0,c[1]]],uv=[[distance/3.2,0],[distance/3.2,b.height/3.4],[(distance+length)/3.2,b.height/3.4],[(distance+length)/3.2,0]];
      const facade=b.height>42&&b.footprint>220?glassWalls:walls;
      if(signed>0)quad(facade,...vertices,normal,color,uv);else quad(facade,vertices[3],vertices[2],vertices[1],vertices[0],normal,color,[uv[3],uv[2],uv[1],uv[0]]);
      distance+=length;
    }
    if(b.footprint>200&&pointInPolygon(b.center[0],b.center[1],points))roofBoxes.push([b.center[0],b.height+.7,b.center[1],2.7,1.4,2.1]);
  }
  root.add(mesh(walks,walkMaterial,'real road sidewalks'),mesh(streets,roadMaterial,'OSM road network'),mesh(paint,paintMaterial,'lane markings and crossings'),mesh(walls,wallMaterial,'OSM building facades'),mesh(roofs,roofMaterial,'OSM building roofs'));
  const curtainWalls=mesh(glassWalls,glassMaterial,'office curtain walls');curtainWalls.castShadow=true;root.add(curtainWalls);
  root.add(createStreetDetails(plan.buildings,plan.segments,{excludedIds:landmarkIds}));
  for(const asset of landmarkAssets)if(asset.root)root.add(asset.root);
  const steel=new THREE.MeshStandardMaterial({color:0x74818a,roughness:.55,metalness:.55}),light=new THREE.MeshStandardMaterial({color:0xe0e8df,emissive:0xa9b5a3,emissiveIntensity:.25,roughness:.55});
  instanced(root,new THREE.CylinderGeometry(1,1,1,6),steel,poles,'streetlight poles');instanced(root,new THREE.BoxGeometry(1,1,1),steel,arms,'streetlight arms');instanced(root,new THREE.BoxGeometry(1,1,1),light,lamps,'streetlight lamps');
  const treeGroves=createTreeGroves(treeAsset,trees);root.add(treeGroves);
  instanced(root,new THREE.BoxGeometry(1,1,1),steel,roofBoxes,'rooftop equipment');
  for(const [kind,items]of [['lamp',poles],['tree',trunks]])items.forEach((t,i)=>plan.obstacles.push({id:kind+'-'+i,center:[t[0],t[1],t[2]],size:[t[3]*2,t[4],t[5]*2]}));
  const bins=new Map(),cell=80;
  plan.obstacles.forEach((box,index)=>{const [x,,z]=box.center,[w,,d]=box.size;for(let gx=Math.floor((x-w/2)/cell);gx<=Math.floor((x+w/2)/cell);gx++)for(let gz=Math.floor((z-d/2)/cell);gz<=Math.floor((z+d/2)/cell);gz++){const key=gx+','+gz;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(index);}});
  const obstaclesNear=(x,z,radius=80)=>{const indices=new Set();for(let gx=Math.floor((x-radius)/cell);gx<=Math.floor((x+radius)/cell);gx++)for(let gz=Math.floor((z-radius)/cell);gz<=Math.floor((z+radius)/cell);gz++)for(const index of bins.get(gx+','+gz)||[])indices.add(index);return [...indices].map(i=>plan.obstacles[i]);};
  const nearestRoadName=(x,z)=>{let best=Infinity,name='강남역 주변';for(const s of plan.segments){const t=clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.length),d=Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t);if(d<best&&s.road.name){best=d;name=s.road.name;}}return name;};
  return {...plan,root,treeAsset,landmarkAssets,treeGroves,treePlacements:trees,obstaclesNear,nearestRoadName,dispose(){const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials){for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();}for(const t of textures)t.dispose();}};
}
export async function loadCityWorld(){
  const [response,treeAsset,landmarks,extraBuildings]=await Promise.all([fetch(new URL('../assets/city/gangnam.json',import.meta.url)),loadCityTreeAsset(),loadGangnamLandmarks(),loadExtraGangnamBuildings()]);
  if(!response.ok)throw new Error('강남 도로 데이터를 불러오지 못했습니다.');
  return createCityWorld(await response.json(),{treeAsset,landmarkAssets:[landmarks,extraBuildings]});
}
