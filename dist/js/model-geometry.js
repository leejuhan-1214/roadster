import * as THREE from 'three';

// glTF node names may be sanitized by the loader. Retain both names when matching
// a reviewed asset manifest, rather than guessing component identities by shape.
export function sourcePartText(object){
  const names=[];for(let n=object;n;n=n.parent)names.push(n.name||'',n.userData.name||'');
  for(const m of Array.isArray(object.material)?object.material:[object.material])names.push(m?.name||'');
  return names.join(' ');
}
export function matchesSource(object,adapter,kind){
  const names=adapter?.[kind+'Names'];
  if(names){for(let n=object;n;n=n.parent)if(names.includes(n.name)||names.includes(n.userData.name))return true;}
  const pattern=adapter?.[kind+'Pattern'];return !!pattern&&new RegExp(pattern,'i').test(sourcePartText(object));
}
export function transformedGeometry(original,matrix){
  const geometry=original.clone();
  // Quantized normalized integers cannot store transformed metre coordinates.
  for(const key of ['position','normal','tangent']){
    const a=geometry.getAttribute(key);if(!a)continue;
    const values=new Float32Array(a.count*a.itemSize);
    for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)values[i*a.itemSize+c]=a.getComponent(i,c);
    geometry.setAttribute(key,new THREE.Float32BufferAttribute(values,a.itemSize));
  }
  geometry.applyMatrix4(matrix);
  // Flattening a mirrored node removes the renderer's negative-scale front-face
  // correction. Preserve outward winding and the tangent frame in baked geometry.
  if(matrix.determinant()<0){
    if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
    const index=geometry.index;
    for(let i=0;i+2<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
    const tangent=geometry.getAttribute('tangent');
    if(tangent)for(let i=0;i<tangent.count;i++)tangent.setW(i,-tangent.getW(i));
  }
  geometry.computeBoundingBox();return geometry;
}

// Some artists use one mesh for two or four wheels. Partition its existing
// triangles, preserving normals, UVs, materials and index topology. No new tires
// are invented and no non-wheel triangles are selected without manifest review.
export function splitWheelGeometry(geometry,splitX=0,splitZ=0,wheelBoxes=null){
  const position=geometry.getAttribute('position'),index=geometry.getIndex();
  const count=index?index.count:position.count,buckets=[[],[],[],[],[]],point=new THREE.Vector3();
  const groups=geometry.groups.length?geometry.groups:[{start:0,count,materialIndex:0}];
  for(const group of groups)for(let t=group.start;t<Math.min(count,group.start+group.count);t+=3){
    const vertices=[0,1,2].map(k=>index?index.getX(t+k):t+k);
    const x=vertices.reduce((s,i)=>s+position.getX(i),0)/3,z=vertices.reduce((s,i)=>s+position.getZ(i),0)/3;
    // Only reviewed mixed meshes use tire bounds. Keep the remaining original
    // triangles as a body piece, including badges sharing the wheel material.
    const wheel=wheelBoxes?wheelBoxes.findIndex(box=>vertices.every(i=>box.containsPoint(point.fromBufferAttribute(position,i)))):(x>splitX?0:2)+(z>splitZ?1:0);
    buckets[wheel<0?4:wheel].push({vertices,materialIndex:group.materialIndex});
  }
  return buckets.map((triangles,wheel)=>{
    if(!triangles.length)return null;
    const out=new THREE.BufferGeometry(),mapping=new Map(),vertices=[],indices=[];
    let lastMaterial=null,groupStart=0;
    for(const triangle of triangles){
      if(triangle.materialIndex!==lastMaterial){
        if(lastMaterial!==null)out.addGroup(groupStart,indices.length-groupStart,lastMaterial);
        groupStart=indices.length;lastMaterial=triangle.materialIndex;
      }
      for(const originalIndex of triangle.vertices){
        if(!mapping.has(originalIndex)){mapping.set(originalIndex,vertices.length);vertices.push(originalIndex);}
        indices.push(mapping.get(originalIndex));
      }
    }
    out.addGroup(groupStart,indices.length-groupStart,lastMaterial);
    for(const [name,attribute] of Object.entries(geometry.attributes)){
      const values=new Float32Array(vertices.length*attribute.itemSize);
      vertices.forEach((originalIndex,i)=>{for(let c=0;c<attribute.itemSize;c++)values[i*attribute.itemSize+c]=attribute.getComponent(originalIndex,c);});
      out.setAttribute(name,new THREE.Float32BufferAttribute(values,attribute.itemSize));
    }
    out.setIndex(indices);out.computeBoundingBox();out.computeBoundingSphere();
    return {geometry:out,wheel:wheel===4?-1:wheel};
  }).filter(Boolean);
}
