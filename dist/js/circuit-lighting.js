import * as THREE from 'three';
import {CITY_ROAD_LEVELS as surfaceY} from './city-road-levels.js?v=20261122-wheel-repair';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RACE_COURSE,sampleCourse,circuitStations,runoffWidth} from './station-race-course.js?v=20261119-ai158';

// Race decoration is local to the fictional track. The warm and cool guides
// attach to the inner face of the concrete on both sides and share its vertices.
export function addCircuitLighting(root,obstacles){
  const width=RACE_COURSE.width/2,rails=[],railColors=[],spill=[],spillColors=[];
  const color=new THREE.Color(),count=circuitStations.length-1;
  for(const sign of [-1,1]){
    color.setHex(sign===1?0xff8156:0x64d9ef);
    for(let i=0;i<count;i++){
      const start=circuitStations[i],end=circuitStations[i+1];
      const guide=s=>sign*(width+runoffWidth(s,sign)-.011);
      const a=sampleCourse(start,guide(start)),b=sampleCourse(end,guide(end));
      for(const [p,y] of [[a,.58],[b,.58],[a,.66],[b,.58],[b,.66],[a,.66]]){
        rails.push(p.x,y,p.z);railColors.push(color.r,color.g,color.b);
      }
      // The unlit matte asphalt receives only local diffuse spill. Feather the
      // colour through the service apron into the outermost lane.
      const bands=[[2.38,.22],[1.65,.10],[.8,.036],[-1.45,0]];
      for(let j=0;j<bands.length-1;j++){
        for(const [s,k] of [[start,j],[end,j],[start,j+1],[end,j],[end,j+1],[start,j+1]]){
          const [offset,strength]=bands[k],p=sampleCourse(s,sign*(width+runoffWidth(s,sign)-2.4+offset));
          spill.push(p.x,surfaceY.crossing,p.z);spillColors.push(color.r,color.g,color.b,strength);
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
  mounted('Track edge light spill',spill,spillColors,4,{transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2,blending:THREE.AdditiveBlending});

  // A pair of stepped beacons frames the crest of the slalom from a distance.
  // Each vertical fin uses the same triangular footprint for drawing and contact.
  const crest=RACE_COURSE.gates.filter(g=>g.air).reduce((a,b)=>a.aperture.maxY>b.aperture.maxY?a:b);
  const fins=[],lights=[],tints=[];
  for(const side of [-1,1]){
    const edgeColor=new THREE.Color(side<0?0x8ee4f7:0xffae6a);
    for(let i=0;i<3;i++){
      const station=crest.distance+6*i, lateral=side*(width+runoffWidth(station,side)+12+2.6*i);
      const pose=sampleCourse(station,lateral),height=crest.aperture.maxY+9+5*i;
      const c=Math.cos(pose.heading),s=Math.sin(pose.heading);
      const vertex=(along,across,y)=>[pose.x+c*along+s*across,y,pose.z-s*along+c*across];
      const footprint=[vertex(-2.4,0,0),vertex(1.2,-1.05,0),vertex(1.2,1.05,0)];
      const roof=footprint.map(([x,,z])=>[x,height,z]);
      for(let j=0;j<3;j++){
        const k=(j+1)%3;
        fins.push(...footprint[j],...roof[j],...roof[k],...footprint[j],...roof[k],...footprint[k]);
      }
      fins.push(...roof[0],...roof[2],...roof[1]);
      const bottom=height*.16,top=height-.28;
      for(const edge of [-1,1]){
        const a=vertex(-2.43,0,bottom),b=vertex(-1.81,.185*edge,bottom);
        const d=vertex(-2.43,0,top),e=vertex(-1.81,.185*edge,top);
        lights.push(...a,...b,...d,...b,...e,...d);
        for(let n=0;n<6;n++)tints.push(edgeColor.r,edgeColor.g,edgeColor.b);
      }
      const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[2]);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      obstacles.push({id:'flight-beacon-'+side+'-'+i,kind:'prism',footprint:footprint.map(([x,,z])=>[x,z]),
        center:[(minX+maxX)/2,height/2,(minZ+maxZ)/2],size:[maxX-minX,height,maxZ-minZ]});
    }
  }
  const finGeometry=new THREE.BufferGeometry();
  finGeometry.setAttribute('position',new THREE.Float32BufferAttribute(fins,3));finGeometry.computeVertexNormals();
  const beacons=new THREE.Mesh(finGeometry,new THREE.MeshStandardMaterial({color:0x879399,metalness:.62,roughness:.32,side:THREE.DoubleSide}));
  beacons.name='Air slalom crest beacons';root.add(beacons);
  mounted('Air slalom beacon inlays',lights,tints,3,{toneMapped:false});

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
