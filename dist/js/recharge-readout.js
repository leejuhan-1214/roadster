import {estimateRecharge} from './air-systems.js?v=20261115-fleet1';

export function formatRechargeTime(seconds){
  if(!Number.isFinite(seconds))return '계산 불가';
  const total=Math.max(0,Math.ceil(seconds)),minutes=Math.floor(total/60),rest=total%60;
  return minutes?`${minutes}분 ${rest}초`:`${rest}초`;
}

// The estimate advances a copy of the same thermodynamic state. It is refreshed
// at most once per two simulation seconds, never for every render/solver step.
export class RechargeReadout {
  constructor(estimate=estimateRecharge){this.estimate=estimate;this.reset();}
  reset(){this.sampleTime=-Infinity;this.key='';this.cached=null;}
  update(state,params,{enabled=false,capacityKg,powerBudgetW=Infinity,status='charging'}={}){
    if(!enabled){this.reset();return null;}
    const targetFraction=params.compressorTargetFraction??.99,targetKg=capacityKg*targetFraction;
    if(state.gas>=targetKg-1e-10)return {seconds:0,text:'운용 충전 완료 · '+Math.round(targetFraction*100)+'%',reason:'ready'};
    const wait={moving:'정차 후 충전',airborne:'지상에 착지한 뒤 충전',thrusters:'분사 종료 후 충전',battery:'배터리 부족'};
    if(wait[status]){this.reset();return {seconds:null,text:wait[status],reason:status};}
    const key=[capacityKg,powerBudgetW,params.tankVolume,params.tankPressureMPa,params.compressorPowerKW,params.compressorMaxFlowKgS,params.compressorEfficiency,params.activeTankCoolingWPerK,params.activeTankCoolingMaxKW,targetFraction].join('|');
    if(!this.cached||this.key!==key||state.time<this.sampleTime||state.time-this.sampleTime>=2){
      this.cached=this.estimate(state,params,{capacityKg,powerBudgetW,targetFraction});this.sampleTime=state.time;this.key=key;
    }
    const estimate=this.cached,seconds=Number.isFinite(estimate.seconds)?Math.max(0,estimate.seconds-(state.time-this.sampleTime)):null;
    const text=estimate.reason==='battery'?'완충까지 배터리 부족':seconds!==null?`${Math.round(targetFraction*100)}%까지 약 ${formatRechargeTime(seconds)}`:'충전 조건 확인';
    return {...estimate,seconds,text};
  }
}
