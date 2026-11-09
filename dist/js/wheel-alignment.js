import * as THREE from 'three';

// A tire's narrow principal direction is its axle. Fit from tire vertices only:
// spoke density, offset calipers and asymmetric hub details must not bias it.
export function tireAxle(geometries){
  const mean=new THREE.Vector3();let count=0;
  for(const geometry of geometries){const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){mean.x+=p.getX(i);mean.y+=p.getY(i);mean.z+=p.getZ(i);count++;}}
  if(count<12)return null;mean.divideScalar(count);
  const a=Array.from({length:3},()=>[0,0,0]),vectors=[[1,0,0],[0,1,0],[0,0,1]];
  for(const geometry of geometries){const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const v=[p.getX(i)-mean.x,p.getY(i)-mean.y,p.getZ(i)-mean.z];
      for(let row=0;row<3;row++)for(let col=0;col<3;col++)a[row][col]+=v[row]*v[col]/count;
    }}
  // Jacobi rotation of the symmetric covariance matrix.
  for(let iteration=0;iteration<32;iteration++){
    let p=0,q=1;
    for(const [row,col] of [[0,2],[1,2]])if(Math.abs(a[row][col])>Math.abs(a[p][q])){p=row;q=col;}
    if(Math.abs(a[p][q])<1e-12)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    const pp=a[p][p],qq=a[q][q],pq=a[p][q];
    a[p][p]=c*c*pp-2*s*c*pq+s*s*qq;a[q][q]=s*s*pp+2*s*c*pq+c*c*qq;a[p][q]=a[q][p]=0;
    for(let row=0;row<3;row++){
      if(row!==p&&row!==q){const rp=a[row][p],rq=a[row][q];a[row][p]=a[p][row]=c*rp-s*rq;a[row][q]=a[q][row]=s*rp+c*rq;}
      const vp=vectors[row][p],vq=vectors[row][q];vectors[row][p]=c*vp-s*vq;vectors[row][q]=s*vp+c*vq;
    }
  }
  const order=[0,1,2].sort((i,j)=>a[i][i]-a[j][j]),index=order[0];
  // Refuse ambiguous spherical or near-planar degenerate input.
  if(a[order[1]][order[1]]<=1e-12||a[index][index]>.8*a[order[1]][order[1]])return null;
  const axis=new THREE.Vector3(...vectors.map(row=>row[index])).normalize();
  if(axis.z<0)axis.negate();
  return axis;
}

// All simulated wheel hubs have a neutral +Z axle. Source models sometimes
// bake parked steering and camber into vertex positions. Rotate each complete
// tire/rim/brake assembly around its existing hub before applying chassis scale.
export function straightenWheelAxes(records,boxes){
  const result=[];
  for(let wheel=0;wheel<4;wheel++){
    const axis=tireAxle(records.filter(r=>r.wheel===wheel&&r.tire).map(r=>r.geometry));
    const angle=axis?axis.angleTo(new THREE.Vector3(0,0,1)):0;
    const correction=new THREE.Quaternion();
    // Sub-degree asymmetry is commonly tread sampling noise, not parked pose.
    if(axis&&angle>.01&&angle<Math.PI*.45){
      correction.setFromUnitVectors(axis,new THREE.Vector3(0,0,1));
      const hub=boxes[wheel].getCenter(new THREE.Vector3());
      const matrix=new THREE.Matrix4().makeTranslation(hub.x,hub.y,hub.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(correction))
        .multiply(new THREE.Matrix4().makeTranslation(-hub.x,-hub.y,-hub.z));
      boxes[wheel].makeEmpty();
      for(const record of records)if(record.wheel===wheel){record.geometry.applyMatrix4(matrix);record.geometry.computeBoundingBox();if(record.tire)boxes[wheel].union(record.geometry.boundingBox);}
    }
    result.push({angle,axis:axis?.toArray()||[0,0,1],correction:correction.toArray()});
  }
  return result;
}
