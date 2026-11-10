// Pure CPU city construction. Native module workers cannot use the page import map.
import {ShapeUtils,Vector2,Color} from '../vendor/three.module.js';
import {buildingColliders} from './city-footprint.js';
import {treeColliders} from './city-tree-collision.js?v=20261111-trees2';
import {speciesForRoad} from './city-tree-mix.js?v=20261111-trees2';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const hash=id=>{let seed=Number(id);if(!Number.isFinite(seed)){seed=2166136261;for(const c of String(id))seed=Math.imul(seed^c.charCodeAt(0),16777619);}return ((Math.imul(seed|0,1664525)+1013904223)>>>0)/4294967296;};
const palette=[0x9aa6ac,0xaeb9bd,0x81939d,0xc3beb3,0x8598a5,0xb8c0c3];
const names={ground:'surveyed city ground',walk:'real road sidewalks',road:'OSM road network',paint:'lane markings and crossings',wall:'OSM building facades',glass:'office curtain walls',roof:'OSM building roofs',green:'mapped green space',water:'mapped water',furniture:'street furniture'};
export const CITY_TILE_VERTEX_LIMIT=12000;
export function tileRoadWidth(r){
  if(r.width>2&&r.width<55)return Number(r.width);
  if(r.lanes>0&&r.lanes<15)return r.lanes*3.15+.8;
  return ({trunk:15,primary:13,secondary:11,tertiary:9,residential:6.2,unclassified:6.2,living_street:5,service:4.5})[r.type]||6;
}
const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0))*.5;
const inside=(p,b)=>p[0]>=b.minX&&p[0]<b.maxX&&p[1]>=b.minZ&&p[1]<b.maxZ;
function pointInPolygon(x,z,p){
  let found=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])found=!found;}return found;
}
function cleanRing(points){
  if(!Array.isArray(points))return [];
  const p=points.filter(a=>Array.isArray(a)&&a.length>=2&&Number.isFinite(a[0])&&Number.isFinite(a[1])).map(a=>[a[0],a[1]]);
  if(p.length>1&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.001)p.pop();
  return p;
}
function clipPolygon(points,bounds){
  let result=points;
  for(const [axis,value,sign]of [[0,bounds.minX,1],[0,bounds.maxX,-1],[1,bounds.minZ,1],[1,bounds.maxZ,-1]]){
    const input=result;result=[];if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-value)*sign>=-1e-8,ib=(b[axis]-value)*sign>=-1e-8;
      if(ia)result.push(a);
      if(ia!==ib){const t=(value-a[axis])/(b[axis]-a[axis]);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }
  }return result;
}
function regionsOutside(bounds,exclude){
  if(!exclude||exclude.maxX<=bounds.minX||exclude.minX>=bounds.maxX||exclude.maxZ<=bounds.minZ||exclude.minZ>=bounds.maxZ)return [bounds];
  const x0=clamp(exclude.minX,bounds.minX,bounds.maxX),x1=clamp(exclude.maxX,bounds.minX,bounds.maxX),z0=clamp(exclude.minZ,bounds.minZ,bounds.maxZ),z1=clamp(exclude.maxZ,bounds.minZ,bounds.maxZ);
  return [{...bounds,maxX:x0},{...bounds,minX:x1},{minX:x0,maxX:x1,minZ:bounds.minZ,maxZ:z0},{minX:x0,maxX:x1,minZ:z1,maxZ:bounds.maxZ}].filter(b=>b.maxX-b.minX>1e-6&&b.maxZ-b.minZ>1e-6);
}
function segmentRange(a,b,box,padding=0){
  let lo=0,hi=1;const dx=b[0]-a[0],dz=b[1]-a[1];
  for(const [p,q]of [[-dx,a[0]-box.minX+padding],[dx,box.maxX-a[0]+padding],[-dz,a[1]-box.minZ+padding],[dz,box.maxZ-a[1]+padding]]){
    if(Math.abs(p)<1e-12){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }return [lo,hi];
}

/** All positions are local to origin; colliders and roads remain world coordinates.
 * Data owns complete buildings; clipped road polygons and world UVs meet exactly.
 * Heights without source height/levels remain estimates, as in the central map.
 */
export function buildCityTile(data,options={}){
  const bounds=options.bounds||data.bounds;
  if(!bounds||!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(bounds[k]))||bounds.maxX<=bounds.minX||bounds.maxZ<=bounds.minZ)throw new TypeError('Finite positive tile bounds required.');
  const origin=options.origin||[(bounds.minX+bounds.maxX)/2,(bounds.minZ+bounds.maxZ)/2],core=options.coreBounds||options.excludeBounds;
  const regions=regionsOutside(bounds,core),excluded=new Set([...(options.excludeBuildingIds||[])].map(String));
  const colorCache=new Map(),batches=new Map(),meshes=[];
  const color=value=>{if(!colorCache.has(value))colorCache.set(value,new Color(value));return colorCache.get(value);};
  function accumulator(kind){
    let out=batches.get(kind);
    if(!out||out.position.length/3+3>CITY_TILE_VERTEX_LIMIT){out={kind,name:names[kind],position:[],normal:[],uv:[],color:[],bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};batches.set(kind,out);meshes.push(out);}return out;
  }
  function triangle(kind,verts,normal,tint,uv){
    const out=accumulator(kind),c=typeof tint==='number'?color(tint):tint;
    for(let i=0;i<3;i++){
      const p=[verts[i][0]-origin[0],verts[i][1],verts[i][2]-origin[1]];out.position.push(...p);out.normal.push(...normal);out.uv.push(...uv[i]);out.color.push(c.r,c.g,c.b);
      for(let axis=0;axis<3;axis++){out.bounds.min[axis]=Math.min(out.bounds.min[axis],p[axis]);out.bounds.max[axis]=Math.max(out.bounds.max[axis],p[axis]);}
    }
  }
  function quad(kind,verts,normal,tint,uv=[[0,0],[0,1],[1,1],[1,0]]){
    triangle(kind,[verts[0],verts[1],verts[2]],normal,tint,[uv[0],uv[1],uv[2]]);triangle(kind,[verts[0],verts[2],verts[3]],normal,tint,[uv[0],uv[2],uv[3]]);
  }
  function surface(kind,polygon,y,tint){
    for(const region of regions){
      const p=clipPolygon(polygon,region);if(p.length<3)continue;
      for(let i=1;i<p.length-1;i++){
        const tri=[p[0],p[i],p[i+1]],signed=(tri[1][0]-tri[0][0])*(tri[2][1]-tri[0][1])-(tri[1][1]-tri[0][1])*(tri[2][0]-tri[0][0]);
        if(Math.abs(signed)<1e-8)continue;if(signed>0)[tri[1],tri[2]]=[tri[2],tri[1]];
        triangle(kind,tri.map(a=>[a[0],y,a[1]]),[0,1,0],tint,tri.map(a=>[a[0]/4,a[1]/4]));
      }
    }
  }
  function pavement(kind,a,b,width,y,tint){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-7)return;
    const nx=-(b[1]-a[1])/length*width/2,nz=(b[0]-a[0])/length*width/2;
    surface(kind,[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz]],y,tint);
  }
  function disk(kind,p,r,y,tint){
    for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;surface(kind,[p,[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r],[p[0]+Math.cos(b)*r,p[1]+Math.sin(b)*r]],y,tint);}
  }
  function mappedSurface(feature,kind,y,tint){
    const ring=cleanRing(feature.points),holes=(feature.holes||[]).map(cleanRing).filter(r=>r.length>2);if(ring.length<3)return;
    const points=[...ring,...holes.flat()],faces=ShapeUtils.triangulateShape(ring.map(p=>new Vector2(...p)),holes.map(r=>r.map(p=>new Vector2(...p))));
    for(const f of faces)surface(kind,f.map(i=>points[i]),y,tint);
  }
  surface('ground',[[bounds.minX,bounds.minZ],[bounds.maxX,bounds.minZ],[bounds.maxX,bounds.maxZ],[bounds.minX,bounds.maxZ]],-.052,0x92968a);
  for(const feature of data.landuse||[])mappedSurface(feature,'green',-.035,/forest|wood|grass|park|recreation|meadow|garden/.test(feature.type||'')?0x75845c:0x9b9d8e);
  for(const feature of data.water||[])mappedSurface(feature,'water',-.018,0x668c91);

  const roads=[],segments=[],junctions=new Map();
  for(const source of data.roads||[]){
    if(source.tunnel===true||source.tunnel==='yes'||Number(source.layer)<0)continue;
    const road={...source,width:tileRoadWidth(source)},points=cleanRingOpen(source.points);let distance=0,used=false;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.05)continue;
      const range=segmentRange(a,b,bounds,road.width/2+3);
      if(range){segments.push({road,a,b,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length,length,range,distance,index:i});used=true;}
      for(const p of [a,b]){const key=p.map(n=>n.toFixed(2)).join(',');const j=junctions.get(key)||{point:p,width:0,count:0};j.width=Math.max(j.width,road.width);j.count++;junctions.set(key,j);}
      distance+=length;
    }if(used)roads.push(road);
  }
  const buildings=[];
  function normalizedBuilding(source){
    const points=cleanRing(source.points),footprint=area(points);if(points.length<3||footprint<1)return null;
    const center=points.reduce((c,p)=>[c[0]+p[0]/points.length,c[1]+p[1]/points.length],[0,0]);
    const inferred=footprint>900?30+hash(source.id)*45:footprint>250?15+hash(source.id)*25:7+hash(source.id)*12;
    return {...source,points,holes:(source.holes||[]).map(cleanRing).filter(r=>r.length>=3),center,footprint,height:clamp(Number(source.height)||Number(source.levels)*3.3||inferred,3,280)};
  }
  for(const source of data.buildings||[]){
    if(excluded.has(String(source.id)))continue;const b=normalizedBuilding(source);if(!b)continue;
    if(!data.buildingsOwned&&!inside(b.center,bounds))continue;buildings.push(b);
  }
  const context=[...buildings,...(data.contextBuildings||[]).map(normalizedBuilding).filter(Boolean)];
  const occupied=(x,z)=>!inside([x,z],bounds)||(core&&inside([x,z],core))||context.some(b=>pointInPolygon(x,z,b.points)&&!b.holes.some(h=>pointInPolygon(x,z,h)));
  const onRoad=(x,z)=>segments.some(s=>{const t=clamp((x-s.a[0])*s.dx+(z-s.a[1])*s.dz,0,s.length);return Math.hypot(x-s.a[0]-s.dx*t,z-s.a[1]-s.dz*t)<s.road.width/2+.5;});
  const trees=[],treeKeys=new Set();
  for(const s of segments){
    const width=s.road.width,point=(t,offset=0)=>[s.a[0]+s.dx*t-s.dz*offset,s.a[1]+s.dz*t+s.dx*offset];
    pavement('walk',s.a,s.b,width+4.6,.005,0xb6b4aa);pavement('road',s.a,s.b,width,.014,0xabb3b5);
    const j0=junctions.get(s.a.map(n=>n.toFixed(2)).join(',')),j1=junctions.get(s.b.map(n=>n.toFixed(2)).join(','));
    const start=j0?.count>2?Math.max(j0.width/2+3,8):1,end=s.length-(j1?.count>2?Math.max(j1.width/2+3,8):1);
    if(end>start&&width>=6){
      if(!s.road.oneway)pavement('paint',point(start),point(end),.16,.027,0xe5b950);
      const lanes=Math.max(1,s.road.lanes||Math.round(width/3.2)),lo=Math.max(start,s.range[0]*s.length-5),hi=Math.min(end,s.range[1]*s.length+5);
      for(let lane=1;lane<lanes;lane++){
        const offset=-width/2+width*lane/lanes;if(!s.road.oneway&&Math.abs(offset)<.3)continue;
        const first=Math.floor((s.distance+lo)/10)*10-s.distance;
        for(let t=first;t<hi;t+=10)if(t+4>start)pavement('paint',point(Math.max(t,start),offset),point(Math.min(t+4,end),offset),.13,.026,0xd9ddda);
      }
      for(const side of [-1,1])pavement('paint',point(start,side*(width/2-.3)),point(end,side*(width/2-.3)),.12,.026,0xd9ddda);
      if(width>=8&&s.length>28)for(const [j,t]of [[j0,start],[j1,end]])if(j?.count>2)for(let o=-width/2+1;o<width/2-1;o+=1.4)pavement('paint',point(t-1.8,o),point(t+1.8,o),.65,.029,0xd9ddda);
    }
    if(width>=8&&trees.length<192){
      const lo=Math.max(0,s.range[0]*s.length-3),hi=Math.min(s.length,s.range[1]*s.length+3);
      for(let t=Math.ceil((s.distance+lo-27)/48)*48+27-s.distance;t<hi;t+=48)for(const side of [-1,1]){
        if(t<10||t>s.length-10)continue;const p=point(t,side*(width/2+1.6)),key=p.map(n=>Math.round(n*2)).join(',');
        if(occupied(...p)||onRoad(...p)||treeKeys.has(key)||trees.length>=192)continue;
        const v=hash(String(s.road.id)+':'+Math.round(s.distance+t)+':'+side);
        trees.push({x:p[0]-origin[0],z:p[1]-origin[1],height:5.8+v*1.4,rotation:v*Math.PI*2,species:speciesForRoad(s.road),seed:v});treeKeys.add(key);
      }
    }
  }
  for(const j of junctions.values()){
    if(j.point[0]<bounds.minX-j.width||j.point[0]>bounds.maxX+j.width||j.point[1]<bounds.minZ-j.width||j.point[1]>bounds.maxZ+j.width)continue;
    disk('walk',j.point,j.width/2+2.3,.004,0xb6b4aa);disk('road',j.point,j.width/2,.018,0xabb3b5);
  }
  const obstacles=trees.flatMap((tree,i)=>treeColliders(tree,{origin,id:`tree-${options.id||data.key||origin.join(',')}-${i}`}));
  for(const b of buildings){
    const tint=color(palette[Math.floor(hash(b.id)*palette.length)]),roofColor=tint.clone().multiplyScalar(.63),all=[...b.points,...b.holes.flat()];
    const faces=ShapeUtils.triangulateShape(b.points.map(a=>new Vector2(...a)),b.holes.map(h=>h.map(a=>new Vector2(...a))));
    for(const f of faces){const tri=f.map(i=>[all[i][0],b.height,all[i][1]]);triangle('roof',[tri[0],tri[2],tri[1]],[0,1,0],roofColor,[[0,0],[1,1],[1,0]]);}
    for(const [ringIndex,p]of [b.points,...b.holes].entries()){
    const signed=p.reduce((sum,a,i)=>{const c=p[(i+1)%p.length];return sum+a[0]*c[1]-c[0]*a[1];},0),orientation=(signed>0?1:-1)*(ringIndex===0?1:-1);let distance=0;
    for(let i=0;i<p.length;i++){
      const a=p[i],c=p[(i+1)%p.length],length=Math.hypot(c[0]-a[0],c[1]-a[1]);if(length<.03)continue;
      const n=[(c[1]-a[1])/length*orientation,0,-(c[0]-a[0])/length*orientation],v=[[a[0],0,a[1]],[a[0],b.height,a[1]],[c[0],b.height,c[1]],[c[0],0,c[1]]],uv=[[distance/3.2,0],[distance/3.2,b.height/3.4],[(distance+length)/3.2,b.height/3.4],[(distance+length)/3.2,0]];
      const kind=b.height>42&&b.footprint>220?'glass':'wall';if(orientation>0)quad(kind,v,n,tint,uv);else quad(kind,[...v].reverse(),n,tint,[...uv].reverse());distance+=length;
    }
    }
    obstacles.push(...buildingColliders(b));
  }
  // Navigation metadata must describe this tile only, even though road mesh
  // generation needs whole ways to preserve lane marking phase across tiles.
  const roadParts=[],visibleSegments=[];
  for(const s of segments)for(const region of regions){
    const range=segmentRange(s.a,s.b,region);if(!range)continue;
    const at=t=>[s.a[0]+s.dx*s.length*t,s.a[1]+s.dz*s.length*t],a=at(range[0]),b=at(range[1]),length=s.length*(range[1]-range[0]);if(length<.05)continue;
    const road={...s.road,points:[a,b]};roadParts.push(road);visibleSegments.push({road,a,b,dx:s.dx,dz:s.dz,length});
  }
  for(const out of meshes)for(const key of ['position','normal','uv','color'])out[key]=new Float32Array(out[key]);
  return {id:options.id||data.key,bounds,origin,meshes,obstacles,roads:roadParts,segments:visibleSegments,trees,
    stats:{buildings:buildings.length,roads:roads.length,triangles:meshes.reduce((n,m)=>n+m.position.length/9,0),trees:trees.length,source:'OpenStreetMap'}};
}
function cleanRingOpen(points){return (points||[]).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));}
export function cityTileTransferables(payload){
  return [...new Set(payload.meshes.flatMap(m=>['position','normal','uv','color'].map(key=>m[key].buffer)))];
}

