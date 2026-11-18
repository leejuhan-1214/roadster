// Core OSM road surfaces share materials and world coordinates. Use one draw per
// material while submitting the nearby cells, including long triangles whose
// centroid is distant but whose full extent reaches the camera neighbourhood.
import {BufferAttribute,DynamicDrawUsage} from 'three';

const cellSize=80;
const layerRanges=new Map([
  ['lane markings and crossings',270],
  ['real road sidewalks',440],
  ['OSM road network',640]
]);

function near(box,x,z,range){
  const dx=Math.max(0,box.minX-x,x-box.maxX),dz=Math.max(0,box.minZ-z,z-box.maxZ);
  return dx*dx+dz*dz<=range*range;
}

function prepare(geometry,range){
  const p=geometry.attributes.position,cells=new Map();
  if(geometry.index||!p||p.count<1500)return null;
  const Index=p.count<=65535?Uint16Array:Uint32Array;
  for(let i=0;i<p.count;i+=3){
    const ax=p.getX(i),bx=p.getX(i+1),cx=p.getX(i+2);
    const az=p.getZ(i),bz=p.getZ(i+1),cz=p.getZ(i+2);
    const key=Math.floor((ax+bx+cx)/(3*cellSize))+','+Math.floor((az+bz+cz)/(3*cellSize));
    let cell=cells.get(key);
    if(!cell){cell={ids:[],minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};cells.set(key,cell);}
    cell.minX=Math.min(cell.minX,ax,bx,cx);cell.maxX=Math.max(cell.maxX,ax,bx,cx);
    cell.minZ=Math.min(cell.minZ,az,bz,cz);cell.maxZ=Math.max(cell.maxZ,az,bz,cz);
    cell.ids.push(i,i+1,i+2);
  }
  for(const cell of cells.values())cell.ids=Index.from(cell.ids);
  const indices=new BufferAttribute(new Index(p.count),1).setUsage(DynamicDrawUsage);
  geometry.setIndex(indices);
  return (x,z,extra)=>{
    let count=0;
    for(const c of cells.values())if(near(c,x,z,range+extra)){indices.array.set(c.ids,count);count+=c.ids.length;}
    indices.clearUpdateRanges();
    if(count){indices.addUpdateRange(0,count);indices.needsUpdate=true;}
    geometry.setDrawRange(0,count);
  };
}

// These static instance matrices stay in the core map's coordinate system.
// Keep a complete copy so going back to a district restores its fixtures.
function prepareFixtures(mesh,range){
  if(!mesh?.isInstancedMesh||!mesh.count)return null;
  const matrices=mesh.instanceMatrix,colors=mesh.instanceColor;
  const source=matrices.array.slice(),tints=colors?.array.slice();
  const total=mesh.count;
  mesh.computeBoundingSphere();
  matrices.setUsage(DynamicDrawUsage);
  colors?.setUsage(DynamicDrawUsage);
  return (x,z,extra)=>{
    let count=0;
    const reach=(range+extra)**2;
    for(let i=0;i<total;i++){
      const pos=i*16;
      if((source[pos+12]-x)**2+(source[pos+14]-z)**2>reach)continue;
      matrices.array.set(source.subarray(pos,pos+16),count*16);
      if(tints)colors.array.set(tints.subarray(i*3,i*3+3),count*3);
      count++;
    }
    mesh.count=count;
    for(const a of [matrices,colors]){
      if(!a)continue;
      a.clearUpdateRanges();
      if(count){a.addUpdateRange(0,count*a.itemSize);a.needsUpdate=true;}
    }
  };
}

export function createRoadDrawRanges(city){
  const surfaces=[];
  for(const [name,range] of layerRanges){
    const mesh=city.root.getObjectByName(name);
    if(mesh){const update=prepare(mesh.geometry,range);if(update)surfaces.push(update);}
  }
  for(const [name,range] of [['streetlight poles',340],['streetlight arms',340],['streetlight lamps',340],['rooftop equipment',260]]){
    const update=prepareFixtures(city.root.getObjectByName(name),range);
    if(update)surfaces.push(update);
  }
  let lastX=Infinity,lastZ=Infinity,lastExtra=-1,lastRevision=-1;
  return (x,z,height,full=false)=>{
    const extra=full?Infinity:Math.floor(Math.max(0,height)/40)*40;
    const moved=(x-lastX)**2+(z-lastZ)**2>=32**2||extra!==lastExtra;
    if(moved){for(const update of surfaces)update(x,z,extra);lastX=x;lastZ=z;lastExtra=extra;}
    const stream=city.streaming;
    if(!stream||(!moved&&lastRevision===stream.revision))return;
    lastRevision=stream.revision;
    for(const [key,chunk] of stream.chunks){
      const box=stream.manifest.tiles[key].bounds;
      chunk.root.visible=near(box,x,z,950+extra);
      if(!chunk.root.visible)continue;
      for(const mesh of chunk.root.children){
        const reach=layerRanges.get(mesh.name);
        if(reach)mesh.visible=near(box,x,z,reach+extra);
      }
    }
  };
}
