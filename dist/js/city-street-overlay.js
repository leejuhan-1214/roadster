import * as THREE from 'three';
import {pointOn,roadSegments,indexRoadSegments,planMedianPavement} from './city-median.js?v=20261118-frameperf1';
export {roadSegments};

// Street detail laid over the mapped roads, built in 256 m cells around the
// vehicle: the pavement between the two carriageways of a divided avenue with
// its centre line, the blue line of Gangnam-daero's median bus lane, signal
// masts at mapped signal positions and subway entrances with their exit
// numbers. Positions come from OpenStreetMap; shapes are generic.
export const STREET_CELL=256,STREET_NEAR=560,STREET_DROP=840;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distanceTo=(x,z,s)=>{const t=clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.length);return Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t);};

// Each physical furniture part feeds both the mesh and the rotated footprint.
// Separate the elevated cross-arm from its mast so vehicles pass underneath.
function furnitureParts(plan,key){
  const parts=[];
  const steel=0x78878e,dark=0x242a2d,glass=0x9fb9c4,canopy=0x586870;
  function part(id,anchor,u,y,v,w,h,d,color,solid=true){
    const {x,z,dx,dz}=anchor;
    const cx=x+dx*u-dz*v,cz=z+dz*u+dx*v;
    parts.push({x:cx,y,z:cz,w,h,d,angle:Math.atan2(-dz,dx),color});
    if(!solid)return;
    const footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>[cx+dx*i*w/2-dz*j*d/2,cz+dz*i*w/2+dx*j*d/2]);
    plan.colliders.push({id,kind:'prism',center:[cx,y,cz],size:[Math.abs(dx*w)+Math.abs(dz*d),h,Math.abs(dz*w)+Math.abs(dx*d)],footprint});
  }
  plan.masts.forEach((mast,index)=>{
    const id='signal-'+key+'-'+index;
    part(id,mast,0,3.3,0,.22,6.6,.22,steel);
    part(id+'-arm',mast,0,6.4,-mast.reach/2,.16,.16,mast.reach,steel);
    for(const [i,fraction] of [.55,.95].entries()){
      const v=-mast.reach*fraction;
      part(id+'-head'+i,mast,0,6.05,v,.40,.48,1.5,dark);
      // Recessed lenses reflect daylight in the unpowered signal housing.
      for(const [lens,color] of [0x82352d,0x8c662b,0x35694b].entries())
        part(null,mast,-.193,6.05,v-(lens-1)*.45,.018,.27,.27,color,false);
    }
  });
  plan.entrances.forEach((e,index)=>{
    const id='subway-'+key+'-'+index;
    for(const side of [-1,1]){
      part(id+(side>0?'-right':'-left'),e,0,.65,side*1.45,6.2,1.3,.14,glass);
      part(null,e,0,1.29,side*1.45,6.2,.04,.16,steel,false);
    }
    part(id+'-back',e,-3.1,.65,0,.14,1.3,3.04,glass);
    part(id+'-canopy',e,-.6,2.55,0,5.2,.12,3.3,canopy);
    for(const u of [-3,1.9])for(const v of [-1.50,1.50])
      part(id+'-post'+u+','+v,e,u,1.28,v,.1,2.55,.1,steel);
    // Stiffeners under the canopy and mullions at the panel joints.
    for(const u of [-2.8,-1.6,-.4,.8,1.8]){
      part(null,e,u,2.47,0,.04,.05,3.13,steel,false);
      for(const side of [-1,1])part(null,e,u,.64,side*1.45,.045,1.27,.15,steel,false);
    }
    part(id+'-totem',e,3.6,1.6,1.9,.18,3.2,.9,dark);
  });
  return parts;
}
/**
 * What to draw in one cell. `segments` must reach about 60 m past the cell so
 * that carriageway pairs and signal approaches across its edge are found.
 * Offsets are metres to the driver's right of the way's centre line.
 */
export function planStreetCell(segments,points,bounds,{occupied=()=>false,key='cell'}={}){
  const inside=(x,z)=>x>=bounds.minX&&x<bounds.maxX&&z>=bounds.minZ&&z<bounds.maxZ;
  const plan={...planMedianPavement(segments,inside),masts:[],entrances:[],colliders:[]};
  for(const p of points.signals||[]){
    if(!inside(p[0],p[1]))continue;
    const approaches=[];
    for(const s of segments){
      if(s.width<8||s.length<6)continue;
      // Traffic arriving at the signal: the end of a way, or the start of a two-way one.
      for(const [end,sign]of [[s.b,1],...(s.road.oneway?[]:[[s.a,-1]])]){
        if(Math.hypot(end[0]-p[0],end[1]-p[1])>9)continue;
        const dx=s.dx*sign,dz=s.dz*sign,half=s.width/2;
        const base=[p[0]-dx*4-dz*(half+1.1),p[1]-dz*4+dx*(half+1.1)];
        if(occupied(base[0],base[1])||approaches.some(a=>Math.hypot(a.x-base[0],a.z-base[1])<6||a.dx*dx+a.dz*dz>.9))continue;
        approaches.push({x:base[0],z:base[1],dx,dz,reach:clamp(half*1.15,4.5,11)});
      }
    }
    plan.masts.push(...approaches);
  }
  for(const e of points.entrances||[]){
    const [x,z,ref,station]=e;if(!inside(x,z)||occupied(x,z))continue;
    let nearest=null,distance=40;for(const s of segments){const d=distanceTo(x,z,s);if(d<distance){distance=d;nearest=s;}}
    if(!nearest||distance<nearest.width/2+.6)continue;
    const entrance={x,z,dx:nearest.dx,dz:nearest.dz,ref:String(ref||''),station:station||''};
    plan.entrances.push(entrance);
  }
  plan.furniture=furnitureParts(plan,key);
  return plan;
}

const canDraw=()=>typeof document!=='undefined';
// One small canvas per cell carries the totems: exit number over the station name.
function totemAtlas(entrances){
  if(!canDraw()||!entrances.length)return null;
  const columns=8,w=64,h=128,rows=Math.ceil(entrances.length/columns),canvas=document.createElement('canvas');
  canvas.width=columns*w;canvas.height=rows*h;const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';
  entrances.forEach((e,i)=>{
    const x=(i%columns)*w,y=Math.floor(i/columns)*h;
    ctx.fillStyle='#20282d';ctx.fillRect(x,y,w,h);ctx.fillStyle='#f2b233';ctx.fillRect(x+6,y+6,w-12,46);
    ctx.fillStyle='#1b2226';ctx.font='bold 38px sans-serif';ctx.fillText(e.ref||'M',x+w/2,y+31,w-16);
    ctx.fillStyle='#ffffff';ctx.font='bold 17px sans-serif';
    const name=e.station?e.station+'역':'지하철';
    // Station names read downwards on a narrow totem, as on Seoul's own.
    [...name].slice(0,4).forEach((ch,k)=>ctx.fillText(ch,x+w/2,y+66+k*17));
    e.uv=[x/canvas.width,1-(y+h)/canvas.height,(x+w)/canvas.width,1-y/canvas.height];
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

/** Meshes for one planned cell. Materials are shared; geometry and the totem texture belong to the cell. */
export function buildStreetCell(plan,{road,paint,furniture,boxGeometry}){
  const group=new THREE.Group(),asphalt=[.67,.70,.71],colors={yellow:[.9,.725,.31],blue:[.25,.47,.79]};
  const surface=(strips,patches,y,material,name)=>{
    const position=[],normal=[],uv=[],color=[];
    const vertex=(x,z,c)=>{position.push(x,y,z);normal.push(0,1,0);uv.push(x/4,z/4);color.push(c[0],c[1],c[2]);};
    for(const {s,from,to,color:tone}of strips){
      const c=colors[tone]||asphalt,q=[pointOn(s,0,to),pointOn(s,s.length,to),pointOn(s,s.length,from),pointOn(s,0,from)];
      for(const i of [0,1,2,0,2,3])vertex(q[i][0],q[i][1],c);
    }
    for(const {p,radius}of patches)for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6;vertex(p[0],p[1],asphalt);vertex(p[0]+Math.cos(b)*radius,p[1]+Math.sin(b)*radius,asphalt);vertex(p[0]+Math.cos(a)*radius,p[1]+Math.sin(a)*radius,asphalt);
    }
    if(!position.length)return;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(color,3));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);
  };
  // Just above the carriageway (0.014) so the join does not flicker, below the junction patches (0.018).
  surface(plan.fills,plan.patches,.0165,road,'divided avenue centre pavement');
  surface(plan.lines,[],.0275,paint,'centre and bus-lane lines');
  const boxes=plan.furniture;
  const totems=plan.entrances.map(e=>({e,px:e.x+e.dx*3.6-e.dz*1.9,pz:e.z+e.dz*3.6+e.dx*1.9}));
  if(boxes.length){
    const mesh=new THREE.InstancedMesh(boxGeometry,furniture,boxes.length),dummy=new THREE.Object3D(),tint=new THREE.Color();mesh.name='signals and subway entrances';
    boxes.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(t.w,t.h,t.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.setHex(t.color));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  const texture=totemAtlas(plan.entrances);
  if(texture){
    const position=[],uv=[],index=[];
    totems.forEach(({e,px,pz},i)=>{
      // A face on each side of the totem, readable from either direction along the street.
      for(const face of [1,-1]){
        const o=position.length/3,cx=px+e.dx*.095*face,cz=pz+e.dz*.095*face,rx=e.dz*face*.4,rz=-e.dx*face*.4;
        position.push(cx-rx,1.3,cz-rz,cx+rx,1.3,cz+rz,cx+rx,2.9,cz+rz,cx-rx,2.9,cz-rz);
        uv.push(e.uv[0],e.uv[1],e.uv[2],e.uv[1],e.uv[2],e.uv[3],e.uv[0],e.uv[3]);index.push(o,o+1,o+2,o,o+2,o+3);
      }
    });
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(index);geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture}));mesh.name='subway exit numbers';group.add(mesh);
  }
  group.userData.dispose=()=>{texture?.dispose();group.traverse(o=>{if(o.isInstancedMesh)o.dispose();else if(o.geometry)o.geometry.dispose();if(o.material?.map===texture&&texture)o.material.dispose();});group.clear();};
  return group;
}

/** Keeps the cells around the vehicle built. `city` is the loaded world with its streamed tiles attached. */
export function createStreetOverlay(city,points){
  const root=new THREE.Group();root.name='street detail overlay';city.root.add(root);
  const find=name=>{let found=null;city.root.traverse(o=>{if(!found&&o.isMesh&&o.name===name)found=o.material;});return found;};
  const own=[],shared=(name,fallback)=>{const material=find(name);if(material)return material;const made=new THREE.MeshStandardMaterial(fallback);own.push(made);return made;};
  const materials={boxGeometry:new THREE.BoxGeometry(1,1,1),
    road:shared('OSM road network',{color:0xffffff,vertexColors:true,roughness:.9,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}),
    paint:shared('lane markings and crossings',{color:0xffffff,vertexColors:true,roughness:.9,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-8}),
    furniture:new THREE.MeshStandardMaterial({color:0xffffff,roughness:.55,metalness:.4})};
  own.push(materials.furniture);
  // The centre district's own roads; streamed tiles leave that rectangle to it.
  const coreBounds=city.bounds,roadCache=new WeakMap();
  const indexRoads=roads=>indexRoadSegments(roadSegments(roads),STREET_CELL,60);
  const core=indexRoads(city.source?.roads||city.roads||[]);
  function nearbySources(bounds){
    const sources=[],streaming=city.streaming;
    if(streaming)for(const [key,chunk] of streaming.chunks){
      const tile=streaming.manifest.tiles[key]?.bounds;
      if(tile&&tile.maxX>=bounds.minX-60&&tile.minX<=bounds.maxX+60&&tile.maxZ>=bounds.minZ-60&&tile.minZ<=bounds.maxZ+60)sources.push(chunk.roads);
    }
    return sources;
  }
  const buildingsByCell=new Map();
  for(const building of city.buildings||[]){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const [x,z] of building.points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
    for(let cx=Math.floor(minX/STREET_CELL);cx<=Math.floor(maxX/STREET_CELL);cx++)for(let cz=Math.floor(minZ/STREET_CELL);cz<=Math.floor(maxZ/STREET_CELL);cz++){
      const key=cx+','+cz;
      if(!buildingsByCell.has(key))buildingsByCell.set(key,[]);
      buildingsByCell.get(key).push(building);
    }
  }
  const occupied=(x,z)=>{
    if(!(x>=coreBounds.minX&&x<=coreBounds.maxX&&z>=coreBounds.minZ&&z<=coreBounds.maxZ))return false;
    for(const b of buildingsByCell.get(Math.floor(x/STREET_CELL)+','+Math.floor(z/STREET_CELL))||[]){
      const p=b.points;let hit=false;
      for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])hit=!hit;
      if(hit)return true;
    }
    return false;
  };
  const ready=b=>!city.streaming||[[b.minX,b.minZ],[b.maxX-1,b.minZ],[b.minX,b.maxZ-1],[b.maxX-1,b.maxZ-1]].every(([x,z])=>(x>=coreBounds.minX&&x<=coreBounds.maxX&&z>=coreBounds.minZ&&z<=coreBounds.maxZ)||city.streaming.hasAt(x,z)||!city.streaming.contains(x,z));
  const cells=new Map(),checkSources=new Set();
  let physics=null,tick=0,disposed=false,lastStream,lastRevision,settledX,settledZ;
  const boundsOf=(cx,cz)=>({minX:cx*STREET_CELL,maxX:(cx+1)*STREET_CELL,minZ:cz*STREET_CELL,maxZ:(cz+1)*STREET_CELL});
  const drop=cell=>{if(cell.colliders.length)physics?.removeObstacleChunk('street:'+cell.key);root.remove(cell.group);cell.group.userData.dispose();cells.delete(cell.key);checkSources.delete(cell.key);};
  const build=(cx,cz,bounds=boundsOf(cx,cz),sources=nearbySources(bounds))=>{
    const key=cx+','+cz,segments=[...(core.get(key)||[])];
    for(const roads of sources){
      if(!roadCache.has(roads))roadCache.set(roads,indexRoads(roads));
      segments.push(...(roadCache.get(roads).get(key)||[]));
    }
    const plan=planStreetCell(segments,points,bounds,{occupied,key}),group=buildStreetCell(plan,materials);
    const previous=cells.get(key);if(previous)drop(previous);
    const cell={key,cx,cz,bounds,group,colliders:plan.colliders,sources,counts:{fills:plan.fills.length,masts:plan.masts.length,entrances:plan.entrances.length}};
    // Solids are registered before the meshes appear, as the map tiles do.
    if(physics&&cell.colliders.length)physics.setObstacleChunk('street:'+key,cell.colliders);
    root.add(group);cells.set(key,cell);return cell;
  };
  return {root,cells,
    /** Build at most one cell per call; cells behind the vehicle are released. */
    update(x,z){
      if(disposed)return;
      const streaming=city.streaming,revision=streaming?.revision;
      tick++;
      if(streaming!==lastStream||revision!==lastRevision||(streaming&&revision===undefined&&tick%20===0)){
        lastStream=streaming;lastRevision=revision;settledX=undefined;
        for(const key of cells.keys())checkSources.add(key);
      }
      if(settledX!==x||settledZ!==z){
        settledX=undefined;
        const cx=Math.floor(x/STREET_CELL),cz=Math.floor(z/STREET_CELL),ring=Math.ceil(STREET_NEAR/STREET_CELL);
        let best=null,bestDistance=Infinity;
        for(let dx=-ring;dx<=ring;dx++)for(let dz=-ring;dz<=ring;dz++){
          const nx=cx+dx,nz=cz+dz,distance=((nx+.5)*STREET_CELL-x)**2+((nz+.5)*STREET_CELL-z)**2;
          if(distance>STREET_NEAR**2||distance>=bestDistance||cells.has(nx+','+nz))continue;
          if(ready(boundsOf(nx,nz))){best={cx:nx,cz:nz};bestDistance=distance;}
        }
        // Release at most one distant cell per update, even after a teleport.
        let released=false;
        for(const cell of cells.values()){
          if(((cell.cx+.5)*STREET_CELL-x)**2+((cell.cz+.5)*STREET_CELL-z)**2>STREET_DROP**2){
            drop(cell);released=true;break;
          }
        }
        if(best){build(best.cx,best.cz);return;}
        if(released)return;
        settledX=x;settledZ=z;
      }
      // Check just one older cell per frame after a map change. Road arrays
      // are immutable for the lifetime of the tile that supplied them.
      for(const key of checkSources){
        checkSources.delete(key);
        const cell=cells.get(key),sources=nearbySources(cell.bounds);
        if(sources.length!==cell.sources.length||sources.some((roads,i)=>roads!==cell.sources[i]))build(cell.cx,cell.cz,cell.bounds,sources);
        break;
      }
    },
    /** Follow the streamed map: (re)register the solids of every built cell, or let go of the simulation. */
    bindPhysics(sim){physics=sim||null;if(physics)for(const cell of cells.values())if(cell.colliders.length)physics.setObstacleChunk('street:'+cell.key,cell.colliders);},
    dispose(){if(disposed)return;disposed=true;for(const cell of [...cells.values()])drop(cell);city.root.remove(root);materials.boxGeometry.dispose();for(const m of own)m.dispose();}};
}
export async function loadStreetOverlay(city,url=new URL('../assets/city/street-points.json',import.meta.url)){
  const response=await fetch(url);if(!response.ok)throw new Error('도로 세부 위치 HTTP '+response.status);
  return createStreetOverlay(city,await response.json());
}
