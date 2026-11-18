import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

// These exact artist meshes include wheel faces, inner rims, brake hardware,
// hubs, or baked shading. Several share a material with unrelated bodywork.
// Count the triangles on their actual runtime parents, including the pieces
// that must follow steering and suspension without rotating with the tire.
const cases=[
  {id:'ford-focus',part:/^INNER14_/,rolling:39,corners:1,carrier:0},
  {id:'ford-mustang',part:/^GT500Hub/,rolling:0,corners:0,carrier:1243},
  {id:'volvo-v40',part:/^Object_(11|15|16|17)$/,rolling:3112,corners:4,carrier:0},
  {id:'nissan-gt-r',part:/^Object_11$/,rolling:611,corners:4,carrier:0},
  {id:'kia-sportage',part:/^CAR_kia_sportage_mat_0_0$/,rolling:1861,corners:4,carrier:0},
  {id:'audi-a1',part:/^Material2_1$|^Material3_4$/,rolling:4559,corners:4,carrier:0},
  {id:'hyundai-i30',part:/^Material2_18$/,rolling:8361,corners:4,carrier:2230},
  {id:'bugatti-chiron',part:/^Object_48$/,rolling:170,corners:4,carrier:0},
];
const triangles=g=>(g.index?.count??g.attributes.position.count)/3;

for(const c of cases)test(c.id+' carries the reviewed mesh triangles on their physical wheel assemblies',async()=>{
  const profile=VEHICLES.find(p=>p.id===c.id),gltf=await loadModelGeometry(profile);
  let sourceCount=0;
  gltf.scene.traverse(obj=>{if(obj.isMesh&&c.part.test(obj.name))sourceCount+=triangles(obj.geometry);});
  const vehicle=adaptRealVehicle(gltf.scene,profile);
  try{
    let rolling=0,carried=0,body=0;
    const corners=new Set();
    for(const mesh of vehicle.detailParts.values()){
      if(!mesh.isMesh||!c.part.test(mesh.name))continue;
      const wheel=vehicle.wheels.find(w=>w.userData.spinGroup===mesh.parent);
      const n=triangles(mesh.geometry);
      if(wheel){
        corners.add(wheel);rolling+=n;
        const pos=mesh.geometry.attributes.position;
        for(let i=0;i<pos.count;i++)assert.ok(
          Math.hypot(pos.getX(i),pos.getY(i))<=1.05*vehicle.geometryParams.wheelRadius,
          'body faces cannot orbit the wheel hub');
      }else if(vehicle.wheels.includes(mesh.parent))carried+=n;
      else body+=n;
    }
    assert.equal(rolling+carried+body,sourceCount,'all original triangles accounted for exactly once');
    assert.equal(rolling,c.rolling);assert.equal(carried,c.carrier);assert.equal(corners.size,c.corners);
    if(c.id==='volvo-v40'){
      const p=vehicle.geometryParams;
      assert.ok(p.bodyCenterY-p.bodyHeight/2+.24+p.wheelRadius>.14,'wheel geometry cannot become the rigid belly of the Volvo');
    }
  }finally{disposeVehicle(vehicle);}
});
