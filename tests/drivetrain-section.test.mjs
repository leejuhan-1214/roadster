import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ENGINE_STROKES,setEngineStrokeDisplay,updateDrivetrainSection} from '../dist/js/drivetrain-section.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
const cases=[['mazda-miata-mx-5',4,2],['bmw',4,2],['toyota-supra-mk',6,2],['ferrari',8,4],['toyota-ae86',4,2],['nissan-gt-r',6,2],['honda-civic',4,2]];
for(const [id,count,camCount] of cases)test(id+' cutaway closes every piston linkage over a complete four-stroke cycle',()=>{
  const vehicle=createVehicle({suspensionProfileId:id});
  try{
    const rig=vehicle.engineSection;
    assert.equal(rig.cylinders.length,count);assert.equal(rig.cams.length,camCount);assert.equal(vehicle.driveRotors.length,0);
    for(let n=-8;n<=72;n++){
      const theta=n*Math.PI/16;updateDrivetrainSection(vehicle,[0,0,0,0],theta);vehicle.root.updateMatrixWorld(true);
      close(rig.crank.rotation.x,theta);for(const cam of rig.cams)close(cam.rotation.x,theta/2);
      for(const {piston,rod,valves,springs} of rig.cylinders){
        const pin=rod.localToWorld(new THREE.Vector3(0,rig.rodLength,0));
        close(pin.distanceTo(piston.getWorldPosition(new THREE.Vector3())),0);
        for(const [i,v] of valves.entries()){
          assert.ok(v.position.y>=.2-1e-9&&v.position.y<=.208);
          assert.ok(springs[i].scale.y>0&&springs[i].scale.y<=1);
        }
      }
    }
    const c=rig.cylinders[0];
    for(const [stroke,open] of [[.5,-1],[1.5,0],[2.5,1],[3.5,-1]]){
      updateDrivetrainSection(vehicle,[],c.tdc+stroke*Math.PI);
      c.valves.forEach((v,i)=>close(v.position.y,i===open?.2:.208));
    }
  }finally{disposeVehicle(vehicle);}
});

test('the three Roadster motors have stationary windings and a two-stage 9:1 reduction',()=>{
  const vehicle=createVehicle();
  try{
    updateDrivetrainSection(vehicle,[1,3,4,5]);
    for(const [i,expected] of [2,4,5].entries()){
      const unit=vehicle.driveRotors[i],stator=unit.rotor.parent.getObjectByName('stationary copper windings');
      assert.ok(stator.isInstancedMesh);close(stator.rotation.z,0);
      close(unit.rotor.rotation.z,expected*9);close(unit.middle.rotation.z,-expected*3);close(unit.gear.rotation.z,expected);
    }
    updateDrivetrainSection(vehicle,[],1.2);close(vehicle.driveRotors[0].gear.rotation.z,1.2/9);
  }finally{disposeVehicle(vehicle);}
});

test('optional stroke colors follow each cylinder’s valve timing and moving crown, including paused and reversed previews',()=>{
  const vehicle=createVehicle({suspensionProfileId:'toyota-supra-mk'});
  try{
    const rig=vehicle.engineSection;
    assert.deepEqual(ENGINE_STROKES.map(stage=>stage.id),['intake','compression','expansion','exhaust']);
    assert.equal(setEngineStrokeDisplay({},true),false);
    assert.equal(rig.strokeDisplay,false);
    assert.ok(rig.cylinders.every(c=>!c.indicator.visible));
    updateDrivetrainSection(vehicle,[],2.5*Math.PI);
    assert.equal(setEngineStrokeDisplay(vehicle,true),true);
    assert.equal(rig.cylinders[0].strokeIndex,0);
    assert.equal(rig.lastAngle,2.5*Math.PI);
    assert.ok(new Set(rig.cylinders.map(c=>c.strokeIndex)).size>1);
    for(const c of rig.cylinders){
      for(const [midpoint,index,open] of [[0,2,-1],[.5,2,-1],[1.5,3,0],[2.5,0,1],[3.5,1,-1],[-.5,1,-1]]){
        const angle=c.tdc+midpoint*Math.PI;
        updateDrivetrainSection(vehicle,[],angle);
        assert.ok(c.indicator.visible);assert.equal(c.strokeIndex,index);
        assert.equal('#'+c.chamber.material.color.getHexString(),ENGINE_STROKES[index].color);
        assert.ok(c.chamber.material.transparent&&c.chamber.material.depthWrite===false);
        assert.equal(c.lip.material.color.getHex(),c.chamber.material.color.getHex());
        c.valves.forEach((valve,i)=>close(valve.position.y,i===open?.2:.208));
        const halfHeight=c.chamber.scale.y*.05;
        close(c.chamber.position.y-halfHeight,c.piston.position.y+.031);
        close(c.chamber.position.y+halfHeight,c.lip.position.y);
        assert.ok(halfHeight>0);
      }
    }
    const cachedAngle=rig.lastAngle;
    assert.equal(setEngineStrokeDisplay(vehicle,false),false);
    assert.ok(rig.cylinders.every(c=>!c.indicator.visible));close(rig.lastAngle,cachedAngle);
  }finally{disposeVehicle(vehicle);}
});
