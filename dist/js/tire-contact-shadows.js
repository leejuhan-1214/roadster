import * as THREE from 'three';
import {CITY_ROAD_LEVELS as surfaceY} from './city-road-levels.js?v=20261122-wheel-repair';

// One transparent draw for the ambient occlusion where rubber meets the road.
// The body and airborne wheels separately cast real directional silhouettes.
export function createTireContactShadows(){
  const size=48,pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot(2*(x+.5)/size-1,2*(y+.5)/size-1);
    const t=THREE.MathUtils.clamp((r-.13)/.87,0,1);
    pixels[(y*size+x)*4+3]=Math.round(215*(1-t*t*(3-2*t)));
  }
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  const geometry=new THREE.BufferGeometry();
  const positions=new THREE.Float32BufferAttribute(new Float32Array(48),3).setUsage(THREE.DynamicDrawUsage);
  const colors=new THREE.Float32BufferAttribute(new Float32Array(64).fill(1),4).setUsage(THREE.DynamicDrawUsage);
  const indices=[],uv=[];
  for(let i=0;i<4;i++){
    const start=i*4;indices.push(start,start+2,start+1,start,start+3,start+2);uv.push(0,0,1,0,1,1,0,1);
  }
  geometry.setIndex(indices);geometry.setAttribute('position',positions);geometry.setAttribute('color',colors);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({
    map:texture,vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-8
  }));
  mesh.name='Tyre contact occlusion';mesh.frustumCulled=false;mesh.visible=false;
  return mesh;
}

const hub=new THREE.Vector3(),forward=new THREE.Vector3();
export function updateTireContactShadows(mesh,position,rotation,wheels,physicsWheels,mode){
  mesh.visible=false;
  if(mode==='inspect')return;
  const points=mesh.geometry.attributes.position,colors=mesh.geometry.attributes.color;
  for(let i=0;i<4;i++){
    const wheel=wheels[i],physical=physicsWheels[i],radius=physical.radius;
    hub.copy(wheel.pos);hub.y+=wheel.compression;hub.applyQuaternion(rotation).add(position);
    const gap=Math.max(0,hub.y-radius-wheel.surfaceY);
    const strength=.94*Math.max(0,1-gap/(.38*radius))**2;
    // On a steeply rolled car hub.y-radius can be below the road even when
    // the actual tread isn't touching. Fade using the solved tire normal load.
    const alpha=strength*Math.min(1,Math.max(0,wheel.load)/(40*9.81));
    mesh.visible ||= alpha>.003;
    const steer=wheel.steer;
    forward.set(Math.cos(steer),0,-Math.sin(steer)).applyQuaternion(rotation);
    const norm=Math.hypot(forward.x,forward.z)||1,dx=forward.x/norm,dz=forward.z/norm;
    const halfLength=Math.max(.13,.90*radius),halfWidth=Math.max(.105,.66*radius);
    for(let k=0;k<4;k++){
      const along=k===1||k===2?halfLength:-halfLength,side=k>=2?halfWidth:-halfWidth;
      const ox=along*dx-side*dz,oz=along*dz+side*dx;
      const ny=Math.max(.25,physical.normalY||1);
      const slope=((physical.normalX||0)*ox+(physical.normalZ||0)*oz)/ny;
      const support=wheel.surfaceY-slope;
      // Urban roughness is solved below the mesh resolution. Keep contact
      // visible where a depression passes beneath a flat painted lane.
      const y=mode==='city'||mode==='circuit'?Math.max(0,support)+surfaceY.contactShadow:support+.018;
      points.setXYZ(i*4+k,hub.x+ox,y,hub.z+oz);colors.setW(i*4+k,alpha);
    }
  }
  if(mesh.visible){points.needsUpdate=true;colors.needsUpdate=true;}
}
