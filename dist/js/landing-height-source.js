import {DEFAULTS} from './physics.js?v=20261119-ai158';
import {vehiclePhysics,vehicleProfile} from './vehicle-profiles.js?v=20261118-city151';

// Both the report and the interactive study use the fitted Roadster rig. A
// different displayed vehicle, current tank contents or city mode cannot
// change the starting state of this controlled comparison.
export function roadsterHeightStudySource(geometry,settings={}){
  if(!geometry||!Number.isFinite(geometry.liftZ))throw new Error('로드스터 차체를 불러온 뒤 실험을 다시 열어 주세요.');
  const profile=vehicleProfile('roadster');
  const {targetSpeed=.5,springK=75000,damperC=6000,brakeHeight=1.5}=settings;
  return {vehicleId:profile.id,vehicleTitle:profile.title,parameters:vehiclePhysics(profile,geometry,DEFAULTS),
    config:{height:20,ballastKg:0,targetSpeed,springK,damperC,brakeHeight},hoverSeconds:1};
}
