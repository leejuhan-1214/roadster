import * as THREE from 'three';
import {distanceSelection,footprintBounds,uploadPrefix} from './city-detail-distance.js?v=20261118-circuit155';

// The distant facade keeps the actual constituent volumes and GT's five
// half-waves. Window bays become a repeating, mipmapped texture at this scale.
function coarseGlass(buildings){
  const positions=[],uvs=[],indices=[],ranges=[];
  for(const {modelFrame:f,kind,coarseWalls} of buildings){
    const start=indices.length,c=Math.cos(f.angle),s=Math.sin(f.angle);
    function walls(x,y,z,w,h,d,sections,wave){
      const corners=[[-1,1],[1,1],[1,-1],[-1,-1]];
      for(let face=0;face<4;face++)for(let row=0;row<sections;row++){
        const index=positions.length/3,sideWidth=face%2?d:w;
        for(const [end,level] of [[0,row],[1,row],[1,row+1],[0,row+1]]){
          const [cx,cz]=corners[(face+end)%4],t=level/sections;
          const shift=wave?Math.sin(t*5*Math.PI):0,u=x+cx*w/2+1.8*shift,v=z+cz*d/2+2.4*shift;
          positions.push(f.center[0]+c*u-s*v,y+h*(t-.5),f.center[1]+s*u+c*v);
          uvs.push(end*sideWidth/2.15,t*h/3.4);
        }
        indices.push(index,index+1,index+2,index,index+2,index+3);
      }
    }
    // Original opaque cores, roofs and garden remain visible at either level.
    for(const [x,y,z,w,h,d] of coarseWalls)walls(x,y,z,w+.36,h,d+.36,1,false);
    if(kind==='gt')walls(0,68.2,0,f.width,120,f.depth,40,true);
    ranges.push([start,indices.length-start]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const size=16,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const color=y===0?[78,97,108]:x===0?[111,135,146]:[102,131,143];
    pixels.set([...color,255],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(pixels,size,size);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.28,metalness:.34}));
  mesh.name='Distant landmark glass';mesh.castShadow=true;mesh.receiveShadow=true;
  return {mesh,ranges};
}

function indexSelector(mesh,ranges,near){
  const geometry=mesh.geometry,attribute=geometry.index;
  // GLTFLoader can return views into a single ArrayBuffer shared by all
  // materials. Use a separate writable array, preserving the original ranges.
  const original=attribute.array;
  const active=new THREE.BufferAttribute(original.slice(),1).setUsage(THREE.DynamicDrawUsage);
  geometry.setIndex(active);
  return (selected,areas)=>{
    let count=0;
    const bounds=new THREE.Box3();
    for(let b=0;b<ranges.length;b++){
      if(Boolean(selected[b])!==near)continue;
      const [start,length]=ranges[b];
      active.array.set(original.subarray(start,start+length),count);
      count+=length;
      bounds.union(areas[b].bounds);
    }
    geometry.setDrawRange(0,count);mesh.visible=count>0;uploadPrefix(active,count);
    if(count){
      geometry.boundingBox??=new THREE.Box3();geometry.boundingBox.copy(bounds);
      geometry.boundingSphere??=new THREE.Sphere();bounds.getBoundingSphere(geometry.boundingSphere);
    }
  };
}

export function prepareLandmarkDetail(root,buildings){
  const coarse=coarseGlass(buildings),switches=[];
  const materials={'Architectural blue reflective glass':'glass','Silver curtain-wall mullions':'frame'};
  root.traverse(mesh=>{
    const key=materials[mesh.material?.name];
    if(key)switches.push(indexSelector(mesh,buildings.map(b=>b.detailRanges[key]),true));
  });
  root.add(coarse.mesh);switches.push(indexSelector(coarse.mesh,coarse.ranges,false));
  const areas=buildings.map(b=>{
    const f=b.modelFrame,c=Math.cos(f.angle),s=Math.sin(f.angle);
    const a=footprintBounds([[-1,-1],[-1,1],[1,1],[1,-1]].map(([u,v])=>[
      f.center[0]+c*u*f.width/2-s*v*f.depth/2,f.center[1]+s*u*f.width/2+c*v*f.depth/2]));
    const bounds=new THREE.Box3(new THREE.Vector3(a.minX,0,a.minZ),new THREE.Vector3(a.maxX,b.height,a.maxZ));
    return {...a,bounds:bounds.expandByScalar(5)};
  });
  return distanceSelection(areas,selected=>{for(const update of switches)update(selected,areas);});
}

export function prepareExtraLandmarkDetail(root,models){
  const trims=[],areas=[];
  for(const model of models){
    const group=root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(model.englishName));
    if(!group)continue;
    const bounds=new THREE.Box3().setFromObject(group),trim=[];
    areas.push({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
    group.traverse(mesh=>{
      if(mesh.isMesh&&['Window frames','Terrace foliage','Trunks'].includes(mesh.material.name))trim.push(mesh);
    });
    trims.push(trim);
  }
  return distanceSelection(areas,selected=>{
    for(let b=0;b<trims.length;b++)for(const mesh of trims[b])mesh.visible=Boolean(selected[b]);
  });
}
