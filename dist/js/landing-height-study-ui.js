const finite=Number.isFinite;
const formatters=Array.from({length:5},(_,digits)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:digits}));
const format=(value,digits=2)=>finite(value)?formatters[digits].format(value):'—';
const amount=(value,unit,digits)=>finite(value)?format(value,digits)+' '+unit:'—';
const force=row=>finite(row.peakEquivalentGroundForceN)?row.peakEquivalentGroundForceN/1000:null;
const name=row=>row.method==='eco'?'절약 착지':format(row.brakeHeight,4)+' m';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const targetStates={reached:'목표 도달',already:'명령 때 이미 목표 이내',unreached:'첫 접촉 전 미도달','no-command':'공중 제동 명령 없음','no-contact':'첫 접촉 기록 없음'};
const actualDistance=row=>finite(row.actualDistance)?amount(row.actualDistance,'m',3):targetStates[row.targetState]||'측정값 없음';

function verdict(row){
  if(row.feasible)return '조건 충족';
  if(row.bodyStrike)return '차체 바닥 접촉';
  if(!finite(row.touchdownSpeed))return '첫 접촉 기록 없음';
  if(row.touchdownSpeed>row.targetSpeed)return '접촉 속력 초과';
  if(row.bottomedOut)return '서스펜션 한계';
  return '안정 조건 미충족';
}

function studySummary(rows){
  const fixed=rows.filter(row=>row.method==='brake'),eligible=fixed.filter(row=>row.feasible);
  if(!eligible.length)return '측정한 고정 제동 높이 '+fixed.length+'개 중 착지 조건을 충족한 높이는 없었습니다.';
  const least=eligible.reduce((a,b)=>a.landingGasKg<=b.landingGasKg?a:b);
  return '고정 제동 높이 '+fixed.length+'개 중 '+eligible.length+'개가 착지 조건을 충족했습니다. 그중 착지에 공기를 가장 적게 쓴 설정은 '+name(least)+' ('+amount(least.landingGasKg,'kg')+')입니다.';
}

function linearScale(values,loPixel,hiPixel,zoom){
  const low=zoom?Math.min(...values):0,high=Math.max(...values);
  const spread=Math.max(high-low,Math.abs(high)*.05,.01);
  const min=Math.max(0,low-spread*.07),max=Math.max(high+spread*.07,min+.01);
  return {pixel:v=>loPixel+(hiPixel-loPixel)*(v-min)/(max-min),ticks:Array.from({length:5},(_,i)=>min+(max-min)*i/4)};
}

// A linear scale hides soft landings when chassis strikes are orders of magnitude larger.
// An eligible-only zoom uses the actual feasible range on both axes.
export function heightStudyPlot(rows,selected,zoom=false){
  const points=rows.map((row,i)=>({row,i,x:row.landingGasKg,y:force(row)}))
    .filter(p=>finite(p.x)&&finite(p.y)&&(!zoom||p.row.feasible));
  if(!points.length)return '<p class="height-study-note">표시할 착지 측정값이 없습니다.</p>';
  const left=68,right=451,top=32,bottom=220;
  const xs=linearScale(points.map(p=>p.x),left,right,zoom),ys=points.map(p=>p.y);
  const low=Math.min(...ys),high=Math.max(...ys),log=low>0&&high/low>30;
  let vertical=linearScale(ys,bottom,top,zoom);
  if(log){
    const lo=Math.floor(Math.log10(low)),hi=Math.ceil(Math.log10(high));
    vertical={pixel:v=>bottom+(top-bottom)*(Math.log10(v)-lo)/(hi-lo),ticks:Array.from({length:hi-lo+1},(_,i)=>10**(lo+i))};
  }
  const svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 474 275" role="group" aria-label="착지 공기 소비와 최대 등가반력"><desc>각 점은 한 번의 실험입니다. 아래의 높이 선택에서도 모든 점의 측정값을 읽을 수 있습니다.</desc>'];
  svg.push('<text class="height-study-axis" x="12" y="18">최대 등가반력 (kN'+(log?', 로그 눈금':'')+')</text>');
  for(const tick of vertical.ticks){
    const y=vertical.pixel(tick);
    svg.push(`<line class="height-study-grid" x1="${left}" x2="${right}" y1="${y}" y2="${y}"/><text x="${left-6}" y="${y+4}" text-anchor="end">${format(tick,high<4?2:high<100?1:0)}</text>`);
  }
  for(const tick of xs.ticks)svg.push(`<text x="${xs.pixel(tick)}" y="241" text-anchor="middle">${format(tick,1)}</text>`);
  svg.push('<text class="height-study-axis" x="260" y="265" text-anchor="middle">하강·착지 공기 소비 (kg)</text>');
  const labels=[];
  const marks=points.map(p=>({...p,px:xs.pixel(p.x),py:vertical.pixel(p.y)}));
  const ordered=[...marks].sort((a,b)=>Number(a.i===selected)-Number(b.i===selected));
  ordered.forEach(({row,i,px,py})=>{
    const eco=row.method==='eco',color=eco?'#ffbb78':row.feasible?'#8ae4bd':'#b1bfc9';
    const text=escape([name(row),verdict(row),amount(row.landingGasKg,'kg'),amount(force(row),'kN')].join(' · '));
    svg.push(`<g class="height-study-point" data-height-index="${i}" tabindex="${i===selected?0:-1}" role="button" aria-pressed="${i===selected}" aria-label="${text}"><title>${text}</title><circle cx="${px}" cy="${py}" r="8" fill="transparent" class="height-study-focus"/>`);
    if(i===selected)svg.push(`<circle cx="${px}" cy="${py}" r="9" fill="none" stroke="#f3faf8" stroke-width="1.6"/>`);
    if(eco)svg.push(`<path d="M ${px} ${py-6} l 6 6 -6 6 -6 -6 Z" fill="${color}" stroke="#17232b"/>`);
    else if(row.feasible)svg.push(`<circle cx="${px}" cy="${py}" r="4.8" fill="${color}" stroke="#17232b"/>`);
    else svg.push(`<path d="M ${px-3.8} ${py-3.8} l 7.6 7.6 m 0 -7.6 l -7.6 7.6" fill="none" stroke="${color}" stroke-width="2.2"/>`);
    svg.push('</g>');
  });
  const priority=[...marks].sort((a,b)=>Number(b.i===selected)-Number(a.i===selected)||Number(b.row.method==='eco')-Number(a.row.method==='eco'));
  for(const {row,i,px,py} of priority){
    if(i!==selected&&row.method!=='eco'&&(row.brakeHeight%4!==0||labels.length>=6))continue;
    for(const dy of [-14,23]){
      const tx=Math.max(left+18,Math.min(right-20,px)),ty=Math.max(top+4,Math.min(bottom-3,py+dy));
      if(labels.some(l=>Math.abs(l.x-tx)<54&&Math.abs(l.y-ty)<17))continue;
      labels.push({x:tx,y:ty});
      svg.push(`<text x="${tx}" y="${ty}" text-anchor="middle" pointer-events="none">${escape(name(row))}</text>`);
      break;
    }
  }
  return svg.join('')+'</svg>';
}

const studyMetrics=row=>[
  ['공중 제동 결과',targetStates[row.targetState]||'—'],
  ['목표 속력까지 예측 거리',amount(row.predictedDistance,'m',3)],
  ['목표 속력까지 실측 거리',actualDistance(row)],
  ['첫 접촉 속력',amount(row.touchdownSpeed,'m/s',3)],
  ['최대 등가반력 (2 ms)',amount(force(row),'kN')],
  ['첫 접촉 감속 지면 충격량',amount(finite(row.groundImpulseNs)?row.groundImpulseNs/1000:null,'kN·s',3)],
  ['부양에 쓴 공기',amount(row.hoverGasKg,'kg',3)],
  ['하강·착지에 쓴 공기',amount(row.landingGasKg,'kg',3)],
  ['합계',amount(row.totalGasKg,'kg',3)],
  ['실제 명령 높이',amount(row.autoBrakeHeight,'m',3)],
  ['명령 직전 하강 속력',amount(row.entrySpeed,'m/s',3)],
  ['추력·중력 기준 가속도',amount(row.referenceAcceleration,'m/s²',3)],
  ['명령부터 첫 접촉까지',amount(row.distanceToContact,'m',3)],
  ['추력이 무게를 넘기까지',finite(row.supportDelay)?amount(1000*row.supportDelay,'ms',1):'접촉 전 관측 없음'],
];

export function heightStudyCSV(study){
  const {hover,config,parameters,vehicleId}=study.conditions;
  const fields=['method','brakeHeight','autoBrakeHeight','targetSpeed','entrySpeed','referenceAcceleration','predictedDistance','actualDistance','commandMassKg','kAtCommand','targetState','distanceToContact','supportDelay','touchdownSpeed','peakEquivalentGroundForceN','groundImpulseNs','hoverGasKg','landingGasKg','totalGasKg','feasible','bodyStrike','bottomedOut','status'];
  const headers=['method','brake_setting_m','command_height_m','target_speed_m_s','command_speed_m_s','reference_acceleration_m_s2','predicted_target_distance_m','observed_target_distance_m','command_mass_kg','drag_k_per_m','target_state','command_to_contact_m','support_delay_s','touchdown_speed_m_s','peak_2ms_reaction_N','first_deceleration_ground_impulse_N_s','hover_air_kg','landing_air_kg','total_air_kg','eligible','body_strike','bump_stop','status'];
  const controlFields=['vehicle','height_m','hover_duration_s','start_air_kg','release_air_kg','release_height_m','release_velocity_y_m_s','release_pressure_Pa','release_temperature_K','aero_enabled','air_density_kg_m3','vertical_CdA_m2','config_json','parameters_json'];
  const controls=[vehicleId,config.height,hover.durationS,hover.startGasKg,hover.releaseGasKg,hover.releaseHeightM,hover.releaseVelocityY,hover.releasePressurePa,hover.releaseTemperatureK,parameters.aeroEnabled,parameters.airDensity,parameters.verticalDragArea,JSON.stringify(config),JSON.stringify(parameters)];
  return [[...headers,...controlFields],...study.rows.map(row=>[...fields.map(field=>row[field]??''),...controls])];
}

const markup=`<div class="modal-top"><h2 id="height-study-heading">20 m 부양·제동 높이 실험</h2><button type="button" id="height-study-close" class="icon-btn" aria-label="실험 창 닫기">×</button></div>
  <div class="height-study-body">
    <p id="height-study-conditions">같은 로드스터를 20 m에서 부양한 뒤, 제동 시작 높이와 절약 착지를 비교합니다.</p>
    <div class="height-study-status"><span id="height-study-status" role="status" aria-live="polite"></span><progress id="height-study-progress" aria-label="실험 진행률" hidden></progress><button id="height-study-stop" type="button" hidden>계산 중단</button><button id="height-study-run" type="button" hidden>다시 측정</button></div>
    <div class="height-study-output" id="height-study-results" hidden>
      <p id="height-study-summary" class="height-study-summary"></p>
      <div class="height-study-result-layout">
        <figure class="height-study-plot"><figcaption>공기 소비와 착지 충격</figcaption><div id="height-study-plot"></div>
          <div class="height-study-legend"><span class="height-study-valid">● 조건 충족</span><span class="height-study-invalid">× 조건 미충족</span><span class="height-study-eco">◆ 절약 착지</span></div>
          <label><input id="height-study-zoom" type="checkbox">조건 충족 결과만 확대</label>
          <p class="height-study-note">최대 등가반력은 2 ms 기준입니다. 차체가 바닥에 닿으면 계산 간격에 따라 최대값이 크게 달라질 수 있습니다.</p>
        </figure>
        <section class="height-study-details" aria-label="선택한 실험 상세 측정">
          <label for="height-study-choice">비교할 제동 높이</label><select id="height-study-choice"></select><dl id="height-study-inspect"></dl>
        </section>
      </div>
      <details class="height-study-section"><summary>예측식과 통제 조건</summary>
        <p><b>d = ln[(a₀ + b vᵢ²)/(a₀ + b v목표²)]/(2b)</b>. b = ρ(CdA)/(2m)이며 공기저항을 끄면 d = (vᵢ² − v목표²)/(2a₀)입니다. 명령 순간의 질량과 탱크 상태를 고정하고 밸브가 즉시 열릴 때의 추력에서 중력을 뺀 가속도 a₀를 구합니다(상한 1.1g). 하강 중 위로 작용하는 항력은 감속하면서 줄어듭니다. 이미 목표 속력 이내이면 필요한 거리는 0 m입니다.</p>
        <p>실측 제동 거리는 명령 뒤 하강 속력이 목표까지 처음 줄어든 지점까지의 수직 변위입니다. 목표에 도달하지 못한 경우에는 첫 접촉까지 떨어진 거리와 구분해 표시합니다. 추력 지연은 2 ms 구간의 평균 수직 추력이 무게를 처음 넘을 때까지의 시간입니다.</p>
        <p id="height-study-release"></p>
        <p>고정 제동은 0~20 m에서 1 m 간격으로 측정하고, 인접한 두 높이의 조건 충족 여부가 바뀐 구간을 0.1 m 간격으로 다시 측정합니다. 현재 고정 제동 설정값도 범위 안이면 포함합니다. 목표 접촉 속력 이하로 착지하고 차체 바닥 접촉이나 범프 스톱 개입 없이 안정되면 조건 충족입니다. 절약 착지도 같은 부양 종료 상태에서 출발합니다.</p>
      </details>
      <details class="height-study-section" id="height-study-table"><summary>모든 높이의 측정값</summary>
        <div class="height-study-scroll" tabindex="0" aria-label="높이별 측정 표 · 좌우 스크롤"><table><thead><tr>
          <th scope="col">제동 설정</th><th scope="col">판정</th><th scope="col">부양 (kg)</th><th scope="col">하강·착지 (kg)</th><th scope="col">합계 (kg)</th><th scope="col">등가반력 (kN)</th><th scope="col">접촉 속력 (m/s)</th><th scope="col">예측 거리 (m)</th><th scope="col">실측 거리 (m)</th>
        </tr></thead><tbody id="height-study-rows"></tbody></table></div>
      </details>
      <div class="height-study-links"><button type="button" id="height-study-copy">조건과 선택 결과 복사</button><button type="button" id="height-study-csv">전체 결과 CSV</button><a href="./landing-study-guide.html#height-study" target="_blank" rel="noopener">보고서 가이드</a></div>
      <span role="status" id="height-study-copy-note" hidden></span><textarea id="height-study-copy-text" aria-label="선택 결과 복사용 텍스트" readonly rows="5" hidden></textarea>
    </div>
  </div>`;

function releaseDescription({hover,config,parameters}){
  return '목표 '+amount(config.targetSpeed,'m/s',3)+' · 스프링 '+amount(config.springK/1000,'kN/m')+' · 감쇠 '+amount(config.damperC/1000,'kN·s/m')+' (각 바퀴). '+
    '부양 전 탱크 '+amount(hover.startGasKg,'kg',3)+', 부양 종료 때 탱크 '+amount(hover.releaseGasKg,'kg',3)+
    ', 압력 '+amount(hover.releasePressurePa/1e6,'MPa',3)+', 온도 '+amount(hover.releaseTemperatureK,'K')+
    ', 바퀴 높이 '+amount(hover.releaseHeightM,'m',3)+', 수직 속도 '+amount(hover.releaseVelocityY,'m/s',4)+' (위쪽 +). '+
    '공기저항 '+(parameters.aeroEnabled?'켬 (ρ '+amount(parameters.airDensity,'kg/m³',3)+', 수직 CdA '+amount(parameters.verticalDragArea,'m²',2)+' 가정)':'끔')+' · 무풍. 추가 질량 '+amount(parameters.ballastKg??0,'kg')+'. 부양 소비는 공중에서 높이를 유지한 구간에, 착지 소비는 부양 종료 후 관측이 끝날 때까지 배출한 공기에 해당합니다.';
}

const phaseNames={coarse:'1 m 간격 측정',fine:'0.1 m 간격 측정',eco:'절약 착지 비교'};

export class LandingHeightStudyPanel{
  constructor(getSource,download){
    this.getSource=getSource;this.download=download;this.serial=0;
    this.dialog=document.createElement('dialog');
    this.dialog.id='height-study-dialog';this.dialog.className='height-study-dialog';
    this.dialog.setAttribute('aria-labelledby','height-study-heading');this.dialog.innerHTML=markup;
    document.body.append(this.dialog);
    this.find=id=>this.dialog.querySelector('#height-study-'+id);
    this.find('close').addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('close',()=>{
      // A queued close from the previous opening can arrive after a new trial starts.
      if(!this.dialog.open)this.cancel();
    });
    this.find('stop').addEventListener('click',()=>{this.cancel();this.setStatus('측정을 중단했습니다.',false);});
    this.find('run').addEventListener('click',()=>this.start(false));
    this.find('choice').addEventListener('change',event=>this.select(Number(event.target.value)));
    this.find('zoom').addEventListener('change',()=>{
      if(this.find('zoom').checked&&!this.study.rows[this.selected].feasible)this.selected=this.study.rows.findIndex(row=>row.feasible);
      this.select(this.selected);
    });
    const choose=event=>{
      const point=event.target.closest('[data-height-index]');
      if(!point)return;
      if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
      event.preventDefault();this.select(Number(point.dataset.heightIndex));
      if(event.type==='keydown')this.find('choice').focus();
    };
    this.find('plot').addEventListener('click',choose);
    this.find('plot').addEventListener('keydown',choose);
    this.find('csv').addEventListener('click',()=>this.download('roadster-20m-hover-braking.csv',heightStudyCSV(this.study)));
    this.find('copy').addEventListener('click',()=>this.copySelection());
  }
  open(){
    if(!this.dialog.open)this.dialog.showModal();
    this.dialog.scrollTop=0;this.start(true);
  }
  cancel(){
    this.serial++;this.worker?.terminate();this.worker=null;
  }
  setStatus(message,running){
    this.find('status').textContent=message;
    this.find('progress').hidden=!running;this.find('stop').hidden=!running;this.find('run').hidden=running;
  }
  async start(reuse){
    this.cancel();const serial=this.serial;
    this.find('results').hidden=true;this.find('copy-note').hidden=true;this.find('copy-text').hidden=true;
    this.find('progress').removeAttribute('value');
    this.find('conditions').textContent='같은 로드스터를 20 m에서 부양한 뒤, 제동 시작 높이와 절약 착지를 비교합니다.';
    this.setStatus('공통 부양 상태 준비 중…',true);
    try{
      const source=await this.getSource();
      if(this.serial!==serial)return;
      const key=JSON.stringify(source);
      if(reuse&&this.cacheKey===key&&this.study){this.present(this.study);return;}
      if(typeof Worker==='undefined')throw new Error('이 브라우저에서 백그라운드 계산을 시작할 수 없습니다.');
      const worker=new Worker(new URL('./landing-height-worker.js?v=20261119-air161',import.meta.url),{type:'module'});
      this.worker=worker;
      worker.onerror=event=>{
        if(this.serial!==serial)return;
        event.preventDefault();this.cancel();this.setStatus('계산 파일을 열 수 없습니다. 다시 측정해 주세요.',false);
      };
      worker.onmessage=({data})=>{
        if(this.serial!==serial)return;
        if(data.error){this.cancel();this.setStatus('실험 중단 · '+data.error,false);return;}
        if(data.progress){
          const {phase,done,total}=data.progress,progress=this.find('progress');
          if(total>0&&finite(done)){progress.max=total;progress.value=done;}
          this.setStatus((phaseNames[phase]||'제동 실험')+' · '+done+' / '+total+'회',true);return;
        }
        if(data.study){
          this.cancel();
          try{this.present(data.study);this.cacheKey=key;}
          catch(error){this.study=null;this.cacheKey=null;this.setStatus('결과를 표시하지 못했습니다. '+error.message,false);}
        }
      };
      worker.postMessage(source);
    }catch(error){
      if(this.serial!==serial)return;
      this.cancel();this.setStatus('실험 준비 실패 · '+error.message,false);
    }
  }
  present(study){
    this.study=study;
    const rows=study.rows,c=study.conditions,hover=c.hover,stable=rows.filter(r=>r.feasible);
    if(!rows.length)throw new Error('측정한 조건이 없습니다.');
    const airCondition=c.parameters.aeroEnabled?'무풍 · 공기저항 켬':'공기저항 끔';
    this.find('conditions').textContent='로드스터 · 20 m · '+airCondition+' · 공통 부양 '+amount(hover.durationS,'s')+' · 목표 접촉 속력 '+amount(c.config.targetSpeed,'m/s')+' 이하';
    this.find('release').textContent=releaseDescription(c);
    this.find('summary').textContent=studySummary(rows);
    const ordered=rows.map((row,i)=>({row,i})).sort((a,b)=>Number(a.row.method==='eco')-Number(b.row.method==='eco')||a.row.brakeHeight-b.row.brakeHeight);
    this.find('choice').replaceChildren(...ordered.map(({row,i})=>new Option(name(row)+' · '+verdict(row),String(i))));
    this.find('rows').innerHTML=ordered.map(({row:r})=>'<tr><th scope="row">'+escape(name(r))+'</th>'+
      [verdict(r),format(r.hoverGasKg,3),format(r.landingGasKg,3),format(r.totalGasKg,3),format(force(r)),format(r.touchdownSpeed,3),
       format(r.predictedDistance,3),finite(r.actualDistance)?format(r.actualDistance,3):actualDistance(r)].map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('');
    this.find('zoom').checked=false;this.find('zoom').disabled=!stable.length;
    const best=stable.filter(r=>r.method==='brake').sort((a,b)=>a.landingGasKg-b.landingGasKg)[0]||rows.find(r=>r.method==='eco')||rows[0];
    this.select(rows.indexOf(best));this.setStatus('측정 완료 · '+rows.length+'개 조건',false);
    this.find('results').hidden=false;
  }
  select(index){
    const row=this.study?.rows[index];if(!row)return;
    this.selected=index;this.find('choice').value=String(index);
    if(!row.feasible)this.find('zoom').checked=false;
    this.find('plot').innerHTML=heightStudyPlot(this.study.rows,index,this.find('zoom').checked);
    this.find('inspect').innerHTML=studyMetrics(row).map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+escape(value)+'</dd></div>').join('');
    this.find('copy-text').hidden=true;this.find('copy-note').hidden=true;
  }
  async copySelection(){
    const row=this.study.rows[this.selected],c=this.study.conditions;
    const content=['로드스터 20 m 부양·제동 높이 실험',this.find('conditions').textContent,releaseDescription(c),name(row)+' · '+verdict(row),
      ...studyMetrics(row).map(([label,value])=>label+' '+value)].join('\n');
    const text=this.find('copy-text'),note=this.find('copy-note');
    try{
      await navigator.clipboard.writeText(content);text.hidden=true;note.textContent='조건과 측정값을 복사했습니다.';
    }catch{
      text.value=content;text.hidden=false;text.focus();text.select();note.textContent='선택한 텍스트를 복사하세요.';
    }
    note.hidden=false;
  }
}
