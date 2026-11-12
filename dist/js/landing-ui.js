import {experimentMass} from './experiment-vehicles.js?v=20261111-cockpit1';
import {landingTheory,landingImpulseAudit,landingTradeoff} from './landing-analysis.js?v=20261111-calibration1';
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

/** Trial identity, not filtered position, owns the color across every chart.
 * Older in-memory rows without an id still have deterministic condition keys. */
export function landingResultColor(result={}){
  const identity=String(result.id??[result.groupId,result.vehicleId,result.method,result.height,result.brakeHeight,result.targetSpeed,result.springK,result.damperC,result.initialMass,result.initialGas].join('|'));
  let hash=0;for(let i=0;i<identity.length;i++)hash=(Math.imul(hash,31)+identity.charCodeAt(i))|0;
  return COLORS[(hash>>>0)%COLORS.length];
}

/** Each point is a measured trial. The x axis is never a categorical rank. */
export function landingResearchPlot(rows,{kind='gas',candidates=[],baseline=null}={}){
  const points=rows.filter(row=>Number.isFinite(row.peakEquivalentGroundForceN)&&Number.isFinite(row.touchdownSpeed)&&(kind!=='height'||row.method==='brake'))
    .map(row=>({row,x:kind==='height'?row.brakeHeight:row.gasUsed,y:row.peakEquivalentGroundForceN/1000}))
    .filter(point=>Number.isFinite(point.x)&&point.x>=0&&Number.isFinite(point.y)&&point.y>=0);
  if(!points.length)return '<p class="landing-note">'+(kind==='height'?'제동 높이 비교를 실행하면 측정 지점이 표시됩니다.':'첫 접촉을 측정한 결과가 없습니다.')+'</p>';
  const W=600,H=285,pad={left:75,right:25,top:30,bottom:57},width=W-pad.left-pad.right,height=H-pad.top-pad.bottom;
  const xMax=Math.min(Number.MAX_VALUE,Math.max(.1,...points.map(point=>point.x))*1.12);
  const baselineForce=kind==='height'&&Number.isFinite(baseline?.peakEquivalentGroundForceN)?baseline.peakEquivalentGroundForceN/1000:0;
  const yMax=Math.min(Number.MAX_VALUE,Math.max(1,baselineForce,...points.map(point=>point.y))*1.12);
  const x=value=>pad.left+value/xMax*width,y=value=>pad.top+height-value/yMax*height;
  const tick=value=>Math.abs(value)>=10000?value.toExponential(1):number(value,value>=100?0:value>=10?1:2);
  const title=kind==='height'?'제동 시작 높이와 최대 등가반력':'기체 사용량과 최대 등가반력';
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+title+'"><title>'+title+'</title><desc>가로축 '+(kind==='height'?'제동 시작 높이, 미터':'기체 사용량, 킬로그램')+'; 세로축 최대 등가반력, 킬로뉴턴. 원은 안정 착지, 엑스는 조건 미충족, 바깥 원은 충격과 기체 소비의 절충 후보입니다.</desc>';
  for(let i=0;i<=4;i++){
    const vx=xMax*i/4,vy=yMax*i/4;
    svg+='<line class="landing-grid" x1="'+pad.left+'" x2="'+(W-pad.right)+'" y1="'+y(vy)+'" y2="'+y(vy)+'"/><text x="'+(pad.left-12)+'" y="'+(y(vy)+4)+'" text-anchor="end">'+tick(vy)+'</text><text x="'+x(vx)+'" y="'+(H-31)+'" text-anchor="middle">'+tick(vx)+'</text>';
  }
  svg+='<text x="'+pad.left+'" y="15">최대 등가반력 · kN</text><text x="'+(pad.left+width/2)+'" y="'+(H-7)+'" text-anchor="middle">'+(kind==='height'?'제동 시작 높이 · m':'기체 사용량 · kg')+'</text>';
  if(baselineForce>0)svg+='<line class="landing-baseline-line" x1="'+pad.left+'" x2="'+(W-pad.right)+'" y1="'+y(baselineForce)+'" y2="'+y(baselineForce)+'"/><text class="landing-baseline-label" x="'+(W-pad.right-4)+'" y="'+(y(baselineForce)-6)+'" text-anchor="end">자유낙하 기준 '+number(baselineForce,1)+' kN</text>';
  points.forEach(({row,x:vx,y:vy},index)=>{
    const px=x(vx),py=y(vy),valid=isLanded(row)&&!row.bodyStrike&&!row.bottomedOut&&!row.manualLiftUsed,color=landingResultColor(row);
    const state=row.manualLiftUsed?'수동 분사':row.bodyStrike?'차체 접촉':row.bottomedOut?'서스펜션 한계':!isLanded(row)?'안정 조건 미충족':'안정 착지';
    const detail=label(row)+'; 출발 '+heightNumber(row.height)+' m; '+methodLabel(row)+'; '+(kind==='height'?heightNumber(vx)+' m':number(vx,2)+' kg')+'; '+number(vy,2)+' kN; '+state;
    svg+='<g class="landing-research-point" tabindex="0" role="img" aria-label="'+html(detail)+'"><title>'+html(detail)+'</title>';
    if(candidates.includes(row))svg+='<circle cx="'+px+'" cy="'+py+'" r="11" fill="none" stroke="'+color+'" stroke-width="2"/>';
    svg+=valid?'<circle cx="'+px+'" cy="'+py+'" r="5.5" fill="'+color+'"/>':'<path d="M '+(px-6)+' '+(py-6)+' L '+(px+6)+' '+(py+6)+' M '+(px+6)+' '+(py-6)+' L '+(px-6)+' '+(py+6)+'" stroke="'+color+'" stroke-width="3"/>';
    const labelY=py>H-pad.bottom-30?py-17-(index%2)*18:py+25;
    svg+='<text x="'+px+'" y="'+labelY+'" text-anchor="middle">'+html(row.method==='free'?'자유':row.method==='gentle'?'완만':heightNumber(row.brakeHeight)+' m')+'</text></g>';
  });
  return svg+'</svg>';
}

/** A fixed-height run starts with no vertical kinetic energy. Compare the
 * precontact vertical energy, not energy of the exhaust or vehicle occupants. */
export function landingResearchCards(rows){
  const baseline=rows.find(row=>landingTheory(row).eligible),theory=baseline?landingTheory(baseline):null;
  const audit=baseline?landingImpulseAudit(baseline):null;
  const theoryCard=theory?'<span class="landing-research-eyebrow">자유낙하 검산 · v = √(2gh)</span><strong>'+number(theory.expectedSpeed,3)+' <small>m/s 이론</small></strong><p>측정 '+number(theory.measuredSpeed,3)+' m/s · '+(Number.isFinite(theory.relativeErrorPercent)?'상대 오차 '+number(theory.relativeErrorPercent,2)+'%':'절대 차이 '+number(theory.absoluteError,3)+' m/s')+'</p>':'<span class="landing-research-eyebrow">자유낙하 검산 · v = √(2gh)</span><strong>기준 실험 필요</strong><p>같은 조건의 자유낙하를 포함해 비교하세요.</p>';
  const impulseCard=audit?.eligible?'<span class="landing-research-eyebrow">충격량 검산 · ∫(N − mg)dt = Δp</span><strong>'+number(audit.netImpulseNs/1000,3)+' <small>kN·s 알짜 충격량</small></strong><p>지면 +'+number(audit.groundImpulseNs/1000,2)+' / 중력 '+number(audit.gravityImpulseNs/1000,2)+' kN·s<br>운동량 변화 '+number(audit.momentumChangeNs/1000,3)+' kN·s<br>잔차 '+number(audit.residualNs,2)+' N·s · 전체 '+number(audit.duration,3)+' s</p>':'<span class="landing-research-eyebrow">충격량과 운동량</span><strong>지면 반력 ≠ 알짜힘</strong><p>고정질량 자유낙하 기준에서 중력을 포함해 검산합니다.</p>';
  const energies=rows.filter(row=>Number.isFinite(row.touchdownKineticEnergyJ)&&Number.isFinite(row.touchdownMass));
  const energyCard='<span class="landing-research-eyebrow">접촉 직전 · Kᵧ = ½mᶜvᵧ²</span>'+(energies.length?'<strong>'+number(Math.min(...energies.map(row=>row.touchdownKineticEnergyJ))/1000,2)+'–'+number(Math.max(...energies.map(row=>row.touchdownKineticEnergyJ))/1000,2)+' <small>kJ</small></strong><p>접촉 직전 질량과 수직 속도로 계산<br>각 실험의 값은 아래 상세 표와 CSV에 기록</p>':'<strong>접촉 전 에너지</strong><p>접촉 직전 질량과 수직 속도로 계산합니다.</p>');
  return '<article>'+theoryCard+'</article><article>'+impulseCard+'</article><article>'+energyCard+'</article>';
}

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
  constructor({onStart,onCompareVehicles,onCompareMethods,onCompareFleetMethods,onCompareBrakeHeights,onStop,onConfigure,vehicles=[]}){
    this.root=document.getElementById('landing-lab');
    this.results=[];this.busy=false;this.selectedGroup=null;this.nextId=1;
    this.root.innerHTML=`
      <form id="landing-settings" class="landing-settings">
        <div class="landing-primary-settings">
          <label>출발 높이 <span>m</span><input id="landing-height" name="height" type="number" min="0" step="any" value="3" required title="실험을 시작할 때 바퀴 아래 높이"></label>
          <label>착지 방식<select id="landing-method" name="method"><option value="free">자유 낙하</option><option value="brake">추력 제동</option><option value="gentle">완만한 하강</option></select></label>
        </div>
        <button id="landing-start" class="primary-btn" type="submit">실험 시작 <span>↓</span></button>
        <button id="landing-methods" class="landing-compare-button" type="button">현재 차체 · 3방식 비교</button>
        <details id="landing-advanced" class="landing-settings-details"><summary>제동 · 서스펜션</summary><div class="landing-detail-content">
          <div class="landing-control-pair"><label>제동 시작 <span>m</span><input id="landing-brake-height" name="brakeHeight" type="number" min="0" step="any" value="1.5" required></label><label>목표 하강속도 <span>m/s</span><input id="landing-target-speed" name="targetSpeed" type="number" min="0.2" max="2" step="0.1" value="0.5" required></label></div>
          <div class="landing-control-pair"><label>스프링 <span>kN/m · 바퀴별</span><input id="landing-spring" name="springK" type="number" min="30" max="150" step="5" value="75" required></label><label>감쇠 <span>kN·s/m · 바퀴별</span><input id="landing-damper" name="damperC" type="number" min="1" max="15" step="0.5" value="6" required></label></div>
          <button id="landing-study-preset" type="button" class="landing-preset-button">기본 3 m 조건으로</button>
        </div></details>
        <details class="landing-settings-details landing-more-comparisons"><summary>차체 · 제동 높이 비교</summary><div class="landing-detail-content">
          <div class="landing-fleet-list">${vehicles.map(v=>'<label><input type="checkbox" name="vehicleId" value="'+html(v.id)+'" checked><span>'+html(v.short)+(experimentMass(v).assumed?' <em>가정</em>':'')+'</span><strong>'+Math.round(experimentMass(v).total).toLocaleString('ko-KR')+' kg</strong></label>').join('')}</div>
          <button id="landing-vehicles" class="landing-compare-button" type="button">선택 차체 비교</button>
          <button id="landing-fleet-methods" class="landing-compare-button" type="button">전체 5종 × 3방식 <span>${vehicles.length*3}회</span></button>
          <button id="landing-brake-heights" class="landing-sweep-button" type="button">제동 높이 비교 <span>6회</span></button>
        </div></details>
        <details class="landing-study-guide"><summary>실험 조건 · 물리 개념</summary><p>같은 높이·초기 탱크 조건에서 비교합니다. 평탄면·무풍·초속도 0·공기저항 OFF, 공통 가상 서스펜션·추진계를 사용합니다.</p><ol><li>같은 차체로 <b>3방식</b>을 비교합니다.</li><li><b>제동 높이 비교</b>로 분사 시작만 바꿉니다.</li><li>안정 착지 중 충격과 기체 소비의 절충점을 찾습니다.</li></ol><p>통제: 출발 높이·초기 속도·탱크·스프링·감쇠. 차종 비교에서는 질량과 구조가 함께 바뀝니다.</p><p><b>v = √(2gh)</b> 낙하 속도<br><b>∫F알짜 dt = Δp</b> 충격량<br><b>N휠 ≈ max(0, kx + cẋ)</b> 바퀴별 반력</p><p>x는 양의 압축량, ẋ는 압축 속도입니다. 식은 선형 구간의 근사이며 22 cm 초과에서는 범프 스톱이 추가됩니다.</p></details>
      </form>
      <div class="landing-run-footer"><p id="landing-status" role="status" aria-live="polite">실험 준비</p><button id="landing-stop" type="button" hidden>중단</button></div>
      <button id="landing-results" class="text-btn" type="button" disabled>결과 보기 <span id="landing-result-count">0회</span></button>`;
    this.form=this.root.querySelector('form');this.status=this.root.querySelector('#landing-status');
    this.root.querySelector('#landing-study-preset').addEventListener('click',()=>{
      if(this.busy)return;
      for(const [name,value]of Object.entries({height:3,method:'free',brakeHeight:1.5,targetSpeed:.5,springK:75,damperC:6})){
        const input=this.form.elements.namedItem(name);input.value=String(value);input.setCustomValidity?.('');
      }
      this.root.querySelector('#landing-brake-heights span').textContent='6회';
      this.setProgress('3 m 조건 준비');
    });
    this.form.addEventListener('input',event=>{
      event.target.setCustomValidity?.('');
      if(event.target.id==='landing-height')this.root.querySelector('#landing-brake-heights span').textContent=Number(event.target.value)>0?'6회':'2회';
    });
    this.form.elements.namedItem('method').addEventListener('change',event=>{if(event.target.value!=='free')this.root.querySelector('#landing-advanced').open=true;});
    this.form.addEventListener('submit',event=>{event.preventDefault();if(!this.busy&&this.checkValidity())onStart(this.readOptions());});
    this.root.querySelector('#landing-vehicles').addEventListener('click',()=>{if(!this.busy&&this.checkValidity()){if(this.readOptions().vehicleIds.length<2){this.setProgress('비교할 차체를 2개 이상 선택하세요.');return;}onCompareVehicles(this.readOptions());}});
    this.root.querySelector('#landing-methods').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareMethods(this.readOptions());});
    this.root.querySelector('#landing-fleet-methods').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareFleetMethods(this.readOptions());});
    this.root.querySelector('#landing-brake-heights').addEventListener('click',()=>{if(!this.busy&&this.checkValidity())onCompareBrakeHeights?.(this.readOptions());});
    this.root.querySelector('#landing-stop').addEventListener('click',()=>onStop());
    this.root.querySelector('#landing-results').addEventListener('click',()=>this.showResults());
    this.dialog=document.createElement('dialog');this.dialog.id='landing-results-dialog';this.dialog.className='landing-results-dialog';
    this.dialog.setAttribute('aria-labelledby','landing-results-heading');
    this.dialog.innerHTML=`<div class="modal-top"><h2 id="landing-results-heading">착지 비교 결과</h2><div class="landing-result-header-actions"><button id="landing-configure" class="landing-configure-button">조건 바꾸기</button><button class="icon-btn" id="landing-results-close" aria-label="착지 결과 닫기">×</button></div></div>
      <div class="landing-results-toolbar"><label for="landing-result-group">실험 묶음 <select id="landing-result-group"></select></label><span id="landing-group-conditions"></span></div>
      <p id="landing-best" class="landing-best"></p>
      <details class="landing-analysis-details"><summary>물리 분석 · 제동 높이</summary><section class="landing-research" aria-label="이론 검증과 제동 조건 탐구"><div class="landing-research-heading"><h3>물리 검증 · 충격과 기체 소비</h3><label id="landing-research-vehicle-label" hidden>분석 차체 <select id="landing-research-vehicle" aria-label="분석할 차체"></select></label></div><p id="landing-research-scope" class="landing-result-note"></p><div id="landing-research-cards" class="landing-research-cards"></div><div id="landing-research-view-controls" class="landing-research-view-controls"><label><input id="landing-stable-zoom" type="checkbox">안정 착지만 확대</label><span id="landing-zoom-note"></span></div><div id="landing-research-plots" class="landing-research-plots"><section><h4>제동 시작 높이 → 최대 등가반력</h4><div id="landing-height-chart" class="landing-research-chart"></div></section><section><h4>기체 소비 ↔ 최대 등가반력</h4><div id="landing-gas-chart" class="landing-research-chart"></div></section></div><p id="landing-tradeoff" class="landing-tradeoff"></p><details class="landing-research-explanation"><summary>그래프와 검산 읽는 법</summary><p>○ 안정 착지 · × 수동 분사/차체 접촉/한계 초과/진동 · ◎ 절충 후보. 절충 후보는 다른 안정 결과가 충격과 기체 소비를 동시에 줄일 수 없는 측정 조건입니다. 측정한 범위의 후보이며 하나의 보편적 최적값을 뜻하지 않습니다.</p><p>자유낙하 속도 검산은 무풍·공기저항 없음·초속도 0 조건입니다. 충격량 검산은 <b>자유낙하 전체 측정 구간</b>의 지면 반력(접촉 보정 포함)과 중력을 적분해 같은 구간의 운동량 변화와 비교합니다. 분사 중에는 질량이 변하므로 이 고정질량 검산을 적용하지 않습니다.</p><p>접촉 직전 수직 운동에너지는 접촉 때 질량을 사용합니다. 분사 기체의 에너지는 포함하지 않으며 전체 에너지 보존 검사가 아닙니다. 차체 파손·탑승자 상해는 계산하지 않습니다.</p></details></section></details>
      <div class="landing-table-wrap" tabindex="0" aria-label="착지 결과 표 · 좌우 스크롤"><table class="landing-table"><thead><tr><th scope="col">차체 / 방식</th><th scope="col">높이<br>m</th><th scope="col">초기 질량<br>kg</th><th scope="col">최대 등가반력<br>kN · 2 ms</th><th scope="col">자유낙하 대비<br>반력 변화</th><th scope="col">접촉 최대 하중<br>g</th><th scope="col">첫 접촉 속도<br>m/s</th><th scope="col">기체 사용<br>kg</th><th scope="col">착지 상태</th></tr></thead><tbody id="landing-result-rows"></tbody></table></div>
      <details class="landing-metrics-details"><summary>접촉 질량·에너지·충격량·압축 비교</summary><div class="landing-table-wrap" tabindex="0" aria-label="착지 세부 계측 표 · 좌우 스크롤"><table class="landing-table"><thead><tr><th scope="col">차체 / 방식</th><th scope="col">접촉 직전 질량<br>kg</th><th scope="col">접촉 직전 수직 K<br>kJ</th><th scope="col">첫 접촉→첫 감속 종료<br>ms · 2 ms 해상도</th><th scope="col">감속 종료 수직 속도<br>m/s</th><th scope="col">첫 감속 지면 충격량<br>kN·s</th><th scope="col">최대 압축<br>cm</th><th scope="col">최대 반발 높이<br>cm</th></tr></thead><tbody id="landing-metric-rows"></tbody></table></div><p class="landing-result-note">충격량과 감속 시간은 같은 2 ms 끝점까지 측정합니다. 감속 종료는 |수직 속도| &lt; 0.01 m/s 또는 첫 반발이 검출된 표본이며, 정확히 속도 0인 해석적 순간은 아닙니다. 종료 속도는 위쪽이 양수입니다. 중력·분사력이 함께 작용하므로 차체의 전체 운동량 변화와 같지 않습니다. 반발은 접촉 후 관찰 구간의 최대 바퀴 높이입니다.</p></details>
      <div class="landing-chart-heading"><h3>첫 접촉 전후 등가반력</h3><label id="landing-chart-selector" hidden>그래프 차체 <select id="landing-chart-vehicle" aria-label="그래프 차체"></select></label><span id="landing-chart-range">0 s = 각 실험의 첫 접촉</span></div><div id="landing-force-chart" class="landing-force-chart"></div><div id="landing-chart-legend" class="landing-chart-legend"></div>
      <details class="landing-reading-note"><summary>측정값 읽는 법</summary><p class="landing-result-note">접촉 보정 충격량을 2 ms로 나눈 등가력 포함. 최대값은 2 ms 기준, 그래프는 10 ms 구간 최댓값입니다. 하중 1 g는 정지 지지 상태입니다. 실차 안전성 평가가 아닌 가정 모델 비교입니다.</p></details>
      <div class="landing-results-actions"><button id="landing-export-summary">전체 결과 CSV</button><button id="landing-export-traces">전체 시간기록 CSV</button><button id="landing-export-graphs">현재 그래프 SVG</button><button id="landing-clear-results">기록 지우기</button></div>`;
    document.body.append(this.dialog);
    this.dialog.querySelector('#landing-results-close').addEventListener('click',()=>this.dialog.close());
    this.dialog.querySelector('#landing-configure').addEventListener('click',()=>{
      this.dialog.close();
      if(onConfigure)onConfigure();else document.getElementById('left-panel')?.classList.add('open');
      this.form.elements.namedItem('height')?.focus({preventScroll:true});
    });
    this.dialog.querySelector('#landing-result-group').addEventListener('change',event=>{this.selectedGroup=event.target.value;this.renderResults();});
    this.dialog.querySelector('#landing-chart-vehicle').addEventListener('change',event=>{this.chartVehicle=event.target.value;this.renderResults();});
    this.dialog.querySelector('#landing-research-vehicle').addEventListener('change',event=>{this.researchVehicle=event.target.value;this.renderResults();});
    this.dialog.querySelector('#landing-stable-zoom').addEventListener('change',event=>{this.stableZoom=event.target.checked;this.renderResults();});
    this.dialog.querySelector('#landing-export-summary').addEventListener('click',()=>this.exportSummary());
    this.dialog.querySelector('#landing-export-traces').addEventListener('click',()=>this.exportTraces());
    this.dialog.querySelector('#landing-export-graphs').addEventListener('click',()=>this.exportGraphs());
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
    const sameVehicle=new Set(rows.map(result=>result.vehicleId)).size===1;
    const best=sameVehicle?sorted[0]:null;
    const bestText=this.dialog.querySelector('#landing-best');
    bestText.hidden=rows.length<2;
    if(complete&&best){
      const comparison=landingBaselineComparison(best,rows);
      const reduction=comparison&&comparison.baseline!==best?comparison.reductionPercent:null;
      const tied=sorted.filter(result=>Math.abs(result.peakEquivalentGroundForceN-best.peakEquivalentGroundForceN)<1).length>1;
      bestText.textContent='이 묶음의 안정 착지 중 '+(tied?'공동 ':'')+'최소 등가반력: '+label(best)+' · '+methodLabel(best)+' · '+number(best.peakEquivalentGroundForceN/1000)+' kN'+(reduction!==null?' · 자유 낙하보다 '+number(Math.abs(reduction),1)+'% '+(reduction>=0?'감소':'증가'):'')+(valid.length<rows.length?' · 수동 분사·차체 접촉·진동·한계 초과 결과는 최소값 후보에서 제외':'');
    }else bestText.textContent=allHistory?'조건이 다른 전체 기록입니다. 높이·질량·스프링·감쇠를 확인하며 비교하세요. 전체 순위는 매기지 않습니다.':complete&&!sameVehicle?'차종마다 질량·크기·관성이 함께 달라집니다. 분석 차체를 선택해 같은 차체의 착지 방식을 비교하세요.':complete?'안정 착지 조건을 충족한 결과가 없어 최소 충격 순위를 매기지 않았습니다.':rows.length===1?'':'비교 실험 진행 중';
    this.dialog.querySelector('#landing-result-rows').innerHTML=rows.map((result,index)=>{
      const landed=isLanded(result),unsettled=result.status==='unsettled'||(result.settled===false&&Number.isFinite(result.touchdownSpeed));
      const status=result.bodyStrike?'차체 접촉'+(unsettled?' · 진동':''):result.bottomedOut?'서스펜션 한계'+(unsettled?' · 진동':''):unsettled?'측정 완료 · 진동 지속':!landed?'미착지':'안정 착지';
      const comparison=landingBaselineComparison(result,rows),reduction=comparison?.reductionPercent;
      const change=comparison?.baseline===result?'기준':Number.isFinite(reduction)?number(Math.abs(reduction),1)+'% '+(reduction>=0?'감소':'증가'):'—';
      return '<tr'+(complete&&best===result?' class="landing-best-row"':'')+'><th scope="row"><i style="background:'+landingResultColor(result)+'"></i>'+html(label(result))+'<small>'+html(methodLabel(result))+'</small>'+(result.method!=='free'?'<small>목표 '+number(result.targetSpeed,1)+' m/s</small>':'')+'<small>스프링 '+number(result.springK/1000,0)+' kN/m · 감쇠 '+number(result.damperC/1000,1)+' kN·s/m</small></th><td>'+heightNumber(result.height)+'</td><td>'+number(result.initialMass,0)+'</td><td>'+number(result.peakEquivalentGroundForceN/1000)+'</td><td>'+change+'</td><td>'+number(result.contactPeakG)+'</td><td>'+number(result.touchdownSpeed)+'</td><td>'+number(result.gasUsed)+'</td><td class="'+(status==='안정 착지'?'landing-ok':'landing-warning')+'">'+status+'</td></tr>';
    }).join('');
    this.dialog.querySelector('#landing-metric-rows').innerHTML=rows.map(result=>'<tr><th scope="row">'+html(label(result))+'<small>'+html(methodLabel(result))+'</small></th><td>'+number(result.touchdownMass,1)+'</td><td>'+number(Number.isFinite(result.touchdownKineticEnergyJ)?result.touchdownKineticEnergyJ/1000:NaN,3)+'</td><td>'+number(Number.isFinite(result.contactDuration)?result.contactDuration*1000:NaN,1)+'</td><td>'+number(result.contactEndVelocityY,4)+'</td><td>'+number(Number.isFinite(result.touchdownTime)?result.groundImpulseNs/1000:NaN,3)+'</td><td>'+number(result.maxCompression*100,1)+'</td><td>'+number(Number.isFinite(result.touchdownTime)?result.reboundHeight*100:NaN,1)+'</td></tr>').join('');
    this.renderChart(rows,allHistory);
    this.renderResearch?.(rows,allHistory);
  }

  renderResearch(rows,allHistory=false){
    const element=selector=>this.dialog.querySelector(selector),vehicleIds=[...new Set(rows.map(row=>row.vehicleId))];
    element('#landing-research-vehicle-label').hidden=allHistory||vehicleIds.length<2;
    element('#landing-research-cards').hidden=allHistory;
    element('#landing-research-plots').hidden=allHistory;
    element('#landing-research-view-controls').hidden=allHistory;
    if(allHistory){element('#landing-research-scope').textContent='실험 묶음 하나를 선택하면 같은 조건의 결과만 분석합니다.';element('#landing-tradeoff').textContent='';element('#landing-height-chart').innerHTML='';element('#landing-gas-chart').innerHTML='';return;}
    if(!vehicleIds.includes(this.researchVehicle))this.researchVehicle=vehicleIds[0];
    const select=element('#landing-research-vehicle');
    select.innerHTML=vehicleIds.map(id=>'<option value="'+html(id)+'">'+html(label(rows.find(row=>row.vehicleId===id)))+'</option>').join('');select.value=this.researchVehicle;
    const reference=rows.find(row=>row.vehicleId===this.researchVehicle),tradeoff=landingTradeoff(rows,reference),matched=tradeoff.rows;
    const scope=element('#landing-research-scope');
    scope.textContent=label(reference)+' · 같은 높이·초기 질량·탱크·서스펜션·목표 속도 '+matched.length+'회. '+(vehicleIds.length>1?'차종 간 질량 단독 효과는 이 비교로 분리할 수 없습니다.':'분사 시점과 방식에 따른 접촉 속도·반력·기체 소비를 비교하세요.');
    element('#landing-research-cards').innerHTML=landingResearchCards(matched);
    element('#landing-stable-zoom').checked=!!this.stableZoom;
    const plotted=this.stableZoom?tradeoff.eligible:matched;
    const baseline=plotted.find(row=>row.method==='free'&&!row.manualLiftUsed&&Number.isFinite(row.touchdownSpeed));
    element('#landing-zoom-note').textContent=this.stableZoom?'확대: 안정 '+plotted.length+'회 · 조건 미충족 '+(matched.length-plotted.length)+'회는 그래프에서 제외. 표·검산에는 모두 유지.':'전체 조건 표시 · 큰 충격 때문에 차이가 작게 보이면 확대하세요.';
    element('#landing-height-chart').innerHTML=landingResearchPlot(plotted,{kind:'height',candidates:tradeoff.candidates,baseline});
    element('#landing-gas-chart').innerHTML=landingResearchPlot(plotted,{kind:'gas',candidates:tradeoff.candidates});
    const candidates=tradeoff.candidates;
    element('#landing-tradeoff').textContent=candidates.length?'◎ 현재 측정 범위의 절충 후보: '+candidates.map(row=>methodLabel(row)+' ('+number(row.peakEquivalentGroundForceN/1000,2)+' kN / '+number(row.gasUsed,2)+' kg)').join(' · ')+'. 충격을 더 줄이는 대신 필요한 기체량을 함께 판단하세요.':'안정 착지 후보가 없습니다. 차체 접촉·서스펜션 한계·진동 상태를 먼저 확인하세요.';
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
    traces.forEach(({result,samples})=>{const color=landingResultColor(result),points=samples.map(sample=>x(sample.time-result.touchdownTime).toFixed(2)+','+y(value(sample)).toFixed(2)).join(' ');svg+='<polyline fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round" points="'+points+'"/>';});
    chart.innerHTML=svg+'</svg>';
    legend.innerHTML=traces.map(({result})=>'<span><i style="background:'+landingResultColor(result)+'"></i>'+html(label(result)+' · '+methodLabel(result)+(allHistory?' · h '+heightNumber(result.height)+' m · '+number(result.initialMass,0)+' kg · k '+number(result.springK/1000,0)+' / c '+number(result.damperC/1000,1):''))+'</span>').join('');
  }

  exportSummary(){
    const keys=['id','groupId','vehicleId','vehicleTitle','method','manualLiftUsed','manualLiftDuration','height','brakeHeight','targetSpeed','springK','damperC','initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature','status','settled','touchdownTime','touchdownSpeed','touchdownMass','touchdownGasUsed','touchdownKineticEnergyJ','initialPotentialEnergyJ','finalMass','finalVelocityY','freeFallConditionsValid','constantMassAuditValid','peakGroundForceN','peakEquivalentGroundForceN','peakG','contactPeakG','groundImpulseNs','totalGroundImpulseNs','totalGravityImpulseNs','correctionImpulseNs','impactCorrectionImpulseNs','contactDuration','contactEndTime','contactEndVelocityY','maxCompression','bottomedOut','bodyStrike','reboundHeight','gasUsed','elapsed','flightTimeout','precontactSampleInterval'];
    download('landing-results.csv',[['Roadster landing model; SI units; common hypothetical suspension/rig; peak equivalent force averages corrections over 0.002 s; baseline reduction is vehicle-specific; theory and release-to-final impulse audit apply only to untreated constant-mass free fall; touchdown energy is vertical kinetic energy, not occupant injury'],[...keys,'free_baseline_id','peak_force_reduction_percent','theory_expected_speed_m_s','theory_relative_error_percent','impulse_audit_net_N_s','impulse_audit_momentum_change_N_s','impulse_audit_residual_N_s','impulse_audit_duration_s','pareto_candidate_in_same_conditions','parameters_json'],...this.results.map(result=>{const comparison=landingBaselineComparison(result,this.results),theory=landingTheory(result),audit=landingImpulseAudit(result),tradeoff=landingTradeoff(this.results,result);return [...keys.map(key=>result[key]),comparison?.baseline.id??'',comparison?.reductionPercent??'',theory.eligible?theory.expectedSpeed:'',theory.eligible?theory.relativeErrorPercent??'':'',audit.eligible?audit.netImpulseNs:'',audit.eligible?audit.momentumChangeNs:'',audit.eligible?audit.residualNs:'',audit.eligible?audit.duration:'',tradeoff.candidates.includes(result),JSON.stringify(result.parameters||{})];})]);
  }
  exportTraces(){
    const keys=['time','sampleInterval','clearance','velocity','groundForceN','equivalentGroundForceN','gLoad','thrustN','compression','stateCompression','gasKg','massKg','kineticEnergyJ','potentialEnergyJ','springEnergyJ','correctionImpulseNs','manualLift'];
    const rows=[['SI units; time since release; high-altitude approach bins may be wider; contact force traces retain 0.01 s bin maxima and must not be integrated for impulse; summary integrals measured at 0.002 s; compression is the pre-integration force-evaluation value; stateCompression and energies use the same post-step pose; energies are stored state values, not an exhaust-inclusive conservation audit; potential zero is level unloaded tire contact and can be negative under compression; spring energy excludes bump stops'],['id','groupId','vehicleId','method','height','time_from_touchdown_s',...keys]];
    for(const result of this.results)for(const sample of result.samples||[])rows.push([result.id,result.groupId,result.vehicleId,result.method,result.height,Number.isFinite(result.touchdownTime)?sample.time-result.touchdownTime:'',...keys.map(key=>sample[key])]);
    download('landing-timeseries.csv',rows);
  }

  exportGraphs(){
    const charts=[['#landing-height-chart','제동 시작 높이와 최대 등가반력'],['#landing-gas-chart','기체 사용량과 최대 등가반력'],['#landing-force-chart','첫 접촉 전후 등가반력']].map(([selector,title])=>({selector,title,svg:this.dialog.querySelector(selector+' svg')})).filter(chart=>chart.svg);
    if(!charts.length)return;
    const hasResearch=charts.some(chart=>chart.selector!=='#landing-force-chart');
    const vehicle=hasResearch?(this.dialog.querySelector('#landing-research-vehicle')?.selectedOptions?.[0]?.textContent||this.researchVehicle||''):'';
    const zoomNote=hasResearch?this.dialog.querySelector('#landing-zoom-note').textContent:'';
    let top=hasResearch?137:105,body='';
    for(const {selector,title,svg}of charts){
      const dimensions=svg.getAttribute('viewBox').split(/\s+/).map(Number),height=dimensions[3]*900/dimensions[2];
      body+='<text x="25" y="'+top+'" class="chart-title">'+html(title+(selector!=='#landing-force-chart'&&vehicle?' · '+vehicle:''))+'</text><svg x="0" y="'+(top+10)+'" width="900" height="'+height+'" viewBox="'+dimensions.join(' ')+'">'+svg.innerHTML+'</svg>';
      top+=height+60;
    }
    const legend=[...this.dialog.querySelectorAll('#landing-chart-legend span')];
    if(legend.length){body+='<text x="25" y="'+top+'" class="chart-title">시간–반력 그래프 범례</text>';top+=25;}
    for(const [index,item]of legend.entries()){
      const fill=item.querySelector('i')?.style.background||COLORS[index%COLORS.length];
      body+='<circle cx="30" cy="'+(top-4)+'" r="4" fill="'+html(fill)+'"/><text x="45" y="'+top+'">'+html(item.textContent)+'</text>';top+=20;
    }
    const conditions=this.dialog.querySelector('#landing-group-conditions').textContent;
    const source='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="'+(top+25)+'" viewBox="0 0 900 '+(top+25)+'"><style>text{font:12px Arial,sans-serif;fill:#b9cdd5}.chart-title{font-weight:bold;font-size:16px;fill:#e4f5ef}.landing-grid{stroke:#29424e;stroke-width:1}.landing-contact-line,.landing-baseline-line{stroke:#aebfc7;stroke-dasharray:5 5}.landing-baseline-label{fill:#d7c18e}</style><rect width="100%" height="100%" fill="#0c1923"/><text x="25" y="30" class="chart-title">Roadster 착지 실험 · 측정 결과</text><text x="25" y="53">'+html(conditions)+'</text><text x="25" y="75">○ 안정 착지 · × 조건 미충족 · ◎ 충격·기체 소비 절충 후보 · 가정 모델, 2 ms 등가반력</text>'+(hasResearch?'<text x="25" y="99">'+html(zoomNote)+'</text>':'')+body+'</svg>';
    const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download='landing-graphs.svg';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
