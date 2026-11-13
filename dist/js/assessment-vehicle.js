import * as THREE from 'three';
import {disposeVehicle} from './real-vehicle-model.js?v=20261114-air1';

export const LANDING_APPARATUS=Object.freeze(['tank','suspension','thrusters']);
// Keep the reference exterior, tires and the apparatus that acts during landing.
// The removed drive display is independent of the shared rigid-body solver.
export function prepareAssessmentVehicle(vehicle){
  if(vehicle.assessmentOnly)return vehicle;
  const removed=new THREE.Group();
  for(const entry of vehicle.catalog||[]){
    if(entry.kind!=='hypothesis'||LANDING_APPARATUS.includes(entry.id))continue;
    const part=vehicle.parts.get(entry.id);if(part)removed.add(part);
    vehicle.parts.delete(entry.id);vehicle.detailParts.delete(entry.id);
  }
  vehicle.catalog=vehicle.catalog.filter(e=>e.kind!=='hypothesis'||LANDING_APPARATUS.includes(e.id));
  // Keep the air-system diagram for structure/city inspection. Controlled
  // landing trials disable suction/recharge in physics, not by deleting parts.
  const thrusters=vehicle.catalog.find(e=>e.id==='thrusters');
  if(thrusters)thrusters.title='추진기·흡입 팬 · 가정 장치';
  vehicle.wing=null;vehicle.battery=null;vehicle.driveRotors=[];
  disposeVehicle({root:removed},vehicle.root);
  vehicle.assessmentOnly=true;return vehicle;
}
