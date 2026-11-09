import * as THREE from 'three';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const hash=id=>((Math.imul(Number(id)|0,1664525)+1013904223)>>>0)/4294967296;
const MAX_INSTANCES=10000;

// Original, generic street-level detailing on OSM footprints. These are visual
// inferences, not surveyed replicas or externally downloaded building assets.
export function createStreetDetails(buildings,segments,{excludedIds=new Set()}={}){
  const root=new THREE.Group();root.name='OSM street-front architectural details';
  const definitions=[
    ['podium-glazing',0x334a54,.24,.3],
    ['window-frames',0x858e91,.5,.5],
    ['stone-entrances',0xbbb8aa,.87,.05],
    ['recessed-doors',0x1b292e,.3,.25],
    ['entrance-canopies',0x626d72,.6,.35],
    ['roof-parapets',0x8c9394,.88,.05],
  ];
  const batches=definitions.map(()=>[]),dummy=new THREE.Object3D();let instanceCount=0,buildingCount=0;
  const add=(batch,x,y,z,w,h,d,angle,color)=>{
    if(instanceCount>=MAX_INSTANCES||![x,y,z,w,h,d,angle].every(Number.isFinite)||w<=0||h<=0||d<=0)return;
    batches[batch].push({x,y,z,w,h,d,angle,color});instanceCount++;
  };
  const nearestRoad=(x,z)=>{
    let best=null;
    for(const s of segments){
      if(!s.a||!s.b||!(s.length>0))continue;
      const t=clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.length);
      const qx=s.a[0]+s.dx*t,qz=s.a[1]+s.dz*t,distance=Math.hypot(qx-x,qz-z);
      if(!best||distance<best.distance)best={qx,qz,distance,width:s.road?.width||6};
    }
    return best;
  };
  const candidates=buildings.filter(b=>{
    const c=b.center||[0,0];
    return !excludedIds.has(b.id)&&Math.hypot(c[0],c[1])<=450&&b.height>=7&&b.points?.length>=3;
  }).sort((a,b)=>Math.hypot(...a.center)-Math.hypot(...b.center));
  for(const b of candidates){
    if(instanceCount>MAX_INSTANCES-70)break;
    const points=b.points.slice();
    if(points.length>1&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.01)points.pop();
    const signed=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
    if(Math.abs(signed)<1)continue;
    const edges=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],c=points[(i+1)%points.length],length=Math.hypot(c[0]-a[0],c[1]-a[1]);
      if(length<3)continue;
      const dx=(c[0]-a[0])/length,dz=(c[1]-a[1])/length,nx=dz*Math.sign(signed),nz=-dx*Math.sign(signed);
      const x=(a[0]+c[0])/2,z=(a[1]+c[1])/2,road=nearestRoad(x,z);
      if(!road)continue;
      const facing=((road.qx-x)*nx+(road.qz-z)*nz)/Math.max(.01,road.distance);
      edges.push({a,c,length,dx,dz,nx,nz,x,z,angle:Math.atan2(-dz,dx),road,facing});
    }
    const front=edges.filter(e=>e.length>=5&&e.facing>.35&&e.road.distance<45&&e.road.distance-e.road.width/2>.18)
      .sort((a,c)=>(a.road.distance-a.facing*5)-(c.road.distance-c.facing*5))[0];
    if(!front)continue;
    buildingCount++;
    const v=hash(b.id),tint=new THREE.Color().setHSL(.56+v*.05,.12,.7+v*.12);
    const {length,dx,dz,nx,nz,x,z,angle}=front;
    const at=(batch,along,y,w,h,depth,offset,color)=>add(batch,x+dx*along+nx*offset,y,z+dz*along+nz*offset,w,h,depth,angle,color);
    const usable=length-.7,podium=Math.min(4.1,b.height*.36),bays=clamp(Math.floor(usable/3.1),1,14),bayWidth=usable/bays;
    // All applied facade pieces project at most 10 cm beyond the building.
    at(0,0,podium/2+.15,usable,podium,.035,.035,tint);
    at(2,0,.21,usable,.26,.08,.04,tint);
    at(2,0,podium+.23,usable+.14,.3,.09,.045,tint);
    for(let i=0;i<=bays;i++)at(1,-usable/2+bayWidth*i,podium/2+.15,.085,podium+.14,.09,.045,tint);
    at(1,0,1.08,usable,.065,.08,.04,tint);
    const doorWidth=Math.min(2.3,bayWidth*.8),doorCenter=bayWidth*(Math.floor(bays/2)+.5)-usable/2;
    at(3,doorCenter,1.22,doorWidth,2.35,.04,.062);
    for(const side of [-1,1])at(1,doorCenter+side*doorWidth/2,1.23,.08,2.45,.09,.045);
    at(1,doorCenter,2.45,doorWidth+.12,.085,.09,.045);
    at(1,doorCenter,1.23,.045,2.35,.09,.045);
    // The canopy is largely inset, preserving the real sidewalk envelope.
    at(4,doorCenter,2.72,doorWidth+.75,.17,.8,-.32,tint);
    if(b.height>=30&&length>=10){
      const fins=Math.min(8,Math.floor(length/3.8)),finHeight=b.height-podium-1.8;
      for(let i=1;i<fins;i++)at(1,-usable/2+usable*i/fins,podium+.8+finHeight/2,.095,finHeight,.1,.05,tint);
      for(let y=podium+10;y<b.height-4;y+=Math.max(10,b.height/5))at(1,0,y,usable,.12,.09,.045,tint);
    }
    // Parapets sit inside the footprint; no extended boxes cover the pavement.
    for(const e of edges){
      if(e.length<4)continue;
      add(5,e.x-e.nx*.16,b.height+.28,e.z-e.nz*.16,e.length-.15,.56,.32,e.angle,tint);
    }
  }
  const geometry=new THREE.BoxGeometry(1,1,1);
  for(let i=0;i<batches.length;i++){
    const transforms=batches[i];if(!transforms.length)continue;
    const [name,color,roughness,metalness]=definitions[i];
    const material=new THREE.MeshStandardMaterial({color,roughness,metalness});
    const mesh=new THREE.InstancedMesh(geometry,material,transforms.length);mesh.name=name;
    for(let n=0;n<transforms.length;n++){
      const t=transforms[n];dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(t.w,t.h,t.d);dummy.updateMatrix();
      mesh.setMatrixAt(n,dummy.matrix);mesh.setColorAt(n,t.color||new THREE.Color(0xffffff));
    }
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=false;root.add(mesh);
  }
  root.userData={kind:'original-inferred-facades',buildings:buildingCount,instances:instanceCount,triangles:instanceCount*12,drawCalls:root.children.length,maximumProjectionMetres:.1};
  return root;
}
