import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Assemble one batched district landmark for the selected venue. Keep every
// support beyond the safety walls, including any other leg of a folded course.
export function addCircuitLandmarks(root,obstacles,course){
  const bodies=[],details=[];
  const accent=new THREE.MeshStandardMaterial({color:course.accent,metalness:.38,roughness:.42});
  const steel=new THREE.MeshStandardMaterial({color:0x657889,metalness:.56,roughness:.56});
  const up=new THREE.Vector3(0,1,0),placement=new THREE.Matrix4();
  if(course.theme==='ridge'){
    // A faceted ridge beyond the circuit boundary silhouettes the observation
    // towers. No section can project onto the playable track.
    const b=course.extent,positions=[],n=26,colors=[];
    const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
    function ridge(i,ring){
      const a=i/n*Math.PI*2,rx=(b.maxX-b.minX)/2+370,rz=(b.maxZ-b.minZ)/2+370;
      const factor=ring===0?1.52:ring===1?1.95:2.3;
      return [cx+rx*factor*Math.cos(a),ring===1?105+58*Math.sin(a*5+.4)+37*Math.cos(a*9):-.1,cz+rz*factor*Math.sin(a)];
    }
    for(let i=0;i<n;i++){
      for(const triangle of [[0,0,1,0,1,1],[0,0,1,1,0,1],[0,1,1,1,1,2],[0,1,1,2,0,2]]){
        for(let k=0;k<6;k+=2){
          const ring=triangle[k+1];positions.push(...ridge(i+triangle[k],ring));
          if(ring===1)colors.push(.29,.34,.36);else colors.push(.13,.18,.18);
        }
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    root.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1})));
  }
  let count=0;
  for(let n=0;n<16&&count<7;n++){
    const distance=course.length*(.13+.049*n),side=n%2?1:-1;
    const pose=course.sample(distance,side*(58+7*(n%3)));
    if(course.project(pose).error<48)continue;
    const rotation=new THREE.Quaternion().setFromAxisAngle(up,pose.heading);
    placement.compose(new THREE.Vector3(pose.x,0,pose.z),rotation,new THREE.Vector3(1,1,1));
    const tower=(g,x,y,z,detailed=false)=>{
      g.translate(x,y,z).applyMatrix4(placement);(detailed?details:bodies).push(g);
    };
    const box=(x,y,z,l,h,w,detail)=>tower(new THREE.BoxGeometry(l,h,w),x,y,z,detail);
    const cylinder=(x,y,z,top,bottom,h,detail)=>tower(new THREE.CylinderGeometry(top,bottom,h,10),x,y,z,detail);
    const solid=(x,z,length,width,height)=>{
      const center=new THREE.Vector3(x,height/2,z).applyMatrix4(placement);
      const footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
        const p=new THREE.Vector3(x+a*length/2,0,z+b*width/2).applyMatrix4(placement);
        return [p.x,p.z];
      });
      const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
      obstacles.push({id:'venue-'+course.id+'-'+obstacles.length,kind:'prism',footprint,
        center:center.toArray(),size:[Math.max(...xs)-Math.min(...xs),height,Math.max(...zs)-Math.min(...zs)]});
    };
    if(course.theme==='harbor'){
      // Container gantry, high crossbeam and hanging hoist.
      for(const x of [-6,6])for(const z of [-4,4]){box(x,10,z,1.2,20,1.2);solid(x,z,1.2,1.2,20);}
      box(0,21,0,18,2.2,10,true);box(6,19,-5,3.5,3.2,2.4);box(0,16,0,.32,8,.32,true);box(0,11,0,5.4,1.1,2.3,true);
    }else if(course.theme==='ridge'){
      // Faceted outcrops supporting the summit observation station.
      cylinder(0,6,0,6,11,12);cylinder(0,15.5,0,2.6,6.1,7);solid(0,0,13,13,15);
      cylinder(0,20.2,0,3.6,3.6,2.5,true);cylinder(0,25.6,0,.22,.28,8);
    }else if(course.theme==='solar'){
      // The nacelle, tower and three rotor blades remain readable at road speed.
      cylinder(0,13,0,.75,1.4,26);solid(0,0,2.4,2.4,26);
      box(0,26.4,0,4.8,2.2,2.25);cylinder(2.55,26.4,0,1.1,1.1,1.4,true);
      for(let b=0;b<3;b++){
        const blade=new THREE.ConeGeometry(.8,12,5).translate(0,6.2,0).rotateX(b*Math.PI*2/3+n*.38);
        tower(blade,2.95,26.4,0,true);
      }
      for(let row=0;row<3;row++){
        const panel=new THREE.BoxGeometry(8,.18,3.2).rotateX(-.32);
        tower(panel,-10,1.95,-6+row*5,true);
        box(-10,.8,-6+row*5,.55,1.6,.5);solid(-10,-6+row*5,8,3,2.4);
      }
    }else{
      // A skybridge links offset transit towers outside the racing line.
      for(const x of [-8,8]){box(x,13,0,6.4,26,7.5);solid(x,0,6.4,7.5,26);
        for(let k=1;k<5;k++)box(x,k*5.2,0,6.55,.44,7.65,true);}
      box(0,22,0,16,3.7,4.5,true);
    }
    count++;
  }
  for(const [list,material] of [[bodies,steel],[details,accent]]){
    if(!list.length){material.dispose();continue;}
    const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,material);mesh.name=course.name+' 경기장 구조물';root.add(mesh);
  }
}
