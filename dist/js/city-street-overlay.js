import * as THREE from 'three';

// Street detail laid over the mapped roads, built in 256 m cells around the
// vehicle: the pavement between the two carriageways of a divided avenue with
// its centre line, the blue line of Gangnam-daero's median bus lane, signal
// masts at mapped signal positions and subway entrances with their exit
// numbers. Positions come from OpenStreetMap; shapes are generic.
export const STREET_CELL=256,STREET_NEAR=560,STREET_DROP=840;
const AVENUES=new Set(['motorway','trunk','primary','secondary']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const widthOf=road=>road.width>2&&road.width<55?road.width:road.lanes>0&&road.lanes<15?road.lanes*3.15+.8:({trunk:15,primary:13,secondary:11,tertiary:9,residential:6.2,unclassified:6.2,living_street:5,service:4.5})[road.type]||6;

/** Straight pieces of the given roads, pointing the way traffic flows on a one-way street. */
export function roadSegments(roads){
  const segments=[];
  for(const road of roads){
    const points=road.onewayDirection===-1?road.points.slice().reverse():road.points,width=widthOf(road);
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.2)continue;
      segments.push({road,width,a,b,dx:dx/length,dz:dz/length,length});
    }
  }
  return segments;
}
const pointOn=(s,t,offset=0)=>[s.a[0]+s.dx*t-s.dz*offset,s.a[1]+s.dz*t+s.dx*offset];
const distanceTo=(x,z,s)=>{const t=clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.length);return Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t);};
// The opposite carriageway of a divided avenue, found on the driver's left.
function sibling(s,segments){
  const mx=(s.a[0]+s.b[0])/2,mz=(s.a[1]+s.b[1])/2;let best=null;
  for(const c of segments){
    if(c.road===s.road||c.road.id===s.road.id||!c.road.oneway||c.road.name!==s.road.name||c.dx*s.dx+c.dz*s.dz>-.6)continue;
    const t=clamp((mx-c.a[0])*c.dx+(mz-c.a[1])*c.dz,0,c.length),qx=c.a[0]+c.dx*t-mx,qz=c.a[1]+c.dz*t-mz;
    const lateral=qx*s.dz-qz*s.dx,along=qx*s.dx+qz*s.dz;
    if(lateral>3&&lateral<46&&Math.abs(along)<14&&(!best||lateral<best.distance))best={segment:c,distance:lateral};
  }
  return best;
}

/**
 * What to draw in one cell. `segments` must reach about 60 m past the cell so
 * that carriageway pairs and signal approaches across its edge are found.
 * Offsets are metres to the driver's right of the way's centre line.
 */
export function planStreetCell(segments,points,bounds,{occupied=()=>false,key='cell'}={}){
  const inside=(x,z)=>x>=bounds.minX&&x<bounds.maxX&&z>=bounds.minZ&&z<bounds.maxZ;
  const plan={fills:[],patches:[],lines:[],masts:[],entrances:[],colliders:[]};
  for(const s of segments){
    if(!s.road.oneway||!s.road.name||!AVENUES.has(s.road.type)||!inside((s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2))continue;
    const other=sibling(s,segments);if(!other)continue;
    const half=s.width/2,centre=other.distance/2;
    // A real, wide median (more than 7.5 m of it on this side) is left unpaved.
    if(centre-half>7.5)continue;
    if(centre>half+.05){
      plan.fills.push({s,from:-centre-.03,to:-half+.05});
      for(const t of [0,s.length])plan.patches.push({p:pointOn(s,t,-centre),radius:centre});
    }
    // One of the two ways draws the double centre line.
    if(String(s.road.id)<String(other.segment.road.id))for(const side of [-1,1])plan.lines.push({s,from:-centre+side*.14-.06,to:-centre+side*.14+.06,color:'yellow'});
    if(s.road.name.includes('강남대로'))plan.lines.push({s,from:-centre+3.21,to:-centre+3.39,color:'blue'});
  }
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
    for(const mast of approaches){plan.colliders.push({id:'signal-'+key+'-'+plan.masts.length,center:[mast.x,3.3,mast.z],size:[.3,6.6,.3]});plan.masts.push(mast);}
  }
  for(const e of points.entrances||[]){
    const [x,z,ref,station]=e;if(!inside(x,z)||occupied(x,z))continue;
    let nearest=null,distance=40;for(const s of segments){const d=distanceTo(x,z,s);if(d<distance){distance=d;nearest=s;}}
    if(!nearest||distance<nearest.width/2+.6)continue;
    const entrance={x,z,dx:nearest.dx,dz:nearest.dz,ref:String(ref||''),station:station||''},nx=-entrance.dz,nz=entrance.dx,index=plan.entrances.length;
    // Two side walls and the back wall of the stairwell; the street end stays open.
    const wall=(tag,cx,cz,along,across)=>{
      const corners=[[-along,-across],[along,-across],[along,across],[-along,across]].map(([u,v])=>[cx+entrance.dx*u+nx*v,cz+entrance.dz*u+nz*v]);
      const xs=corners.map(c=>c[0]),zs=corners.map(c=>c[1]);
      plan.colliders.push({id:'subway-'+key+'-'+index+tag,kind:'prism',footprint:corners,center:[cx,.65,cz],size:[Math.max(...xs)-Math.min(...xs),1.3,Math.max(...zs)-Math.min(...zs)]});
    };
    for(const side of [-1,1])wall(side>0?'r':'l',x+nx*side*1.45,z+nz*side*1.45,3.1,.11);
    wall('b',x-entrance.dx*3.1,z-entrance.dz*3.1,.11,1.55);
    plan.entrances.push(entrance);
  }
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
  const boxes=[],steel=new THREE.Color(0x74818a),dark=new THREE.Color(0x232a2e),glass=new THREE.Color(0x9fb9c4),canopy=new THREE.Color(0x586870),lights=[new THREE.Color(0xff5140),new THREE.Color(0xffc23a),new THREE.Color(0x45e08a)];
  const box=(x,y,z,w,h,d,angle,color)=>boxes.push({x,y,z,w,h,d,angle,color});
  for(const g of plan.masts){
    const angle=Math.atan2(-g.dz,g.dx),lx=g.dz,lz=-g.dx; // the arm reaches left, over the lanes
    box(g.x,3.3,g.z,.22,6.6,.22,0,steel);box(g.x+lx*g.reach/2,6.4,g.z+lz*g.reach/2,.16,.16,g.reach,angle,steel);
    for(const along of [.55,.95]){
      const hx=g.x+lx*g.reach*along,hz=g.z+lz*g.reach*along;box(hx,6.05,hz,.34,.46,1.5,angle,dark);
      // Three lenses side by side along the arm, facing the approaching traffic.
      lights.forEach((c,k)=>box(hx-g.dx*.19+lx*(k-1)*.45,6.05,hz-g.dz*.19+lz*(k-1)*.45,.06,.3,.3,angle,c));
    }
  }
  const totems=[];
  for(const e of plan.entrances){
    const angle=Math.atan2(-e.dz,e.dx),nx=-e.dz,nz=e.dx;
    for(const side of [-1,1])box(e.x+nx*side*1.45,.65,e.z+nz*side*1.45,6.2,1.3,.14,angle,glass);
    box(e.x-e.dx*3.1,.65,e.z-e.dz*3.1,.14,1.3,3.04,angle,glass);
    box(e.x-e.dx*.6,2.55,e.z-e.dz*.6,5.2,.12,3.3,angle,canopy);
    for(const [fx,fz]of [[1.9,1.5],[1.9,-1.5],[-3,1.5],[-3,-1.5]])box(e.x+e.dx*fx+nx*fz,1.28,e.z+e.dz*fx+nz*fz,.1,2.55,.1,angle,steel);
    const px=e.x+e.dx*3.6+nx*1.9,pz=e.z+e.dz*3.6+nz*1.9;box(px,1.6,pz,.18,3.2,.9,angle,dark);
    totems.push({e,px,pz});
  }
  if(boxes.length){
    const mesh=new THREE.InstancedMesh(boxGeometry,furniture,boxes.length),dummy=new THREE.Object3D();mesh.name='signals and subway entrances';
    boxes.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(t.w,t.h,t.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,t.color);});
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
  const core=roadSegments(city.source?.roads||city.roads||[]),coreBounds=city.bounds,cache=new WeakMap();
  const near=(s,b,pad)=>Math.max(s.a[0],s.b[0])>=b.minX-pad&&Math.min(s.a[0],s.b[0])<=b.maxX+pad&&Math.max(s.a[1],s.b[1])>=b.minZ-pad&&Math.min(s.a[1],s.b[1])<=b.maxZ+pad;
  // Roads of the centre district plus those of the streamed tiles that touch the cell.
  const gather=bounds=>{
    const segments=core.filter(s=>near(s,bounds,60)),sources=[];
    const streaming=city.streaming;
    if(streaming)for(const [key,chunk]of streaming.chunks){
      const tile=streaming.manifest.tiles[key]?.bounds;if(!tile||tile.maxX<bounds.minX-60||tile.minX>bounds.maxX+60||tile.maxZ<bounds.minZ-60||tile.minZ>bounds.maxZ+60)continue;
      if(!cache.has(chunk.roads))cache.set(chunk.roads,roadSegments(chunk.roads));
      for(const s of cache.get(chunk.roads)){if(near(s,bounds,60))segments.push(s);}
      sources.push(key);
    }
    return {segments,signature:sources.sort().join('|')};
  };
  const occupied=(x,z)=>{
    if(!(x>=coreBounds.minX&&x<=coreBounds.maxX&&z>=coreBounds.minZ&&z<=coreBounds.maxZ))return false;
    for(const b of city.buildings||[]){
      const p=b.points;let hit=false;
      for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])hit=!hit;
      if(hit)return true;
    }
    return false;
  };
  const ready=b=>!city.streaming||[[b.minX,b.minZ],[b.maxX-1,b.minZ],[b.minX,b.maxZ-1],[b.maxX-1,b.maxZ-1]].every(([x,z])=>(x>=coreBounds.minX&&x<=coreBounds.maxX&&z>=coreBounds.minZ&&z<=coreBounds.maxZ)||city.streaming.hasAt(x,z)||!city.streaming.contains(x,z));
  const cells=new Map();let physics=null,tick=0,disposed=false;
  const boundsOf=(cx,cz)=>({minX:cx*STREET_CELL,maxX:(cx+1)*STREET_CELL,minZ:cz*STREET_CELL,maxZ:(cz+1)*STREET_CELL});
  const drop=cell=>{physics?.removeObstacleChunk('street:'+cell.key);root.remove(cell.group);cell.group.userData.dispose();cells.delete(cell.key);};
  const build=(cx,cz)=>{
    const key=cx+','+cz,bounds=boundsOf(cx,cz),{segments,signature}=gather(bounds);
    const plan=planStreetCell(segments,points,bounds,{occupied,key}),group=buildStreetCell(plan,materials);
    const previous=cells.get(key);if(previous)drop(previous);
    const cell={key,cx,cz,bounds,group,colliders:plan.colliders,signature,counts:{fills:plan.fills.length,masts:plan.masts.length,entrances:plan.entrances.length}};
    // Solids are registered before the meshes appear, as the map tiles do.
    if(physics&&cell.colliders.length)physics.setObstacleChunk('street:'+key,cell.colliders);
    root.add(group);cells.set(key,cell);return cell;
  };
  return {root,cells,
    /** Build at most one cell per call; cells behind the vehicle are released. */
    update(x,z){
      if(disposed)return;
      const cx=Math.floor(x/STREET_CELL),cz=Math.floor(z/STREET_CELL),ring=Math.ceil(STREET_NEAR/STREET_CELL);let best=null;
      for(let dx=-ring;dx<=ring;dx++)for(let dz=-ring;dz<=ring;dz++){
        const key=(cx+dx)+','+(cz+dz),d=Math.hypot((cx+dx+.5)*STREET_CELL-x,(cz+dz+.5)*STREET_CELL-z);
        if(d>STREET_NEAR||cells.has(key)||(best&&d>=best.d))continue;
        if(ready(boundsOf(cx+dx,cz+dz)))best={cx:cx+dx,cz:cz+dz,d};
      }
      if(best){build(best.cx,best.cz);return;}
      // Nothing new to build: release far cells and refresh one whose tiles changed.
      if(++tick%20)return;
      for(const cell of [...cells.values()]){
        if(Math.hypot((cell.cx+.5)*STREET_CELL-x,(cell.cz+.5)*STREET_CELL-z)>STREET_DROP){drop(cell);continue;}
        if(gather(cell.bounds).signature!==cell.signature){build(cell.cx,cell.cz);return;}
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
