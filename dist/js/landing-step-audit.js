import {LANDING_MODEL_VERSION,LANDING_STEP} from './landing-experiment.js?v=20261118-city151';

export const STEP_AUDIT_MARKUP=`<details id="landing-audit" class="landing-metrics-details">
  <summary>계산 간격 검산 · 2 / 1 / 0.5 ms</summary>
  <label for="landing-audit-trial">검산할 자동 착지 기록</label>
  <select id="landing-audit-trial"></select>
  <div class="landing-results-actions">
    <button id="landing-audit-run" type="button">세 간격으로 다시 계산</button>
    <button id="landing-audit-cancel" type="button" hidden>검산 중단</button>
    <button id="landing-audit-export" type="button" disabled>검산 CSV</button>
  </div>
  <p id="landing-audit-status" role="status" aria-live="polite"></p>
  <div id="landing-audit-table" class="landing-table-wrap" tabindex="0" hidden>
    <table class="landing-table"><thead><tr><th scope="col">계산 간격<br>ms</th>
    <th scope="col">첫 접촉 속력<br>m/s</th><th scope="col">첫 감속 지면 충격량<br>kN·s</th>
    <th scope="col">최대 등가반력<br>kN</th></tr></thead><tbody id="landing-audit-rows"></tbody></table>
  </div>
  <p class="landing-result-note">같은 출발 조건과 2 ms 제어 주기로 물리 계산 간격만 바꿉니다. Δ는 각 값에서 0.5 ms 값을 뺀 차이입니다. 등가반력에는 접촉 보정 충격량을 각 계산 간격으로 나눈 항이 포함됩니다.</p>
</details>`;

export function canAuditLanding(row){
  return row?.modelVersion===LANDING_MODEL_VERSION&&!row.manualLiftUsed&&
    ['landed','unsettled'].includes(row.status)&&Number.isFinite(row.touchdownSpeed)&&
    Number.isFinite(row.parameters?.dryMass)&&Number.isFinite(row.config?.height)&&
    (row.method!=='eco'||Number.isFinite(row.ecoPlannedBrakeHeight));
}

export function stepAuditSource(row){
  if(!canAuditLanding(row))throw new Error('저장된 자동 착지 조건이 필요합니다.');
  return {
    id:row.id,vehicleId:row.vehicleId,title:row.vehicleTitle||row.title,modelVersion:row.modelVersion,
    config:{...row.config},parameters:{...row.parameters},
    // The same plan is evaluated at every resolution, without fitting a new
    // nozzle strategy to each individual run.
    plan:row.method==='eco'?{brakeHeight:row.ecoPlannedBrakeHeight,
      minimumCoastTime:row.ecoMinimumCoastTime,coastOnly:row.ecoCoastOnly}:null
  };
}

const difference=(value,reference)=>Number.isFinite(value)&&Number.isFinite(reference)?value-reference:null;

export function stepAuditCSV(source,rows){
  const fine=rows.at(-1),c=source.config,p=source.parameters;
  return [['result_id','model_version','vehicle','method','height_m','ballast_kg','initial_mass_kg','initial_gas_kg',
    'brake_setting_m','target_speed_m_s','spring_N_m','damper_N_s_m','controller_ms','physics_ms','status',
    'touchdown_speed_m_s','first_ground_impulse_N_s','peak_equivalent_reaction_N',
    'speed_delta_vs_0.5ms_m_s','impulse_delta_vs_0.5ms_N_s','peak_delta_vs_0.5ms_N',
    'automatic_command_s','touchdown_s','first_deceleration_end_s','gas_used_kg','release_parameters_json'],
    ...rows.map(r=>[source.id,source.modelVersion,source.vehicleId,c.method,c.height,p.ballastKg??0,r.initialMass,r.initialGas,
      c.brakeHeight,c.targetSpeed,c.springK,c.damperC,LANDING_STEP*1000,r.step*1000,r.status,
      r.speed,r.impulse,r.peak,difference(r.speed,fine.speed),difference(r.impulse,fine.impulse),difference(r.peak,fine.peak),
      r.autoBrakeTime,r.contactTime,r.contactEndTime,r.gasUsed,JSON.stringify(p)])];
}

export class LandingStepAuditPanel{
  constructor(dialog,download){
    const find=name=>dialog.querySelector('#landing-audit-'+name);
    this.select=find('trial');this.run=find('run');this.stop=find('cancel');this.export=find('export');
    this.status=find('status');this.table=find('table');this.body=find('rows');
    this.records=[];this.rows=null;this.worker=null;this.source=null;
    this.select.addEventListener('change',()=>this.clear());
    this.run.addEventListener('click',()=>this.start());
    this.stop.addEventListener('click',()=>this.cancel());
    this.export.addEventListener('click',()=>{
      if(this.rows)download('landing-timestep-audit.csv',stepAuditCSV(this.source,this.rows));
    });
    dialog.addEventListener('close',()=>this.cancel());
  }
  setRecords(records,label){
    const eligible=records.filter(canAuditLanding);
    if(eligible.length===this.records.length&&eligible.every((r,i)=>r===this.records[i])&&this.initialized)return;
    this.initialized=true;
    const previous=this.select.value;
    this.records=eligible;
    this.select.replaceChildren(...eligible.map(r=>new Option(label(r),String(r.id))));
    if(eligible.some(r=>String(r.id)===previous))this.select.value=previous;
    if(!previous||this.select.value!==previous||!eligible.length)this.clear();
  }
  clear(){
    this.cancel();this.rows=null;this.source=null;this.body.replaceChildren();
    this.table.hidden=true;this.export.disabled=true;
    this.select.disabled=this.run.disabled=!this.records.length;
    this.status.textContent=this.records.length?'':'검산하려면 현재 모델로 수동 분사 없이 착지를 완료하세요.';
  }
  cancel(){
    if(!this.worker)return;
    this.worker.terminate();this.worker=null;
    this.run.disabled=false;this.stop.hidden=true;
    this.status.textContent='검산을 중단했습니다.';
  }
  start(){
    const row=this.records.find(r=>String(r.id)===this.select.value);
    if(!row||this.worker)return;
    this.clear();
    try{
      this.source=stepAuditSource(row);
      const worker=new Worker(new URL('./landing-step-worker.js?v=20261118-model154',import.meta.url),{type:'module'});
      this.worker=worker;this.run.disabled=true;this.stop.hidden=false;
      this.status.textContent='저장한 출발 조건을 준비하는 중…';
      const finish=message=>{
        worker.terminate();this.worker=null;this.run.disabled=false;this.stop.hidden=true;
        this.status.textContent=message;
      };
      worker.onmessage=({data})=>{
        if(this.worker!==worker)return;
        if(data.error){finish('검산 오류 · '+data.error);return;}
        if(!data.rows){this.status.textContent=(data.step*1000)+' ms 계산 중…';return;}
        this.rows=data.rows;this.draw();this.export.disabled=false;
        finish('세 간격 검산 완료');
      };
      worker.onerror=event=>{
        if(this.worker===worker){event.preventDefault();finish('검산을 실행하지 못했습니다. 다시 시도해 주세요.');}
      };
      worker.postMessage(this.source);
    }catch(error){
      this.cancel();this.status.textContent='검산 오류 · '+error.message;
    }
  }
  draw(){
    const fine=this.rows.at(-1);
    const cell=(v,ref,scale,digits)=>{
      const delta=difference(v,ref);
      if(!Number.isFinite(v))return '<td>—</td>';
      const rounded=delta===null?null:Number((delta/scale).toFixed(digits));
      const d=rounded===null?'—':(rounded>0?'+':'')+rounded.toFixed(digits);
      return '<td>'+ (v/scale).toFixed(digits)+'<small>Δ '+d+'</small></td>';
    };
    this.body.innerHTML=this.rows.map(r=>'<tr><th scope="row">'+(r.step*1000)+'</th>'+
      cell(r.speed,fine.speed,1,5)+cell(r.impulse,fine.impulse,1000,4)+cell(r.peak,fine.peak,1000,3)+'</tr>').join('');
    this.table.hidden=false;
  }
}
