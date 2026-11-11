import {experimentMass} from './experiment-vehicles.js?v=20261111-cockpit1';
const METHODS = {free:'자유 낙하',brake:'지면 전 추력 제동',gentle:'완만한 하강 제어'};
const COLORS = ['#a2f5db','#ffbe78','#8bbfff','#ef9ed4','#dfdc7d','#b5a0ff'];
const html = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (value,digits=2) => Number.isFinite(value)?value.toFixed(digits):'—';
const heightNumber = value => Number.isFinite(value)?String(Number(value.toPrecision(10))):'—';
const csvCell = value => '"'+String(value??'').replace(/"/g,'""')+'"';
const isLanded = result => result.status==='landed'&&result.settled!==false&&Number.isFinite(result.touchdownSpeed);
const label = result => result.vehicleTitle||result.title||result.vehicleId||'차체';
const methodLabel = result => (result.manualLiftUsed?'수동 Space · ':'')+(METHODS[result.method]||result.method)+(result.method==='brake'?' · '+heightNumber(result.brakeHeight)+' m':'');
export const LANDING_HISTORY_LIMIT=78;

/** Compare only the same vehicle, release, rig and initial tank conditions.
 * An untreated baseline may hit its chassis: that does not erase its measured
 * impact. Failed/unmeasured trials cannot become a baseline or improvement.
 */
export function landingBaselineComparison(result,results){
  const measured=item=>['landed','unsettled'].includes(item.status)&&Number.isFinite(item.touchdownSpeed)&&Number.isFinite(item.peakEquivalentGroundForceN)&&item.peakEquivalentGroundForceN>0;
  if(result.manualLiftUsed||!measured(result))return null;
  const keys=['groupId','vehicleId','height','springK','damperC','initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature'];
  if(!result.groupId||!result.vehicleId||keys.slice(2).some(key=>!Number.isFinite(result[key])))return null;
  const baseline=results.find(item=>item.method==='free'&&!item.manualLiftUsed&&measured(item)&&keys.every(key=>item[key]===result[key]));
  if(!baseline)return null;
  return {baseline,reductionPercent:100*(1-result.peakEquivalentGroundForceN/baseline.peakEquivalentGroundForceN)};
}

// Never evict the first rows of an active comparison. Remove complete
// older groups together so every retained comparison remains reviewable.
export function retainLandingGroups(results,currentGroup,limit=LANDING_HISTORY_LIMIT){
  const groups=[...new Set(results.map(result=>result.groupId))];
  for(const group of groups){
    if(results.length<=limit)break;
    if(group===currentGroup)continue;
    for(let i=results.length-1;i>=0;i--)if(results[i].groupId===group)results.splice(i,1);
  }
  return results;
}

function download(name,rows){
  const text='\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export class LandingUI {
  constructor({onStart,onCompareVehicles,onCompareMethods,onCompareFleetMethods,onCompareBrakeHeights,onStop,vehicles=[]}){
    this.root=document.getElementById('landing-lab');
    this.results=[];this.busy=false;this.selectedGroup=null;this.nextId=1;
    this.root.innerHTML=`<div class="section-label">착지 충격 실험</div>
      <form id="landing-settings" class="landing-settings">
        <label>출발 높이 <span>바퀴 아래 · m</span><input id="landing-height" name="height" type="number" min="0" step="any" value="3" required></label>
        <label>착지 방식<select id="landing-method" name="method"><option value="free">자유 낙하</option><option value="brake">지면 전 추력 제동</option><option value="gentle">완만한 하강 제어</option></select></label>
        <div class="landing-control-pair">
          <label>제동 시작 <span>m</span><input id="landing-brake-height" name="brakeHeight" type="number" min="0" step="any" value="1.5" required></label>
          <label>목표 하강속도 <span>m/s</span><input id="landing-target-speed" name="targetSpeed" type="number" min="0.2" max="2" step="0.1" value="0.5" required></label>
        </div>
        <details class="landing-suspension"><summary>서스펜션 조정 · 바퀴별</summary><div class="landing-control-pair">
          <label>스프링 <span>kN/m</span><input id="landing-spring" name="springK" type="number" min="30" max="150" step="5" value="75" required></label>
          <label>감쇠 <span>kN·s/m</span><input id="landing-damper" name="damperC" type="number" min="1" max="15" step="0.5" value="6" required></label>
        </div></details>
        <p class="landing-note">평탄면·무풍·초속도 0·공기저항 OFF<br>공통 가상 서스펜션·추진계</p>
        <button id="landing-start" class="primary-btn" type="submit">현재 차체 실험 <span>↓</span></button>
        <details class="landing-fleet" open><summary>비교할 5종 · 초기 총질량</summary><div class="landing-fleet-list">${vehicles.map(v=>'<label><input type="checkbox" name="vehicleId" value="'+html(v.id)+'" checked><span>'+html(v.short)+(experimentMass(v).assumed?' <em>가정</em>':'')+'</span><strong>'+Math.round(experimentMass(v).total).toLocaleString('ko-KR')+' kg</strong></label>').join('')}</div></details>
        <div class="landing-batch-buttons"><button id="landing-vehicles" type="button">선택 차체 비교</button><button id="landing-methods" type="button">착지 3방식 비교</button></div>
        <button id="landing-brake-heights" class="landing-sweep-button" type="button">제동 높이 비교 <span>5단계 · 기준 포함 6회</span></button>
        <button id="landing-fleet-methods" class="primary-btn" type="button">실험 5종 × 3방식 <span>${vehicles.length*3}회</span></button>
      </form>
      <div class="landing-run-footer"><p id="landing-status" role="status" aria-live="polite">높이와 착지 방식을 선택하세요.</p><button id="landing-stop" type="button" hidden>중단</button></div>
      <button id="landing-results" class="text-btn" type="button" disabled>비교 결과 <span id="landing-result-count">0회</span></button>
      <p class="landing-note">비교마다 초기 탱크 조건을 통일합니다.</p>`;
    this.form=this.root.querySelector('form');this.status=this.root.querySelector('#landing-status');
    this.form.addEventListener('input',event=>{
      event.target.setCustomValidity?.('');
      if(event.target.id==='landing-height')this.root.querySelector('#landing-brake-heights span').textContent=Number(event.target.value)>0?'5단계 · 기준 포함 6회':'0 m · 기준 포함 2회';
    });
    this.form.addEventListener('submit',event=>{event.preventDefault();if(!this.busy&&this.checkValidity())onStart(this.readOptions());});
    this.root.querySelector('#landing-vehicles').addEventListener('click',()=>{if(!this.busy&&this.checkValidity()){if(this.readOptions().vehicleIds.length<2){this.setProgress('비교할 차체를 2개 이상 선택하세요.');return;}onCompareVehicles(this.readOptions());}});
    this.root.querySelector('#landing-methods').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareMethods(this.readOptions());});
    this.root.querySelector('#landing-fleet-methods').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareFleetMethods(this.readOptions());});
    this.root.querySelector('#landing-brake-heights').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareBrakeHeights?.(this.readOptions());});
    this.root.querySelector('#landing-stop').addEventListener('click',()=>onStop());
    this.root.querySelector('#landing-results').addEventListener('click',()=>this.showResults());
    this.dialog=document.createElement('dialog');this.dialog.id='landing-results-dialog';this.dialog.className='landing-results-dialog';
    this.dialog.setAttribute('aria-labelledby','landing-results-heading');
    this.dialog.innerHTML=`<div class="modal-top"><h2 id="landing-results-heading">착지 비교 결과</h2><button class="icon-btn" id="landing-results-close" aria-label="착지 결과 닫기">×</button></div>
      <div class="landing-results-toolbar"><label for="landing-result-group">실험 묶음 <select id="landing-result-group"></select></label><span id="landing-group-conditions"></span></div>
      <p id="landing-best" class="landing-best"></p>
      <div class="landing-table-wrap" tabindex="0" aria-label="착지 결과 표 · 좌우 스크롤"><table class="landing-table"><thead><tr><th scope="col">차체 / 방식</th><th scope="col">높이<br>m</th><th scope="col">초기 질량<br>kg</th><th scope="col">최대 등가반력<br>kN · 2 ms</th><th scope="col">자유낙하 대비<br>반력 변화</th><th scope="col">접촉 최대 하중<br>g</th><th scope="col">첫 접촉 속도<br>m/s</th><th scope="col">기체 사용<br>kg</th><th scope="col">착지 상태</th></tr></thead><tbody id="landing-result-rows"></tbody></table></div>
      <details class="landing-metrics-details"><summary>접촉시간·충격량·압축·반발 비교</summary><div class="landing-table-wrap" tabindex="0" aria-label="착지 세부 계측 표 · 좌우 스크롤"><table class="landing-table"><thead><tr><th scope="col">차체 / 방식</th><th scope="col">첫 접촉→첫 수직 정지<br>ms</th><th scope="col">첫 감속 지면 충격량<br>kN·s</th><th scope="col">최대 압축<br>cm</th><th scope="col">최대 반발 높이<br>cm</th></tr></thead><tbody id="landing-metric-rows"></tbody></table></div><p class="landing-result-note">충격량은 첫 접촉부터 첫 수직 정지까지 지면 반력을 2 ms 간격으로 적분한 값입니다. 중력·분사력이 함께 작용하므로 차체의 전체 운동량 변화와 같지 않습니다. 반발은 접촉 후 관찰 구간의 최대 바퀴 높이입니다.</p></details>
      <div class="landing-chart-heading"><h3>첫 접촉 전후 등가반력</h3><label id="landing-chart-selector" hidden>그래프 차체 <select id="landing-chart-vehicle" aria-label="그래프 차체"></select></label><span id="landing-chart-range">0 s = 각 실험의 첫 접촉</span></div><div id="landing-force-chart" class="landing-force-chart"></div><div id="landing-chart-legend" class="landing-chart-legend"></div>
      <p class="landing-result-note">접촉 보정 충격량을 2 ms로 나눈 등가력 포함. 최대값은 2 ms 기준, 그래프는 10 ms 구간 최댓값입니다. 하중 1 g는 정지 지지 상태입니다. 실차 안전성 평가가 아닌 가정 모델 비교입니다.</p>
      <div class="landing-results-actions"><button id="landing-export-summary">전체 결과 CSV</button><button id="landing-export-traces">전체 시간기록 CSV</button><button id="landing-clear-results">기록 지우기</button></div>`;
    document.body.append(this.dialog);
    this.dialog.querySelector('#landing-results-close').addEventListener('click',()=>this.dialog.close());
    this.dialog.querySelector('#landing-result-group').addEventListener('change',event=>{this.selectedGroup=event.target.value;this.renderResults();});
    this.dialog.querySelector('#landing-chart-vehicle').addEventListener('change',event=>{this.chartVehicle=event.target.value;this.renderResults();});
    this.dialog.querySelector('#landing-export-summary').addEventListener('click',()=>this.exportSummary());
    this.dialog.querySelector('#landing-export-traces').addEventListener('click',()=>this.exportTraces());
    this.dialog.querySelector('#landing-clear-results').addEventListener('click',()=>this.clearResults());
  }

  checkValidity(){
    this.form.querySelectorAll('input[type="number"]').forEach(input=>input.setCustomValidity(Number.isFinite(Number(input.value))?'':'유한한 숫자를 입력하세요.'));
    return this.form.reportValidity();
  }

  readOptions(){
    const data=new FormData(this.form);
    return {height:Number(data.get('height')),method:data.get('method'),brakeHeight:Number(data.get('brakeHeight')),targetSpeed:Number(data.get('targetSpeed')),springK:Number(data.get('springK'))*1000,damperC:Number(data.get('damperC'))*1000,vehicleIds:data.getAll('vehicleId')};
  }
  setBusy(busy,message){
    this.busy=busy;
    this.form.querySelectorAll('input,select,button').forEach(element=>element.disabled=busy);
    this.root.querySelector('#landing-stop').hidden=!busy;
    this.root.querySelector('#landing-results').disabled=busy||!this.results.length;
    if(message)this.setProgress(message);
    if(busy&&this.dialog.open)this.dialog.close();
  }
  setProgress(message){this.status.textContent=message;}
  addResult(result){
    const id=result.id??'landing-'+this.nextId++;
    const saved={...result,id,groupId:String(result.groupId??id),samples:(result.samples||[]).map(sample=>({...sample}))};
    this.results.push(saved);retainLandingGroups(this.results,saved.groupId);
    this.selectedGroup=saved.groupId;
    this.root.querySelector('#landing-result-count').textContent=this.results.length+'회';
    this.root.querySelector('#landing-results').disabled=this.busy;
    this.renderResults();
  }
  clearResults(){
    this.results.length=0;this.selectedGroup=null;this.root.querySelector('#landing-result-count').textContent='0회';
    this.root.querySelector('#landing-results').disabled=true;this.dialog.close();this.setProgress('비교 기록을 지웠습니다.');
  }
  showResults(){if(this.results.length&&!this.busy){this.renderResults();if(!this.dialog.open)this.dialog.showModal();}}

  renderResults(){
    const groups=[...new Set(this.results.map(result=>result.groupId))].reverse();
    if(this.selectedGroup!=='__all__'&&!groups.includes(this.selectedGroup))this.selectedGroup=groups[0];
    const allHistory=this.selectedGroup==='__all__';
    const select=this.dialog.querySelector('#landing-result-group');
    select.innerHTML='<option value="__all__">전체 기록 · '+this.results.length+'회</option>'+groups.map((group,index)=>{const rows=this.results.filter(result=>result.groupId===group);const first=rows[0];return '<option value="'+html(group)+'">'+html((groups.length-index)+' · '+heightNumber(first.height)+' m · '+rows.length+'회')+'</option>';}).join('');
    select.value=this.selectedGroup;
    const rows=allHistory?this.results:this.results.filter(result=>result.groupId===this.selectedGroup);
    if(!rows.length)return;
    const first=rows[0];
    this.dialog.querySelector('#landing-group-conditions').textContent=allHistory?'전체 '+rows.length+'회 · 각 행의 조건을 비교하세요.':'동일 높이 '+heightNumber(first.height)+' m · 스프링 '+number(first.springK/1000,0)+' kN/m · 감쇠 '+number(first.damperC/1000,1)+' kN·s/m · 탱크 '+number(first.tankVolume*1000,0)+' L'+(first.groupKind==='brake-heights'?' · 제동 시작 높이만 변경':'');
    const complete=!allHistory&&rows.length>1&&rows.length>=Math.max(...rows.map(result=>result.groupSize||1));
    const valid=rows.filter(result=>isLanded(result)&&!result.manualLiftUsed&&!result.bodyStrike&&!result.bottomedOut);
    const sorted=valid.slice().sort((a,b)=>a.peakEquivalentGroundForceN-b.peakEquivalentGroundForceN);
    const best=sorted[0];
    const bestText=this.dialog.querySelector('#landing-best');
    if(complete&&best){
      const comparison=landingBaselineComparison(best,rows);
      const reduction=comparison&&comparison.baseline!==best?comparison.reductionPercent:null;
      const tied=sorted.filter(result=>Math.abs(result.peakEquivalentGroundForceN-best.peakEquivalentGroundForceN)<1).length>1;
      bestText.textContent='이 묶음의 안정 착지 중 '+(tied?'공동 ':'')+'최소 등가반력: '+label(best)+' · '+methodLabel(best)+' · '+number(best.peakEquivalentGroundForceN/1000)+' kN'+(reduction!==null?' · 자유 낙하보다 '+number(Math.abs(reduction),1)+'% '+(reduction>=0?'감소':'증가'):'')+(valid.length<rows.length?' · 수동 분사·차체 접촉·진동·한계 초과 결과는 최소값 후보에서 제외':'');
    }else bestText.textContent=allHistory?'조건이 다른 전체 기록입니다. 높이·질량·스프링·감쇠를 확인하며 비교하세요. 전체 순위는 매기지 않습니다.':complete?'안정 착지 조건을 충족한 결과가 없어 최소 충격 순위를 매기지 않았습니다.':rows.length===1?'같은 조건으로 다른 차체나 착지 방식을 비교해 보세요.':'비교 실험 진행 중';
    this.dialog.querySelector('#landing-result-rows').innerHTML=rows.map((result,index)=>{
      const landed=isLanded(result),unsettled=result.status==='unsettled'||(result.settled===false&&Number.isFinite(result.touchdownSpeed));
      const status=result.bodyStrike?'차체 접촉'+(unsettled?' · 진동':''):result.bottomedOut?'서스펜션 한계'+(unsettled?' · 진동':''):unsettled?'측정 완료 · 진동 지속':!landed?'미착지':'안정 착지';
      const comparison=landingBaselineComparison(result,rows),reduction=comparison?.reductionPercent;
      const change=comparison?.baseline===result?'기준':Number.isFinite(reduction)?number(Math.abs(reduction),1)+'% '+(reduction>=0?'감소':'증가'):'—';
      return '<tr'+(complete&&best===result?' class="landing-best-row"':'')+'><th scope="row"><i style="background:'+COLORS[index%COLORS.length]+'"></i>'+html(label(result))+'<small>'+html(methodLabel(result))+'</small>'+(result.method!=='free'?'<small>목표 '+number(result.targetSpeed,1)+' m/s</small>':'')+'<small>스프링 '+number(result.springK/1000,0)+' kN/m · 감쇠 '+number(result.damperC/1000,1)+' kN·s/m</small></th><td>'+heightNumber(result.height)+'</td><td>'+number(result.initialMass,0)+'</td><td>'+number(result.peakEquivalentGroundForceN/1000)+'</td><td>'+change+'</td><td>'+number(result.contactPeakG)+'</td><td>'+number(result.touchdownSpeed)+'</td><td>'+number(result.gasUsed)+'</td><td class="'+(status==='안정 착지'?'landing-ok':'landing-warning')+'">'+status+'</td></tr>';
    }).join('');
    this.dialog.querySelector('#landing-metric-rows').innerHTML=rows.map(result=>'<tr><th scope="row">'+html(label(result))+'<small>'+html(methodLabel(result))+'</small></th><td>'+number(Number.isFinite(result.contactDuration)?result.contactDuration*1000:NaN,1)+'</td><td>'+number(Number.isFinite(result.touchdownTime)?result.groundImpulseNs/1000:NaN,3)+'</td><td>'+number(result.maxCompression*100,1)+'</td><td>'+number(Number.isFinite(result.touchdownTime)?result.reboundHeight*100:NaN,1)+'</td></tr>').join('');
    this.renderChart(rows,allHistory);
  }

  renderChart(rows,allHistory=false){
    const vehicleIds=[...new Set(rows.map(result=>result.vehicleId))];
    const multipleMethods=new Set(rows.map(result=>result.method)).size>1;
    const focusVehicle=!allHistory&&vehicleIds.length>1&&multipleMethods;
    const selector=this.dialog.querySelector('#landing-chart-selector');selector.hidden=!focusVehicle;
    if(focusVehicle){
      if(!vehicleIds.includes(this.chartVehicle))this.chartVehicle=vehicleIds[0];
      const select=this.dialog.querySelector('#landing-chart-vehicle');
      select.innerHTML=vehicleIds.map(id=>'<option value="'+html(id)+'">'+html(label(rows.find(result=>result.vehicleId===id)))+'</option>').join('');
      select.value=this.chartVehicle;
    }
    const chartRows=focusVehicle?rows.filter(result=>result.vehicleId===this.chartVehicle):rows;
    const measured=chartRows.filter(result=>Number.isFinite(result.touchdownTime)&&result.samples?.length);
    const plotted=allHistory?measured.slice(-6):measured;
    this.dialog.querySelector('#landing-chart-range').textContent=(allHistory?'최근 접촉 기록 '+plotted.length+'회 · ':focusVehicle?'선택 차체의 3방식 · ':'')+'0 s = 각 실험의 첫 접촉';
    const chart=this.dialog.querySelector('#landing-force-chart');
    const legend=this.dialog.querySelector('#landing-chart-legend');
    if(!plotted.length){chart.innerHTML='<p class="landing-note">첫 접촉 기록이 없습니다.</p>';legend.innerHTML='';return;}
    const tMin=-.2,tMax=1.5,W=900,H=235,pad={left:63,right:20,top:20,bottom:40},width=W-pad.left-pad.right,height=H-pad.top-pad.bottom;
    const value=sample=>Math.max(0,Number(sample.equivalentGroundForceN)||0)/1000;
    const traces=plotted.map(result=>({result,samples:result.samples.filter(sample=>sample.time-result.touchdownTime>=tMin&&sample.time-result.touchdownTime<=tMax)}));
    const rawMax=Math.max(1,...traces.flatMap(trace=>trace.samples.map(value)));
    const yMax=Math.ceil(rawMax/5)*5;
    const x=time=>pad.left+(time-tMin)/(tMax-tMin)*width,y=force=>pad.top+height-force/yMax*height;
    let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="첫 접촉을 0초로 정렬한 등가반력 비교 그래프"><title>첫 접촉 전후 등가반력 · kN</title>';
    for(let i=0;i<=4;i++){const force=yMax*i/4;svg+='<line class="landing-grid" x1="'+pad.left+'" x2="'+(W-pad.right)+'" y1="'+y(force)+'" y2="'+y(force)+'"/><text x="'+(pad.left-10)+'" y="'+(y(force)+4)+'" text-anchor="end">'+number(force,force%1?1:0)+'</text>';}
    for(const time of [0,.5,1,1.5])svg+='<text x="'+x(time)+'" y="'+(H-13)+'" text-anchor="middle">'+number(time,1)+'</text>';
    svg+='<text x="18" y="15">kN</text><text x="'+(W-12)+'" y="'+(H-13)+'">s</text><line class="landing-contact-line" x1="'+x(0)+'" x2="'+x(0)+'" y1="'+pad.top+'" y2="'+(H-pad.bottom)+'"/>';
    traces.forEach(({result,samples})=>{const color=COLORS[rows.indexOf(result)%COLORS.length],points=samples.map(sample=>x(sample.time-result.touchdownTime).toFixed(2)+','+y(value(sample)).toFixed(2)).join(' ');svg+='<polyline fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" points="'+points+'"/>';});
    chart.innerHTML=svg+'</svg>';
    legend.innerHTML=traces.map(({result})=>'<span><i style="background:'+COLORS[rows.indexOf(result)%COLORS.length]+'"></i>'+html(label(result)+' · '+methodLabel(result)+(allHistory?' · k '+number(result.springK/1000,0)+' / c '+number(result.damperC/1000,1):''))+'</span>').join('');
  }

  exportSummary(){
    const keys=['id','groupId','vehicleId','vehicleTitle','method','manualLiftUsed','manualLiftDuration','height','brakeHeight','targetSpeed','springK','damperC','initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature','status','settled','touchdownTime','touchdownSpeed','peakGroundForceN','peakEquivalentGroundForceN','peakG','contactPeakG','groundImpulseNs','totalGroundImpulseNs','correctionImpulseNs','impactCorrectionImpulseNs','contactDuration','maxCompression','bottomedOut','bodyStrike','reboundHeight','gasUsed','elapsed','flightTimeout','precontactSampleInterval'];
    download('landing-results.csv',[['Roadster landing model; SI units; common hypothetical suspension/rig; peak equivalent force averages corrections over 0.002 s; baseline reduction is vehicle-specific within equal release/rig/tank conditions'],[...keys,'free_baseline_id','peak_force_reduction_percent','parameters_json'],...this.results.map(result=>{const comparison=landingBaselineComparison(result,this.results);return [...keys.map(key=>result[key]),comparison?.baseline.id??'',comparison?.reductionPercent??'',JSON.stringify(result.parameters||{})];})]);
  }
  exportTraces(){
    const keys=['time','sampleInterval','clearance','velocity','groundForceN','equivalentGroundForceN','gLoad','thrustN','compression','gasKg','correctionImpulseNs','manualLift'];
    const rows=[['SI units; time since release; high-altitude approach bins may be wider; contact traces retain 0.01 s bin maxima; summary peaks measured at 0.002 s'],['id','groupId','vehicleId','method','height','time_from_touchdown_s',...keys]];
    for(const result of this.results)for(const sample of result.samples||[])rows.push([result.id,result.groupId,result.vehicleId,result.method,result.height,Number.isFinite(result.touchdownTime)?sample.time-result.touchdownTime:'',...keys.map(key=>sample[key])]);
    download('landing-timeseries.csv',rows);
  }
}
