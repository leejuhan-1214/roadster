import {dragConstant,freeDrop} from './landing-aerodynamics.js?v=20261119-air161';
// Physics interpretation is separate from rendering. Every value here is
// derived from fixed-step measurements, never from a display-frame estimate.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const measured=result=>['landed','unsettled'].includes(result?.status)&&finite(result.touchdownSpeed);

/** Reaction-envelope points aligned to first contact. The contact origin
 * fixes the last airborne force at zero even when the next bin holds a large
 * impulse. Older traces did not save peak timestamps; keep their bin labels
 * and restrict a bin straddling contact to the loaded part of the interval.
 */
export function landingReactionTrace(result){
  const points=[];
  if(!finite(result?.touchdownTime))return points;
  let crossed=false;
  for(const sample of result.samples||[]){
    if(!finite(sample.time)||!finite(sample.equivalentGroundForceN))continue;
    const hasPeakTime=finite(sample.equivalentGroundForcePeakTime);
    let time=(hasPeakTime?sample.equivalentGroundForcePeakTime:sample.time)-result.touchdownTime;
    const forceKN=sample.equivalentGroundForceN/1000;
    if(!hasPeakTime&&forceKN>0)time=Math.max(0,time);
    if(!crossed&&time>=0){
      points.push({time:0,forceKN:0});crossed=true;
      if(time===0&&forceKN===0)continue;
    }
    points.push({time,forceKN});
  }
  return points;
}

/** A settled body is not necessarily a successful controlled landing. Use the
 * recorded precontact speed and the user's target, not a rounded display or
 * the economy planner's feasibility prediction. */
export function landingTargetMet(result={}){
  return finite(result.targetSpeed)&&result.targetSpeed>0&&finite(result.touchdownSpeed)&&
    result.touchdownSpeed>=0&&result.touchdownSpeed<=result.targetSpeed+1e-9;
}

/** Analytic free fall is a validation baseline, not a target for powered runs.
 * The crossing velocity comes from the local integrated trajectory. Compare
 * against an independent closed-form release-to-contact prediction.
 */
export function landingTheory(result={}){
  const g=result.parameters?.gravity;
  const hasDrag=result.parameters?.aeroEnabled===true;
  const k=hasDrag?dragConstant(result.parameters)/result.initialMass:0;
  const exact=finite(g)&&g>0&&finite(k)&&finite(result.height)&&result.height>=0?freeDrop(result.height,g,k):null;
  const expectedSpeed=exact?.speed??null,expectedFallTime=exact?.time??null;
  let reason='';
  if(result.method!=='free'||result.manualLiftUsed)reason='추력·수동 분사 실험은 자유낙하 검증 대상이 아닙니다.';
  else if(!measured(result))reason='첫 접촉 측정이 완료되어야 비교할 수 있습니다.';
  else if(result.freeFallConditionsValid!==true||!finite(result.gasUsed)||Math.abs(result.gasUsed)>1e-9)
    reason='무추력·일정 질량·일정 중력 조건을 확인할 수 없습니다.';
  else if(expectedSpeed===null)reason='높이와 중력 조건을 확인할 수 없습니다.';
  const eligible=!reason;
  const measuredSpeed=measured(result)?result.touchdownSpeed:null;
  const absoluteError=eligible?Math.abs(measuredSpeed-expectedSpeed):null;
  return {eligible,reason,hasDrag,expectedSpeed,expectedFallTime,measuredSpeed,absoluteError,
    relativeErrorPercent:eligible&&expectedSpeed>0?absoluteError/expectedSpeed*100:null};
}

/** Release -> final measured state, upward positive. Ground impulse includes
 * continuous suspension/skid forces and discrete ground corrections. The
 * first-contact impulse and the plot's maxima are deliberately not used here.
 * Exhaust changes the system mass and carries momentum, so the simple fixed-
 * mass identity is intentionally unavailable for all thrust-controlled trials.
 */
export function landingImpulseAudit(result={}){
  let reason='';
  if(result.method!=='free'||result.manualLiftUsed)reason='기체 배출 실험에는 고정 질량 충격량 검산을 적용하지 않습니다.';
  else if(!measured(result))reason='완료된 낙하 측정이 필요합니다.';
  else if(result.constantMassAuditValid!==true||!finite(result.initialMass)||!finite(result.finalMass)||
    Math.abs(result.finalMass-result.initialMass)>1e-9||!finite(result.gasUsed)||Math.abs(result.gasUsed)>1e-9)
    reason='일정 질량과 중력·항력·지면 반력 조건을 확인할 수 없습니다.';
  else if((result.parameters?.aeroEnabled&&!finite(result.totalAirDragImpulseNs))||![result.totalGroundImpulseNs,result.totalGravityImpulseNs,result.finalVelocityY,result.elapsed].every(finite))
    reason='동일 시간 구간의 계측값이 없습니다.';
  const eligible=!reason;
  const groundImpulseNs=eligible?result.totalGroundImpulseNs:null;
  const gravityImpulseNs=eligible?result.totalGravityImpulseNs:null;
  const dragImpulseNs=eligible?(result.totalAirDragImpulseNs??0):null;
  const netImpulseNs=eligible?groundImpulseNs+gravityImpulseNs+dragImpulseNs:null;
  const momentumChangeNs=eligible?result.initialMass*result.finalVelocityY:null;
  const residualNs=eligible?netImpulseNs-momentumChangeNs:null;
  // Δp approaches zero after settling. Normalize by the larger opposing
  // impulse, not by this tiny difference, to avoid a misleading huge percent.
  const scale=eligible?Math.max(Math.abs(groundImpulseNs),Math.abs(gravityImpulseNs),Math.abs(momentumChangeNs)):0;
  return {eligible,reason,groundImpulseNs,gravityImpulseNs,dragImpulseNs,netImpulseNs,momentumChangeNs,residualNs,
    relativeResidualPercent:eligible&&scale>0?Math.abs(residualNs)/scale*100:null,
    duration:eligible?result.elapsed:null};
}

const MATCH_KEYS=Object.freeze(['groupId','vehicleId','height','targetSpeed','springK','damperC',
  'initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature']);
const hasConditions=result=>!!result?.groupId&&!!result?.vehicleId&&MATCH_KEYS.slice(2).every(key=>finite(result[key]));

export function sameLandingModel(a,b){
  // Older ordinary trials used the 2 ms solver with no added ballast.
  return a.parameters?.aeroEnabled===b.parameters?.aeroEnabled&&a.parameters?.verticalDragArea===b.parameters?.verticalDragArea&&
    a.parameters?.airDensity===b.parameters?.airDensity&&a.modelVersion===b.modelVersion&&(a.physicsStep??.002)===(b.physicsStep??.002)&&
    (a.ballastKg??0)===(b.ballastKg??0);
}

/** Match a single vehicle, batch and controlled initial conditions. Invalid
 * contact results may be plotted, but cannot be Pareto candidates. This does
 * not supply a universal optimum or combine unlike vehicle masses.
 */
export function landingTradeoff(results=[],reference=results[0]){
  if(!hasConditions(reference))return {rows:[],eligible:[],candidates:[],excluded:[]};
  const rows=results.filter(result=>hasConditions(result)&&sameLandingModel(result,reference)&&MATCH_KEYS.every(key=>result[key]===reference[key]));
  const eligible=rows.filter(result=>result.status==='landed'&&result.settled===true&&!result.bodyStrike&&
    !result.bottomedOut&&!result.manualLiftUsed&&landingTargetMet(result)&&
    finite(result.gasUsed)&&result.gasUsed>=0&&finite(result.peakEquivalentGroundForceN)&&result.peakEquivalentGroundForceN>0);
  const candidates=eligible.filter(candidate=>!eligible.some(other=>other!==candidate&&
    other.gasUsed<=candidate.gasUsed&&other.peakEquivalentGroundForceN<=candidate.peakEquivalentGroundForceN&&
    (other.gasUsed<candidate.gasUsed||other.peakEquivalentGroundForceN<candidate.peakEquivalentGroundForceN)));
  return {rows,eligible,candidates,excluded:rows.filter(result=>!eligible.includes(result))};
}
