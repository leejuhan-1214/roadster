import {HARDWARE_PARAMS} from './reference-hardware.js?v=20261115-calibrated1';
// Ten outlets retain the visual layout. Flow is limited by the documented valve.
export const ROCKET_PROFILE_ID='rocket10';
export const ROCKET_LIFT_LAYOUT=Object.freeze({x:1.05,y:-.39,z:.84});
export const ROCKET_PARAMS=Object.freeze({
  ...HARDWARE_PARAMS,propulsionProfile:ROCKET_PROFILE_ID,
  liftX:1.05,liftY:-.39,liftZ:.84,boostX:-2.12,boostY:-.12,boostZ:.57,
  yawX:2.00,yawY:-.08,yawZ:.90,
});
const entry=(name,group,position,direction,area)=>Object.freeze({name,group,
  position:Object.freeze(position),direction:Object.freeze(direction),area});
export function rocketThrusterLayout(params={}){
  const p={...ROCKET_PARAMS,...params};
  return [
  ...[p.liftX,-p.liftX].flatMap(x=>[-p.liftZ,p.liftZ].map(z=>entry(`${x>0?'전':'후'}${z<0?'좌':'우'} 하부 자세 제어`,'lift',[x,p.liftY,z],[0,1,0],Number(p.liftNozzleArea)||.00035))),
  ...[-1,-1/3,1/3,1].map((fraction,i)=>entry(`후방 주추진 ${i+1}`,'boost',[p.boostX,p.boostY,p.boostZ*fraction],[1,0,0],p.boostNozzleArea)),
  entry('전방 우측 자세 제어','yaw+',[p.yawX,p.yawY,p.yawZ],[0,0,-1],p.yawNozzleArea),
  entry('전방 좌측 자세 제어','yaw-',[p.yawX,p.yawY,-p.yawZ],[0,0,1],p.yawNozzleArea),
];
}
export const ROCKET_THRUSTERS=Object.freeze(rocketThrusterLayout());
// Read old serialized laboratory fixtures without exposing the removed model.
export const isRocketProfile=params=>[ROCKET_PROFILE_ID,'rocket2026'].includes(params?.propulsionProfile);
