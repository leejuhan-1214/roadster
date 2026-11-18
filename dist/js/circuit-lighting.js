import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RACE_COURSE,sampleCourse} from './station-race.js?v=20261118-model154';

// Race decoration is local to the fictional track. The warm and cool guides
// attach to the inner face of the concrete on both sides and share its vertices.
export function addCircuitLighting(root,obstacles){
  const width=RACE_COURSE.width/2,rails=[],railColors=[],spill=[],spillColors=[];
  const color=new THREE.Color(),count=Math.ceil(RACE_COURSE.length/5);
  for(const sign of [-1,1]){
    color.setHex(sign===1?0xff8156:0x64d9ef);
    for(let i=0;i<count;i++){
      const start=i*RACE_COURSE.length/count,end=(i+1)*RACE_COURSE.length/count;
      const near=sign*(width+2.389),a=sampleCourse(start,near),b=sampleCourse(end,near);
      for(const [p,y] of [[a,.58],[b,.58],[a,.66],[b,.58],[b,.66],[a,.66]]){
        rails.push(p.x,y,p.z);railColors.push(color.r,color.g,color.b);
      }
      // The unlit matte asphalt receives only local diffuse spill. Feather the
      // colour through the service apron into the outermost lane.
      const bands=[[2.38,.22],[1.65,.10],[.8,.036],[-1.45,0]];
      for(let j=0;j<bands.length-1;j++){
        for(const [s,k] of [[start,j],[end,j],[start,j+1],[end,j],[end,j+1],[start,j+1]]){
          const [offset,strength]=bands[k],p=sampleCourse(s,sign*(width+offset));
          spill.push(p.x,.025,p.z);spillColors.push(color.r,color.g,color.b,strength);
        }
      }
    }
  }
  function mounted(name,positions,colors,channels,options){
    const geom=new THREE.BufferGeometry();
    geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geom.setAttribute('color',new THREE.Float32BufferAttribute(colors,channels));geom.computeBoundingSphere();
    const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,...options}));
    mesh.name=name;root.add(mesh);
  }
  mounted('Continuous amber and cyan wall guides',rails,railColors,3,{toneMapped:false});
  mounted('Track edge light spill',spill,spillColors,4,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});

  // Split-sided vaults have a clear central span above the 24 m race ceiling.
  // Each straight steel segment shares the swept side footprint of its solver
  // prism. All low feet stand in the service apron outside the solid walls.
  const beams=[],inlays=[],radius=.16;
  const local=[[-13.9,0],[-14.8,5.2],[-14.6,14],[-13.4,21.6],[-12.45,25.6],
    [-10.4,27.8],[-6.6,29.25],[0,29.8],[6.6,29.25],[10.4,27.8],
    [12.45,25.6],[13.4,21.6],[14.6,14],[14.8,5.2],[13.9,0]];
  const up=new THREE.Vector3(0,1,0);
  function rod(a,b,r,parts){
    const dir=new THREE.Vector3().subVectors(b,a),g=new THREE.CylinderGeometry(r,r,dir.length(),8);
    const q=new THREE.Quaternion().setFromUnitVectors(up,dir.normalize()),center=a.clone().lerp(b,.5);
    g.applyQuaternion(q);g.translate(center.x,center.y,center.z);parts.push(g);
  }
  for(const s of [33,41,49,57]){
    const course=sampleCourse(s),forward=[Math.cos(course.heading),-Math.sin(course.heading)];
    const point=(lateral,y,back=0)=>{
      const p=sampleCourse(s,lateral);return new THREE.Vector3(p.x+forward[0]*back,y,p.z+forward[1]*back);
    };
    for(let i=1;i<local.length;i++){
      const [la,ya]=local[i-1],[lb,yb]=local[i],a=point(la,ya),b=point(lb,yb);
      rod(a,b,radius,beams);
      rod(point(la,ya,-.16),point(lb,yb,-.16),.035,inlays);
      const lo=Math.min(la,lb)-radius,hi=Math.max(la,lb)+radius;
      const footprint=[[lo,-.20],[hi,-.20],[hi,.20],[lo,.20]].map(([l,d])=>{
        const p=point(l,0,d);return [p.x,p.z];
      });
      const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
      obstacles.push({id:'circuit-vault-'+s+'-'+i,kind:'prism',footprint,
        center:[(a.x+b.x)/2,(ya+yb)/2,(a.z+b.z)/2],
        size:[Math.max(...xs)-Math.min(...xs),Math.abs(ya-yb)+2*radius,Math.max(...zs)-Math.min(...zs)]});
    }
  }
  for(const [parts,name,mat] of [[beams,'Circuit vaulted steel ribs',new THREE.MeshStandardMaterial({color:0x7d8993,metalness:.73,roughness:.36})],
    [inlays,'Vault soffit lighting',new THREE.MeshBasicMaterial({color:0xffcd9f})]]){
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.receiveShadow=true;root.add(mesh);
  }
}
