// Original, photo-referenced reconstructions; no third-party building mesh is copied.
// Run from the repository root: node scripts/prepare-extra-gangnam-buildings.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';

const out=path.resolve('dist/assets/city-buildings');
const footprints=JSON.parse(await fs.readFile('docs/research/gangnam-landmark-footprints.json','utf8'));
const sourceMap=JSON.parse(await fs.readFile('dist/assets/city/gangnam.json','utf8'));
const materialSpecs=[
  ['Terracotta brick',0x96513c,.93,.02],['Dark bronze recesses',0x3c302b,.72,.2],
  ['Recessed glazing',0x23333f,.28,.42],['Blue grey glass',0x69858d,.24,.48],
  ['Pale reflected glass',0x91a4a5,.27,.42],['Blue reflected glass',0x4b6c7c,.24,.5],
  ['Warm concrete',0xc5c4b7,.88,.02],['Window frames',0x576267,.65,.4],
  ['Roof and garden soil',0x45483a,.99,0],['Trunks',0x56432c,.99,0],
  ['Terrace foliage',0x4d643d,.96,0],['Column stone',0xbebbb1,.82,.03]
];
const names={brick:0,bronze:1,dark:2,glass:3,pale:4,blue:5,concrete:6,metal:7,soil:8,trunk:9,leaf:10,stone:11};
const geometries=[];
let active;
let localSolids=[];
const collisionSolids=[];
function solid(x,y,z,w,h,d){localSolids.push({x,y,z,w,h,d});}
const vec=p=>new THREE.Vector3(...p);
const matrix=(p,s,q)=>new THREE.Matrix4().compose(vec(p),q||new THREE.Quaternion(),vec(s));
function addGeometry(g,mat,m=new THREE.Matrix4()){
  const geo=(g.index?g.toNonIndexed():g.clone()).applyMatrix4(m),bucket=active.get(mat)||{p:[],n:[],uv:[]};
  bucket.p.push(...geo.attributes.position.array);bucket.n.push(...geo.attributes.normal.array);
  if(geo.attributes.uv)bucket.uv.push(...geo.attributes.uv.array);else bucket.uv.push(...Array(geo.attributes.position.count*2).fill(0));
  active.set(mat,bucket);geo.dispose();g.dispose();
}
function box(mat,x,y,z,w,h,d){if(w<=0||h<=0||d<=0)return;addGeometry(new THREE.BoxGeometry(w,h,d),mat,matrix([x,y,z],[1,1,1]));}
function bar(mat,a,b,width,depth=width){const delta=vec(b).sub(vec(a)),mid=vec(a).add(vec(b)).multiplyScalar(.5),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());addGeometry(new THREE.BoxGeometry(width,delta.length(),depth),mat,matrix(mid.toArray(),[1,1,1],q));}
function quad(mat,a,b,c,d,normal){
  if(vec(b).sub(vec(a)).cross(vec(d).sub(vec(a))).dot(vec(normal))<0)[b,d]=[d,b];
  const p=[...a,...b,...c,...a,...c,...d],n=Array.from({length:6},()=>normal).flat();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));addGeometry(g,mat);
}
function front(mat,x0,x1,y0,y1,z,sign=-1){quad(mat,[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],[0,0,sign]);}
function side(mat,z0,z1,y0,y1,x,sign=1){quad(mat,[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0],[sign,0,0]);}
function roof(mat,x0,x1,z0,z1,y,sign=1){quad(mat,[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],[0,sign,0]);}
function foliage(x,y,z,s=1){
  addGeometry(new THREE.CylinderGeometry(.10*s,.17*s,2.2*s,5),names.trunk,matrix([x,y+1.1*s,z],[1,1,1]));
  addGeometry(new THREE.IcosahedronGeometry(1.45,1),names.leaf,matrix([x,y+2.8*s,z],[s,1.35*s,s]));
}
function frameBounds(source,e){
  const l=Math.hypot(...e);e=e.map(n=>n/l);const z=[-e[1],e[0]],p=source.rings.flat(),xs=p.map(p=>p[0]*e[0]+p[1]*e[1]),zs=p.map(p=>p[0]*z[0]+p[1]*z[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs),cx=(x0+x1)/2,cz=(z0+z1)/2;
  return {center:[cx*e[0]+cz*z[0],cx*e[1]+cz*z[1]],width:x1-x0,depth:z1-z0,angle:Math.atan2(e[1],e[0])};
}
function kyobo(W,D,H){
  H-=1.5; // Reserve the final 1.5 m for the open steel crown.
  const gap=18.3,wing=(W-gap)/2,xs=[-(gap+wing)/2,(gap+wing)/2];
  for(const x of xs){
    // The two red masonry slabs have largely blind ends and horizontal side glazing.
    box(names.brick,x,(H+4)/2,0,wing,H-4,D);
    solid(x,(H+4)/2,0,wing,H-4,D);
    for(const sign of [-1,1]){
      const z=sign*(D/2+.025);
      for(let y=5;y<H-18;y+=1.12){front(names.bronze,x-wing/2,x+wing/2,y,y+.065,z,sign);}
      for(let y=16;y<H-19;y+=1.48){front(names.dark,x-.31,x+.31,y,y+.56,z+sign*.016,sign);}
      // Upper screen of closely spaced vertical fins, below the open crown.
      front(names.dark,x-wing/2+.65,x+wing/2-.65,H-18,H-2,z+sign*.03,sign);
      const count=18;for(let k=0;k<=count;k++){const xx=x-wing/2+.65+(wing-1.3)*k/count;box(names.brick,xx,H-10,z+sign*.18,.36,16,.42);}
      for(let y=4.8;y<15;y+=1.4){front(names.dark,x-wing/2+.3,x+wing/2-.3,y,y+.65,z+sign*.015,sign);}
    }
    for(const sign of [-1,1]){
      const xx=x+sign*(wing/2+.03);
      for(let y=6;y<H-17;y+=1.45){side(names.dark,-D/2+.5,D/2-.5,y,y+.74,xx,sign);}
      // Stone mullions are visible through the continuous narrow window strips.
      for(let z=-D/2+4;z<D/2;z+=4.5)box(names.brick,xx+sign*.025,(H-11)/2+4,z,.20,H-19,.22);
      side(names.dark,-D/2+1.5,D/2-1.5,H-16,H-1,xx+.02*sign,sign);
      for(let z=-D/2+1.6;z<D/2;z+=3.6)box(names.metal,xx+.04*sign,H-8.5,z,.13,15,.13);
    }
    roof(names.soil,x-wing/2+.4,x+wing/2-.4,-D/2+.4,D/2-.4,H-.5);
    // Open steel crown rather than a solid extruded rooftop box.
    for(const zz of [-D/2+1,D/2-1])for(let k=0;k<6;k++){
      const a=x-wing/2+.7+k*(wing-1.4)/6,b=x-wing/2+.7+(k+1)*(wing-1.4)/6;
      bar(names.metal,[a,H-.1,zz],[b,H+1.4,zz],.22);bar(names.metal,[a,H+1.4,zz],[b,H-.1,zz],.22);
    }
    for(const z of [-D/2+1.1,D/2-1.1])for(const dx of [-wing*.25,wing*.25]){
      addGeometry(new THREE.CylinderGeometry(.75,.75,5,12),names.stone,matrix([x+dx,2.5,z],[1,1,1]));
      solid(x+dx,2.5,z,1.05,5,1.05);
      for(let y=.45;y<5;y+=.65)addGeometry(new THREE.CylinderGeometry(.765,.765,.17,12),names.metal,matrix([x+dx,y,z],[1,1,1]));
    }
  }
  // Glazed links are recessed, preserving the deep central gap and twin silhouette.
  box(names.dark,0,7,0,gap+1,14,D*.38);
  solid(0,7,0,gap+1,14,D*.38);
  box(names.dark,0,H-9,0,gap+1,9,D*.48);
  solid(0,H-9,0,gap+1,9,D*.48);
  for(let x=-gap/2;x<=gap/2;x+=2.4)for(const z of [-D*.24-.03,D*.24+.03])box(names.metal,x,H-9,z,.11,9,.16);
  for(let y=H-13.5;y<=H-4.5;y+=2)for(const z of [-D*.24-.06,D*.24+.06])box(names.metal,0,y,z,gap,.14,.14);
  box(names.brick,0,H-3.7,0,gap+1,1.2,D*.48);
  solid(0,H-3.7,0,gap+1,1.2,D*.48);
}
function monaco(W,D,H){
  const base=17,nx=9,nz=7,nf=23,dx=W/nx,dz=D/nz,dh=(H-base)/nf;
  // U-shaped tower open to the southern court. Cuts are a visual reconstruction,
  // not a surveyed apartment layout. Each removes several full storeys.
  const cuts=[
    [0,2,0,2,2,5],[6,9,0,2,5,8],[0,2,0,2,10,13],[6,9,0,2,14,17],[0,2,0,2,18,21],[6,9,0,2,20,23],
    [0,2,3,5,6,9],[0,2,5,7,15,18],[7,9,3,5,2,5],[7,9,5,7,10,13],[7,9,3,5,18,21],
    [1,3,5,7,3,6],[0,2,5,7,20,23],[6,8,5,7,15,18],[3,5,0,1,8,10]
  ];
  const occupied=(i,j,k)=>i>=0&&i<nx&&j>=0&&j<nz&&k>=0&&k<nf&&!(j>=3&&i>=3&&i<6)&&!cuts.some(([a,b,c,d,e,f])=>i>=a&&i<b&&j>=c&&j<d&&k>=e&&k<f);
  // Merge only vertically contiguous occupied cells. Missing matrix recesses
  // and the southern court stay passable at their actual rendered heights.
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)for(let k=0;k<nf;){
    if(!occupied(i,j,k)){k++;continue;}
    const start=k;while(k<nf&&occupied(i,j,k))k++;
    solid(-W/2+(i+.5)*dx,base+(start+k)*dh/2,-D/2+(j+.5)*dz,dx,(k-start)*dh,dz);
  }
  const glass=(i,j,k)=>[names.glass,names.pale,names.blue][Math.abs((i*17+j*11+k*7+(i*k)%5))%3];
  function windowFace(i,j,k,axis,sgn){
    const x0=-W/2+i*dx,x1=x0+dx,z0=-D/2+j*dz,z1=z0+dz,y0=base+k*dh,y1=y0+dh;
    const outer=axis==='x'?(i===0||i===nx-1):(j===0||j===nz-1),mat=outer?names.metal:names.bronze;
    if(axis==='x')side(mat,z0,z1,y0,y1,sgn<0?x0:x1,sgn);else front(mat,x0,x1,y0,y1,sgn<0?z0:z1,sgn);
    const cols=2,rows=2;
    for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
      const ua=(c+.025)/cols,ub=(c+.975)/cols,va=(r+.03)/rows,vb=(r+.96)/rows;
      const a=y0+va*dh,b=y0+vb*dh,gm=outer?glass(i+c,j+r,k):names.dark;
      if(axis==='x')side(gm,z0+ua*dz,z0+ub*dz,a,b,(sgn<0?x0-.018:x1+.018),sgn);
      else front(gm,x0+ua*dx,x0+ub*dx,a,b,(sgn<0?z0-.018:z1+.018),sgn);
    }
  }
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++)for(let k=0;k<nf;k++)if(occupied(i,j,k)){
    for(const s of [-1,1]){if(!occupied(i+s,j,k))windowFace(i,j,k,'x',s);if(!occupied(i,j+s,k))windowFace(i,j,k,'z',s);}
    const x0=-W/2+i*dx,x1=x0+dx,z0=-D/2+j*dz,z1=z0+dz;
    if(!occupied(i,j,k+1))roof(names.soil,x0,x1,z0,z1,base+(k+1)*dh);
    if(!occupied(i,j,k-1))roof(names.bronze,x0,x1,z0,z1,base+k*dh,-1);
  }
  // The recessed garden floors and low glass rails are modeled in depth.
  for(const [a,b,c,d,e]of cuts){
    const x=(-W/2+(a+b)*dx/2),z=(-D/2+(c+d)*dz/2),y=base+e*dh;
    box(names.concrete,x,y-.12,z,(b-a)*dx,.24,(d-c)*dz);
    solid(x,y-.12,z,(b-a)*dx,.24,(d-c)*dz);
    const count=Math.min(3,b-a+1);for(let t=0;t<count;t++)foliage(x+(t-(count-1)/2)*2.6,y,z,0.66+(t%2)*.18);
    const zfront=c===0?-D/2-.06:z-(d-c)*dz/2;
    front(names.pale,x-(b-a)*dx/2,x+(b-a)*dx/2,y+.15,y+1.05,zfront,-1);
  }
  // Transparent-looking blue podium behind the continuous ivory diagonal web.
  box(names.dark,0,base/2,0,W-.8,base-.3,D-.8);
  solid(0,base/2,0,W-.8,base-.3,D-.8);
  for(const s of [-1,1]){
    for(let x=-W/2+1;x<W/2;x+=3.2)box(names.metal,x,base/2,s*(D/2-.38),.13,base,.14);
    for(let z=-D/2+1;z<D/2;z+=3.2)box(names.metal,s*(W/2-.38),base/2,z,.14,base,.13);
    for(const y of [4.5,8.8,13.1,16.7]){box(names.metal,0,y,s*(D/2-.36),W,.15,.14);box(names.metal,s*(W/2-.36),y,0,.14,.15,D);}
  }
  // A triangulated structural facade reproduces the most visible street feature.
  // Vertices jitter deterministically, avoiding a uniform X-pattern.
  function lattice(length,axis,sign){
    const n=Math.round(length/6.8),step=length/n,levels=[3.8,8.4,12.7,17],points=[];
    for(let row=0;row<4;row++){const line=[];for(let col=0;col<=n;col++){const along=-length/2+col*step+(col===0||col===n?0:Math.sin(col*3+row*7)*1.25),y=levels[row]+(row===0||row===3?0:Math.sin(col*5+row)*.8);line.push(axis==='x'?[along,y,sign*D/2]:[sign*W/2,y,along]);}points.push(line);}
    for(let row=0;row<3;row++)for(let col=0;col<n;col++){
      const a=points[row][col],b=points[row][col+1],c=points[row+1][col],d=points[row+1][col+1];
      bar(names.concrete,a,c,.65,.72);bar(names.concrete,a,d,1.03,.78);
      if((row+col)%2===0)bar(names.concrete,b,c,.75,.72);
    }
    for(let row=0;row<4;row++)for(let col=0;col<n;col++)bar(names.concrete,points[row][col],points[row][col+1],.62,.72);
  }
  for(const s of [-1,1]){lattice(W,'x',s);lattice(D,'z',s);}
  box(names.concrete,0,base+.1,0,W+.3,.4,D+.3);
  solid(0,base+.1,0,W+.3,.4,D+.3);
  // Keep the courtyard open above the retail podium.
  box(names.soil,0,base+.42,D*.23,W/3,.1,D*.52);
}

const definitions=[
  {id:7747040,key:'kyobo-tower',english:'Kyobo Tower',axis:[.35,.93675],build:kyobo,features:['paired terracotta slabs','deep central recess','narrow horizontal side windows','vertical crown screens','glazed high bridge','striped entrance columns'],references:[{url:'https://www.kyobotower.co.kr/en/intro',kind:'official owner, specifications and exterior photograph',image:'https://www.kyobotower.co.kr/images/building/tower/kyobo-main-1.webp'}]},
  {id:19640833,key:'boutique-monaco',english:'Boutique Monaco',axis:[.936,-.352],build:monaco,features:['U-shaped tower','fifteen multi-storey recessed spaces','terrace gardens','mixed blue-grey curtain wall panels','ivory diagonal podium structure'],references:[{url:'https://architizer.com/projects/missing-matrix-building-boutique-monaco/',kind:'architect project description, Mass Studies'},{url:'https://www.skyscrapercenter.com/building/boutique-monaco/4839',kind:'Council on Vertical Urbanism building record and exterior photographs',images:['https://images.skyscrapercenter.com/building/boutiquemonaco_overall1_mg.jpg','https://images.skyscrapercenter.com/building/boutiquemonaco_base_mg.jpg']}]}];
const modelRecords=[],additionalBuildings=[],removedBuildingIds=[];
function appendWorldSolids(frame,id){
  const c=Math.cos(frame.angle),s=Math.sin(frame.angle),toWorld=([x,z])=>[frame.center[0]+c*x-s*z,frame.center[1]+s*x+c*z];
  const intersections=(p,z)=>{const xs=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if((a[1]<=z&&b[1]>z)||(b[1]<=z&&a[1]>z))xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));}return xs.sort((a,b)=>a-b);};
  for(const b of localSolids){
    const p=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>toWorld([b.x+x*b.w/2,b.z+z*b.d/2]));
    const zmin=Math.min(...p.map(p=>p[1])),zmax=Math.max(...p.map(p=>p[1])),count=Math.max(1,Math.ceil((zmax-zmin)/2)),step=(zmax-zmin)/count;
    for(let k=0;k<count;k++){
      const z0=zmin+k*step+.004,z1=zmin+(k+1)*step-.004,lines=[intersections(p,z0),intersections(p,(z0+z1)/2),intersections(p,z1)];
      if(lines.some(a=>a.length<2))continue;
      const x0=Math.max(...lines.map(a=>a[0]))+.004,x1=Math.min(...lines.map(a=>a.at(-1)))-.004;
      if(x1-x0>.06)collisionSolids.push({id:'extra-landmark-'+id+'-'+collisionSolids.length,center:[(x0+x1)/2,b.y,(z0+z1)/2],size:[x1-x0,b.h,z1-z0]});
    }
  }
}
for(const d of definitions){
  const source=footprints.find(b=>b.id===d.id),frame=frameBounds(source,d.axis);active=new Map();localSolids=[];d.build(frame.width,frame.depth,source.height);appendWorldSolids(frame,d.id);
  geometries.push({name:d.english,frame,buckets:active});
  const ids=[];for(const [i,points]of source.rings.entries()){
    const id='r'+d.id+(i?'p'+(i+1):'');ids.push(id);
    additionalBuildings.push({id,name:source.name,type:'commercial',height:source.height,levels:Number(source.levels),points,location:null,layer:0});
  }
  // OSM separately tags Monaco facade fragments and Kyobo's bridge/podium parts.
  // Their old full-height extrusions would fill the reconstructed open spaces.
  const attached=d.id===19640833?[504791066,504791067,504791069,504791070]:d.id===7747040?[541900101,541900103,541900105]:[];
  removedBuildingIds.push(...[...source.componentIds,...attached].filter(id=>sourceMap.buildings.some(b=>b.id===id)));
  modelRecords.push({key:d.key,name:source.name,englishName:d.english,relationId:d.id,buildingIds:ids,center:frame.center,height:source.height,width:frame.width,depth:frame.depth,rotationRadians:-frame.angle,features:d.features,sourceFootprint:source.source,references:d.references,accuracy:'Original visual reconstruction from public exterior references and OSM footprints. Facade details, interior void dimensions and terrace vegetation are approximate; not an official or surveyed building model.'});
}

// Compact GLB with one primitive per used material/building. No browser exporter,
// network access or protected source meshes are needed to reproduce these files.
const doc={asset:{version:'2.0',generator:'Roadster original Gangnam landmark reconstruction'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:materialSpecs.map(([name,color,roughness,metallic])=>({name,pbrMetallicRoughness:{baseColorFactor:[...new THREE.Color(color).toArray(),1],roughnessFactor:roughness,metallicFactor:metallic}})),buffers:[],bufferViews:[],accessors:[]};
const chunks=[];let byteLength=0,triangles=0,drawCalls=0;
function attribute(values,type){const a=new Float32Array(values),b=Buffer.from(a.buffer),v=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:b.length,target:34962});chunks.push(b);byteLength+=b.length;const size=type==='VEC3'?3:2,accessor={bufferView:v,componentType:5126,count:a.length/size,type};if(type==='VEC3'){accessor.min=Array(size).fill(Infinity);accessor.max=Array(size).fill(-Infinity);for(let i=0;i<a.length;i++){accessor.min[i%size]=Math.min(accessor.min[i%size],a[i]);accessor.max[i%size]=Math.max(accessor.max[i%size],a[i]);}}doc.accessors.push(accessor);return doc.accessors.length-1;}
for(const g of geometries){
  const primitives=[];for(const [material,b]of g.buckets){primitives.push({attributes:{POSITION:attribute(b.p,'VEC3'),NORMAL:attribute(b.n,'VEC3'),TEXCOORD_0:attribute(b.uv,'VEC2')},material});triangles+=b.p.length/9;drawCalls++;}
  const ni=doc.nodes.length,mi=doc.meshes.length;doc.meshes.push({name:g.name,primitives});doc.nodes.push({name:g.name,mesh:mi,translation:[g.frame.center[0],0,g.frame.center[1]],rotation:[0,Math.sin(-g.frame.angle/2),0,Math.cos(-g.frame.angle/2)]});doc.scenes[0].nodes.push(ni);
}
if(triangles>32000)throw new Error('Landmarks exceeded the 32k triangle budget: '+triangles);
doc.buffers.push({byteLength});doc.extras={models:modelRecords.map(r=>({name:r.name,originalReconstruction:true,buildingIds:r.buildingIds})),triangles,drawCalls};
const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,0x20)]),bin=Buffer.concat(chunks),header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+json.length+8+bin.length,8);jh.writeUInt32LE(json.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
const glb=Buffer.concat([header,jh,json,bh,bin]);
const manifest={asset:'extra-landmarks.glb',format:'glTF 2.0 binary',triangles,drawCalls,modelCount:modelRecords.length,sha256:crypto.createHash('sha256').update(glb).digest('hex'),models:modelRecords,additionalBuildings,removedBuildingIds,replacedBuildingIds:[...additionalBuildings.map(b=>b.id),...removedBuildingIds],buildingHeightOverrides:Object.fromEntries(additionalBuildings.map(b=>[b.id,b.height])),collisionSolids,skipCollisionBuildingIds:[...additionalBuildings.map(b=>b.id),...removedBuildingIds]};
const provenance={created:'2026-11-09',asset:manifest.asset,sha256:manifest.sha256,origin:'Original authored geometry generated by scripts/prepare-extra-gangnam-buildings.mjs; not imported from Mobiltech, Modelink, Sketchfab or a commercial marketplace.',geometryLicense:'CC0-1.0 for newly authored visualization meshes; architectural design attribution retained below.',geometryLicenseUrl:'https://creativecommons.org/publicdomain/zero/1.0/',footprintLicense:'Open Database License 1.0',footprintAttribution:'© OpenStreetMap contributors',footprintLicenseUrl:'https://opendatacommons.org/licenses/odbl/1-0/',referenceImagesIncluded:false,thirdPartyMeshIncluded:false,limitations:'Building silhouettes and visible features are reconstructed. Detailed panel layouts, recess dimensions, furnishings and foliage are approximations, not measured replicas.',models:modelRecords,stats:{triangles,drawCalls,bytes:glb.length}};
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'extra-landmarks.glb'),glb);await fs.writeFile(path.join(out,'extra-landmarks.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(out,'provenance-extra.json'),JSON.stringify(provenance,null,2)+'\n');console.log(JSON.stringify(provenance.stats));
