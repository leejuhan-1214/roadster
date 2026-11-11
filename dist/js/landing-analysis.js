// Physics interpretation is separate from rendering. Every value here is
// derived from fixed-step measurements, never from a display-frame estimate.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const measured=result=>['landed','unsettled'].includes(result?.status)&&finite(result.touchdownSpeed);

/** Analytic free fall is a validation baseline, not a target for powered runs.
 * Contact velocity is sampled just before the first 2 ms contact step, so its
 * small integration/contact-localization error should remain visible.
 */
export function landingTheory(result={}){
  const g=result.parameters?.gravity;
  const expectedSpeed=finite(g)&&g>0&&finite(result.height)&&result.height>=0?Math.sqrt(2*g*result.height):null;
  const expectedFallTime=expectedSpeed!==null?expectedSpeed/g:null;
  let reason='';
  if(result.method!=='free'||result.manualLiftUsed)reason='추력·수동 분사 실험은 자유낙하 검증 대상이 아닙니다.';
  else if(!measured(result))reason='첫 접촉 측정이 완료되어야 비교할 수 있습니다.';
  else if(result.freeFallConditionsValid!==true||!finite(result.gasUsed)||Math.abs(result.gasUsed)>1e-9)
    reason='무추력·일정 질량·일정 중력 조건을 확인할 수 없습니다.';
  else if(expectedSpeed===null)reason='높이와 중력 조건을 확인할 수 없습니다.';
  const eligible=!reason;
  const measuredSpeed=measured(result)?result.touchdownSpeed:null;
  const absoluteError=eligible?Math.abs(measuredSpeed-expectedSpeed):null;
  return {eligible,reason,expectedSpeed,expectedFallTime,measuredSpeed,absoluteError,
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
    reason='일정 질량과 중력·지면 반력만 작용하는 조건을 확인할 수 없습니다.';
  else if(![result.totalGroundImpulseNs,result.totalGravityImpulseNs,result.finalVelocityY,result.elapsed].every(finite))
    reason='동일 시간 구간의 계측값이 없습니다.';
  const eligible=!reason;
  const groundImpulseNs=eligible?result.totalGroundImpulseNs:null;
  const gravityImpulseNs=eligible?result.totalGravityImpulseNs:null;
  const netImpulseNs=eligible?groundImpulseNs+gravityImpulseNs:null;
  const momentumChangeNs=eligible?result.initialMass*result.finalVelocityY:null;
  const residualNs=eligible?netImpulseNs-momentumChangeNs:null;
  // Δp approaches zero after settling. Normalize by the larger opposing
  // impulse, not by this tiny difference, to avoid a misleading huge percent.
  const scale=eligible?Math.max(Math.abs(groundImpulseNs),Math.abs(gravityImpulseNs),Math.abs(momentumChangeNs)):0;
  return {eligible,reason,groundImpulseNs,gravityImpulseNs,netImpulseNs,momentumChangeNs,residualNs,
    relativeResidualPercent:eligible&&scale>0?Math.abs(residualNs)/scale*100:null,
    duration:eligible?result.elapsed:null};
}

const MATCH_KEYS=Object.freeze(['groupId','vehicleId','height','targetSpeed','springK','damperC',
  'initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature']);
const hasConditions=result=>!!result?.groupId&&!!result?.vehicleId&&MATCH_KEYS.slice(2).every(key=>finite(result[key]));

/** Match a single vehicle, batch and controlled initial conditions. Invalid
 * contact results may be plotted, but cannot be Pareto candidates. This does
 * not supply a universal optimum or combine unlike vehicle masses.
 */
export function landingTradeoff(results=[],reference=results[0]){
  if(!hasConditions(reference))return {rows:[],eligible:[],candidates:[],excluded:[]};
  const rows=results.filter(result=>hasConditions(result)&&MATCH_KEYS.every(key=>result[key]===reference[key]));
  const eligible=rows.filter(result=>result.status==='landed'&&result.settled===true&&!result.bodyStrike&&
    !result.bottomedOut&&!result.manualLiftUsed&&finite(result.touchdownSpeed)&&
    finite(result.gasUsed)&&result.gasUsed>=0&&finite(result.peakEquivalentGroundForceN)&&result.peakEquivalentGroundForceN>0);
  const candidates=eligible.filter(candidate=>!eligible.some(other=>other!==candidate&&
    other.gasUsed<=candidate.gasUsed&&other.peakEquivalentGroundForceN<=candidate.peakEquivalentGroundForceN&&
    (other.gasUsed<candidate.gasUsed||other.peakEquivalentGroundForceN<candidate.peakEquivalentGroundForceN)));
  return {rows,eligible,candidates,excluded:rows.filter(result=>!eligible.includes(result))};
}
