import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {DrivingController,CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {adaptRealVehicle,disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

for(const id of ['volvo-v40','hyundai-i30','lamborghini-gallardo-lp560']){
  test(id+' drives and turns on its tires without dragging imaginary bumper corners',async()=>{
    const profile=vehicleProfile(id),model=await loadModelGeometry(profile);
    const vehicle=adaptRealVehicle(model.scene,profile);
    try{
      const sim=new PhysicsSim({...vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),...CITY_DRIVE_PARAMS,
        parkedWheelMounts:true,cityWheelGeometry:vehicle.cityWheelGeometry,cityGroundSupports:vehicle.cityGroundSupports});
      const driver=new DrivingController(),dt=.002;
      sim.state.pos.x=-2.95;sim.state.pos.z=17.28;
      let maxFan=0,limited=false;
      for(const [seconds,codes] of [[.5,[]],[2,['KeyW']],[1,[]],[1,['KeyW','KeyA']]]){
        const keys=new Set(codes);
        for(let i=0;i<seconds/dt;i++){
          sim.step(dt,driver.update(keys,sim,dt));
          assert.equal(sim.bodyGroundContacts,0);
          assert.equal(sim.groundCorrectionImpulseNs,0);
          assert.equal(sim.contactCount,4);
          maxFan=Math.max(maxFan,sim.fanForce);
          if(sim.fanForce>0&&sim.fanPowerW<.9*sim.params.fanPowerKW*1000)limited=true;
        }
      }
      assert.ok(sim.state.pos.x>20);assert.ok(sim.telemetry().attitude.yaw>.1);
      assert.equal(sim.state.gasUsed,0);assert.ok(maxFan>1000);
      if(id==='hyundai-i30')assert.ok(limited,'a low rigid underbody must limit suction under load');
      sim.state.q.identity();sim.state.pos.y=-Math.min(...sim._groundLevers().map(r=>r.y))-.02;
      sim.state.vel.set(0,-1,0);sim._resolveGround();
      assert.ok(sim.groundCorrectionImpulseNs>0,'genuine contact with the actual underside still reacts');
    }finally{disposeVehicle(vehicle);}
  });
}
