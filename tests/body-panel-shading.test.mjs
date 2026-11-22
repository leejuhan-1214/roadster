import assert from 'node:assert/strict';
import test from 'node:test';
import {Vector3} from 'three';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {vehiclePaintRule} from '../dist/js/vehicle-paint.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

// A trim gap does not share an edge. Test the normals of vertices on two
// touching, nearly coplanar paint triangles, including split UV islands.
function samplePaintEdges(g){
  const p=g.attributes.position,n=g.attributes.normal,ix=g.index;
  if(!n||!ix)return {smooth:0,broken:0};
  const keys=new Map(),vertex=[],pos=[],norm=[];
  for(let i=0;i<p.count;i++){
    const point=new Vector3().fromBufferAttribute(p,i);
    const key=point.toArray().join('/');
    if(!keys.has(key))keys.set(key,keys.size);
    vertex.push(keys.get(key));pos.push(point);norm.push(new Vector3().fromBufferAttribute(n,i).normalize());
  }
  const edges=new Map(),geometric=[];
  for(let i=0;i<ix.count;i+=3){
    const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)],a=pos[ids[0]];
    const direction=pos[ids[1]].clone().sub(a).cross(pos[ids[2]].clone().sub(a));
    if(!direction.lengthSq())continue;
    const face=geometric.length;geometric.push(direction.normalize());
    for(let j=0;j<3;j++){
      const start=ids[j],end=ids[(j+1)%3],forward=vertex[start]<vertex[end];
      const first=forward?start:end,last=forward?end:start;
      const k=vertex[first]*keys.size+vertex[last];
      if(!edges.has(k))edges.set(k,[]);
      edges.get(k).push({first,last,forward,face});
    }
  }
  let smooth=0,broken=0;
  for(const adjacent of edges.values()){
    if(adjacent.length!==2)continue;
    const [a,b]=adjacent,na=geometric[a.face],nb=geometric[b.face];
    if(a.forward===b.forward||na.dot(nb)<.966)continue;
    for(const endpoint of ['first','last']){
      const va=norm[a[endpoint]],vb=norm[b[endpoint]];
      // Deliberately sharp panel creases and normals for other surfaces are
      // excluded. A soft crease under 15 degrees should reflect continuously.
      const dot=va.dot(vb);
      if(dot<.74||va.dot(na)<.91||vb.dot(nb)<.91)continue;
      smooth++;if(dot<.9962)broken++;
    }
  }
  return {smooth,broken};
}

const cars=['hyundai-i30','hyundai-azera','ford-mustang','toyota-yaris','bugatti-veyron','peugeot-205',
  'lamborghini-aventador-lp700-4','lamborghini-gallardo-lp560','ferrari-f40','toyota-mr2-w20',
  'aston-martin-db11','ford-escort','renault-duster','bmw-e34','lamborghini-centenario-roadster'];
for(const id of cars)test(id+' body panels share continuous normals on shallow interior edges',async()=>{
  const profile=vehicleProfile(id),{scene}=await loadModelGeometry(profile);
  let smooth=0,broken=0;
  scene.traverse(mesh=>{
    if(!mesh.isMesh||!vehiclePaintRule(profile,mesh,mesh.material))return;
    const sample=samplePaintEdges(mesh.geometry);smooth+=sample.smooth;broken+=sample.broken;
  });
  assert.ok(smooth>100,id+' should have measurable paint surfaces');
  assert.ok(broken/smooth<.005,id+' '+broken+'/'+smooth+' unexpected discontinuities');
});
