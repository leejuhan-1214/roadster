import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3} from 'three';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {createLandingRun,landingClearance} from '../dist/js/landing-experiment.js';

const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);

for(const id of ['lamborghini-revuelto','chevrolet-camaro']){
  test(id+' drives on its four fitted tire diameters and axle tracks',async()=>{
    const profile=vehicleProfile(id),{scene}=await loadModelGeometry(profile);
    const vehicle=adaptRealVehicle(scene,profile);
    try{
      const sim=new PhysicsSim({...vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),
        parkedWheelMounts:true,cityWheelGeometry:vehicle.cityWheelGeometry,roadRoughness:0});
      const tireIds=new Set(vehicle.catalog.filter(e=>e.title.includes('타이어')).map(e=>e.id));
      sim.reset('rolling');
      vehicle.wheels.forEach((hub,i)=>{
        const bounds=new Box3();
        hub.userData.spinGroup.traverse(mesh=>{
          if(tireIds.has(mesh.userData.partId)){
            mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);
          }
        });
        assert.ok(!bounds.isEmpty());
        const radius=(bounds.max.y-bounds.min.y)/2,w=sim.wheels[i];
        near(w.radius,radius,1e-6);
        near(w.pos.x+sim.cg.x,hub.userData.basePosition.x);
        near(w.pos.z+sim.cg.z,hub.userData.basePosition.z);
        near(w.omega*radius,20,1e-4);
      });
      const [front,frontRight,rear,rearRight]=sim.wheels;
      if(id==='lamborghini-revuelto')assert.ok(rear.radius-front.radius>.025);
      if(id==='chevrolet-camaro')assert.ok((rearRight.pos.z-rear.pos.z)-(frontRight.pos.z-front.pos.z)>.085);
      for(const sign of [-1,1]){
        sim.reset('rolling');
        sim.state.vel.x*=sign;for(const w of sim.wheels)w.omega*=sign;
        sim.step(.002,{coastRegen:false,stabilize:false});
        for(const w of sim.wheels){
          assert.ok(Math.abs(w.slip)<.003,'rolling tires do not slip solely because their radii differ');
          assert.equal(Math.sign(w.spinAngle),sign);
        }
      }
      createLandingRun(sim,{height:20,method:'free'});
      near(landingClearance(sim),20);
      for(const w of sim.wheels)near(w.radius,sim.params.wheelRadius);
    }finally{disposeVehicle(vehicle);}
  });
}

test('Cybertruck tire arcs gain visual detail without changing the fitted contact circles',async()=>{
  const profile=vehicleProfile('tesla-cybertruck');
  const {scene}=await loadModelGeometry(profile);
  const traffic=adaptRealVehicle(scene,profile,{exteriorOnly:true});
  const player=adaptRealVehicle(scene,profile);
  try{
    assert.deepEqual(player.cityWheelGeometry,traffic.cityWheelGeometry);
    for(let i=0;i<4;i++){
      const wheel=car=>car.wheels[i].userData.spinGroup.children.find(mesh=>mesh.material.name==='rubber').geometry;
      const full=wheel(player),original=wheel(traffic);
      assert.ok(full.index.count>original.index.count);
      assert.equal(full.groups[0].count,full.index.count);
      assert.equal(full.attributes.uv.count,full.attributes.position.count);
      const oldBox=original.boundingBox,newBox=full.boundingBox;
      near(oldBox.min.y,newBox.min.y,.004);near(oldBox.max.y,newBox.max.y,.004);
    }
  }finally{disposeVehicle(player);disposeVehicle(traffic);}
});
