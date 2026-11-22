import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {DEFAULTS,PhysicsSim} from '../dist/js/physics.js';
import {CITY_DRIVE_PARAMS,DrivingController} from '../dist/js/driving-input.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {loadModelGeometry} from './model-loader-helper.mjs';
import {assertChassisClearance} from './chassis-clearance-helper.mjs';

for(const id of ['sd-ls2-condor-c400r','sd-ls1-vulture-v6r','pagani-huayra','bugatti-chiron']){
 test(id+': hard braking and turn-in on level asphalt load the suspension without scraping',async()=>{
  const profile=vehicleProfile(id),gltf=await loadModelGeometry(profile);
  const car=adaptRealVehicle(gltf.scene,profile);
  try{
   prepareAssessmentVehicle(car);prepareRocketRetrofit(car);configureVehicleFit(car,profile);
   const sim=new PhysicsSim({...vehiclePhysics(profile,car.geometryParams,DEFAULTS),...CITY_DRIVE_PARAMS,
     parkedWheelMounts:true,cityWheelGeometry:car.cityWheelGeometry,cityGroundSupports:car.cityGroundSupports});
   sim.reset('ground');
   const driver=new DrivingController(),dt=.002;
   for(const [keys,steps] of [[[],250],[['KeyW'],2600],[['KeyB'],720],[['KeyD','KeyW'],450]]){
    const pressed=new Set(keys);
    for(let i=0;i<steps;i++){
     sim.step(dt,driver.update(pressed,sim,dt));
     assert.equal(sim.bodyGroundContacts,0,'tire contact must carry the body');
     if(i===steps-1||keys.includes('KeyB')&&i%90===0)assertChassisClearance(car,profile,sim,false);
    }
    if(keys.length===1&&keys[0]==='KeyW')assert.ok(sim.state.vel.x>20,'braking test must reach speed');
   }
  }finally{disposeVehicle(car);}
 });
}
