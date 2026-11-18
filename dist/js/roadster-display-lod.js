import * as THREE from 'three';

// Only pack vertices actually used by the reduced indices. Copy each attribute
// verbatim, including UV sets, tangents and any normalized integer values.
function packedSurface(records) {
  const vertexLists=[];
  const indexCount=records.reduce((sum,r)=>sum+r.display.index.count,0);
  const indices=new Uint32Array(indexCount);
  let vertexCount=0,cursor=0;
  for(const {display} of records){
    const remap=new Uint32Array(display.attributes.position.count),used=[];
    for(const source of display.index.array){
      if(!remap[source]){remap[source]=++vertexCount;used.push(source);}
      indices[cursor++]=remap[source]-1;
    }
    vertexLists.push(used);
  }
  const result=new THREE.BufferGeometry(),first=records[0].display;
  for(const [name,attribute] of Object.entries(first.attributes)){
    const size=attribute.itemSize,output=new attribute.array.constructor(vertexCount*size);
    let target=0;
    for(const [i,{display}] of records.entries()){
      const array=display.attributes[name].array;
      for(const vertex of vertexLists[i]){
        const start=vertex*size;
        for(let j=0;j<size;j++)output[target++]=array[start+j];
      }
    }
    result.setAttribute(name,new THREE.BufferAttribute(output,size,attribute.normalized));
  }
  result.setIndex(new THREE.BufferAttribute(vertexCount<65536?new Uint16Array(indices):indices,1));
  result.computeBoundingSphere();
  return result;
}

function batchOpaqueSurfaces(records){
  const buckets=new Map(),identity=new THREE.Matrix4();
  for(const record of records){
    const {mesh,display}=record,mat=mesh.material;
    mesh.updateMatrix();
    if(!mat?.isMaterial||mat.transparent||mat.transmission>0||!display.index||mesh.children.length||!mesh.matrix.equals(identity))continue;
    const attributes=Object.entries(display.attributes).sort(([a],[b])=>a.localeCompare(b));
    if(attributes.some(([,a])=>a.isInterleavedBufferAttribute)||Object.keys(display.morphAttributes).length)continue;
    // Static body, cabin, each steered wheel and each spinning hub have their
    // own parent. Glass retains independent three.js depth sorting.
    const format=attributes.map(([name,a])=>[name,a.itemSize,a.normalized,a.array.constructor.name].join('/')).join('+');
    const key=[mesh.parent.id,mat.id,mesh.renderOrder,mesh.layers.mask,mesh.castShadow,mesh.receiveShadow,format].join('|');
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push(record);
  }
  for(const group of buckets.values()){
    if(group.length<2)continue;
    const merged=packedSurface(group);
    group[0].display=merged;
    for(const record of group.slice(1)){
      record.batched=true;
      record.display=record.original;
    }
  }
}

// In assembly view one source mesh draws each opaque batch at its original
// pivot. Keep every selectable object and its visibility in the scene graph.
export function installRoadsterDisplayLod(vehicle, buffer) {
  const data = new DataView(buffer);
  if (data.byteLength < 8 || data.getUint32(0) !== 0x52444c31) throw new Error('Unknown Roadster display indices');
  const count = data.getUint32(4,true);
  if (8 + count * 24 > data.byteLength) throw new Error('Incomplete Roadster display table');
  const meshes = new Map();
  for (const mesh of vehicle.detailParts.values()) {
    if (mesh.isMesh&&Number.isInteger(mesh.userData.sourceMeshIndex)) meshes.set(mesh.userData.sourceMeshIndex, mesh);
  }
  const reduced = new Map();
  for (let i = 0; i < count; i++) {
    const read = j => data.getUint32(8 + 24 * i + 4 * j, true);
    const mesh = meshes.get(read(0)), original = mesh?.geometry;
    const vertices = read(1), sourceCount = read(2), reducedCount = read(3), width = read(4), offset = read(5);
    if (original?.index?.count !== sourceCount || original.attributes.position.count !== vertices ||
        ![2,4].includes(width) || offset % 4 || offset < 8 + count * 24 ||
        !reducedCount || reducedCount % 3 || reducedCount >= sourceCount ||
        offset + reducedCount * width > buffer.byteLength) throw new Error('Roadster display indices do not match the model');
    const Type = width === 4 ? Uint32Array : Uint16Array;
    const indices = new THREE.BufferAttribute(new Type(buffer, offset, reducedCount), 1);
    const display = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(original.attributes)) display.setAttribute(name, attribute);
    display.setIndex(indices);
    display.boundingBox = original.boundingBox;
    display.boundingSphere = original.boundingSphere;
    reduced.set(mesh,display);
  }
  const records=[...meshes.values()].map(mesh=>({mesh,original:mesh.geometry,
    display:reduced.get(mesh)||mesh.geometry,batched:false,layers:mesh.layers.mask}));
  batchOpaqueSurfaces(records);
  for (const {original, display} of records) {
    if(original===display)continue;
    // Vehicle eviction (or shutdown) can occur from either rendering mode.
    const releasePair = ({target}) => {
      original.removeEventListener('dispose', releasePair);
      display.removeEventListener('dispose', releasePair);
      (target === original ? display : original).dispose();
    };
    original.addEventListener('dispose', releasePair);
    display.addEventListener('dispose', releasePair);
  }
  let active = false;
  vehicle.setExteriorDisplayLod = enabled => {
    if (enabled === active) return;
    active = enabled;
    for (const record of records){
      const {mesh,original,display}=record;
      mesh.geometry=enabled?display:original;
      if(record.batched){
        if(enabled){record.layers=mesh.layers.mask;mesh.layers.disableAll();}
        else mesh.layers.mask=record.layers;
      }
    }
  };
}
