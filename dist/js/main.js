import { PhysicsSim, DEFAULTS, PARAMETER_INFO, runValidation } from './physics.js';
import { FlightScene } from './scene.js';
import { PARTS, LESSONS, SOURCES } from './learning.js';
import { COURSE, createStageRun, updateStageRun } from './stage.js';
import { manualInput } from './controls.js';
import { FLIGHT_PROFILES, DEFAULT_FLIGHT_PROFILE, createGuidedRun, updateGuidedRun, getGuidedInput } from './flight-plan.js';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim = new PhysicsSim();
let scene;
let mode='drive',camera='chase',paused=false,paint='#b51627',showVectors=false;
let previousPause=false,scenario='ground',demo=null,stage=null,lastStamp=0,accumulator=0,lastUI=0,lastSample=0,frames=0,frameTimer=0;
const keys=new Set(),samples=[],trace=[];
let toastTimer;
const STEP=.002;

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
function setPaused(value){paused=value;$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'재생':'일시정지');$('live-label').textContent=paused?'PHYSICS PAUSED':'PHYSICS LIVE';}
function reset(preset='ground',message=true){sim.setObstacles([]);scene?.setStage(null);stage=null;sim.reset(preset);demo=null;$('altHold').checked=false;$('height-setting').classList.remove('show');keys.clear();samples.length=0;trace.length=0;lastSample=0;accumulator=0;scenario=preset;$$('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===preset));if(message)toast(preset==='drop'?'3 m 자유낙하 · 충격과 서스펜션 감쇠를 관찰하세요.':'차량과 탱크를 초기화했습니다.');}
function setMode(next){
  if(next===mode)return;
  const wasInspect=mode==='inspect';mode=next;keys.clear();demo=null;
  if(mode==='inspect'){previousPause=paused;setPaused(true);camera='orbit';}
  else if(wasInspect){setPaused(previousPause);camera='chase';}
  scene.setMode(mode);scene.setCamera(camera);
  document.body.classList.toggle('inspect',mode==='inspect');
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('drive-panel').hidden=mode!=='drive';$('inspect-panel').hidden=mode!=='inspect';$('lab-panel').hidden=mode!=='lab';
  $('part-card').hidden=true;
  $('scene-subtitle').textContent=mode==='inspect'?'분해하고, 원리를 발견하세요.':mode==='lab'?'보이는 움직임을 검증하는 방법.':'지면에서, 그 너머로.';
  $('camera-label').textContent=camera==='orbit'?'자유 카메라':'추적 카메라';
  if(mode==='inspect')toast('드래그로 회전 · 위로 스크롤/핀치 확대하면 단계별 분해 · 반대로 조립');
}
function startDemo(){
  if(mode==='inspect')setMode('drive');
  reset('ground',false);$('fan').checked=false;$('altHold').checked=false;$('height-setting').classList.remove('show');$('stabilize').checked=true;setPaused(false);
  scenario='hop';demo=createGuidedRun($('hop-profile').value,sim.state.time);
  $$('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario==='hop'));
  toast(`${demo.profile.label} 자동 도약 · 팬을 끄고 상승·착지 감속에 기체를 사용합니다.`);
}
function startStage(){
  if(mode!=='drive')setMode('drive');
  reset('ground',false);sim.setObstacles(COURSE.obstacles);scene.setStage(COURSE);
  stage=createStageRun(sim.state.time);scenario='stage';camera='chase';scene.setCamera(camera);scene.frameStageStart(sim);$('camera-label').textContent='추적 카메라';
  $('fan').checked=false;$('stabilize').checked=true;setPaused(false);
  $$('[data-scenario]').forEach(b=>b.classList.remove('active'));
  $('left-panel').classList.remove('open');$('panel-toggle').textContent='☷ 실험 설정';
  $('world').focus({preventScroll:true});
  toast('스테이지 시작 · 왼쪽 게이트 → 공중 링 → 착지 구역에서 정지');
}
function updateStageUI(){
  const active=!!stage;
  $('stage-hud').hidden=!active||mode==='inspect';$('stage-exit').hidden=!active;
  $('stage-start').innerHTML=active?'스테이지 다시 시작 <span>↻</span>':'스테이지 시작 <span>→</span>';
  if(!active)return;
  $('stage-counter').textContent=`${stage.progress} / ${stage.total}`;
  $('stage-time').textContent=`${stage.elapsed.toFixed(1)} s / ${COURSE.timeLimit} s`;
  const cp=stage.nextCheckpoint;
  $('stage-objective').textContent=stage.status==='complete'?'STAGE CLEAR · 코스 완료':stage.status==='failed'?'다시 도전해 보세요':cp.label;
  $('stage-hint').textContent=stage.status==='complete'?'주행·공중 통과·착지 정지 완료. 다시 시작하거나 자유 주행으로 돌아갈 수 있습니다.':stage.status==='failed'?(stage.reason==='timeout'?'제한 시간이 지났습니다. R로 다시 시작하세요.':'코스 범위를 벗어났습니다. R로 다시 시작하세요.'):cp.hint;
  $('stage-steps').innerHTML=COURSE.checkpoints.map((c,i)=>`<span class="${i<stage.progress?'done':i===stage.progress?'current':''}">${i<stage.progress?'✓':i+1} ${['주행','비행','착지'][i]}</span>`).join('');
  $('stage-hud').classList.toggle('cleared',stage.status==='complete');
}
function stepSimulation(dt){
  const previous=stage?.status==='running'?sim.state.pos.clone():null;
  sim.step(dt,getInput());
  if(previous){
    updateStageRun(stage,previous,sim,dt);
    if(stage.lastEvent)toast(stage.status==='complete'?`STAGE CLEAR · ${stage.elapsed.toFixed(1)}초 완료`:stage.lastEvent.label+' 통과');
    if(stage.status==='complete'||stage.status==='failed'){keys.clear();setPaused(true);}
  }
}
function getInput(){
  const input=manualInput(keys,sim.contactCount===0,{
    stabilize:$('stabilize').checked,altHold:$('altHold').checked,
    targetHeight:Number($('target-height').value),fan:$('fan').checked,wing:$('wing').checked});
  if(demo){
    updateGuidedRun(demo,sim);
    if(demo.ended){
      const result=demo;demo=null;input.altHold=false;
      toast(result.reason==='landed'?`도약 완료 · 첫 접촉 ${result.contactSpeed.toFixed(2)} m/s · 기체 소모를 확인하세요.`:'시연 종료 · 현재 조건에서 목표를 유지할 수 없습니다.');
    }else Object.assign(input,getGuidedInput(sim.state.time-demo.startTime,demo.profile));
  }
  return input;
}
function selectPart(id){
  const key=id.startsWith('wheel')?'wheels':id;
  const p=PARTS[key]||PARTS.body;
  $('part-title').textContent=p.title;$('part-subtitle').textContent=p.subtitle;$('part-description').textContent=p.description;$('part-formula').textContent=p.formula;$('part-assumption').textContent=p.assumption;$('part-card').hidden=false;
  $$('[data-part]').forEach(b=>b.classList.toggle('active',b.dataset.part===key));
}
function updateUI(realDt){
  updateStageUI();
  const t=sim.telemetry();
  $('speed').textContent=String(Math.round(t.speed*3.6)).padStart(3,'0');
  $('altitude').innerHTML=`${t.altitude.toFixed(2)}<small>m</small>`;$('vertical').innerHTML=`${t.verticalSpeed>=0?'+':''}${t.verticalSpeed.toFixed(2)}<small>m/s</small>`;
  $('pressure').innerHTML=`${t.pressureMPa.toFixed(2)} <small>MPa</small>`;
  $('pressure-fill').style.width=clamp(t.pressureMPa/sim.params.tankPressureMPa*100,0,100)+'%';
  $('pressure-fill').style.background=t.pressureMPa<8?'#ffad89':'#a2f5db';
  $('gas').textContent=t.gasKg.toFixed(1);$('thrust').textContent=(t.thrustN/1000).toFixed(1);$('fan-force').textContent=(t.fanN/1000).toFixed(1);$('mass').textContent=Math.round(t.totalMass).toLocaleString('en-US');
  $('axle-loads').textContent=`${((sim.wheels[0].load+sim.wheels[1].load)/1000).toFixed(1)} / ${((sim.wheels[2].load+sim.wheels[3].load)/1000).toFixed(1)} kN`;
  $('contact-count').textContent=`${t.contactCount} / 4`;$$('#contact-dots i').forEach((el,i)=>{el.style.background=sim.wheels[i]?.load>10?'#a2f5db':'transparent';});
  const roll=t.attitude.roll*180/Math.PI,pitch=t.attitude.pitch*180/Math.PI;
  $('roll').textContent=roll.toFixed(1)+'°';$('pitch').textContent=pitch.toFixed(1)+'°';$('attitude-world').style.transform=`translateY(${clamp(pitch*1.1,-80,80)}px) rotate(${roll}deg)`;
  $('status-badge').textContent=paused?'PAUSED':t.status;$('drive-state').textContent=demo?'GUIDED FLIGHT':t.contactCount===0?'THRUSTER FLIGHT':t.speed>.5?'ELECTRIC DRIVE':'READY TO EXPLORE';
  const time=sim.state.time;$('sim-time').textContent=`T + ${String(Math.floor(time/60)).padStart(2,'0')}:${(time%60).toFixed(2).padStart(5,'0')}`;
  let message='',warning=false;
  if(demo)message=`GUIDED FLIGHT · ${demo.profile.label} 수직 도약 진행 중`;
  else if(t.contactCount===0&&t.pressureMPa<8){message='추력 여유 부족 · 착지 감속에 주의하세요';warning=true;}
  else if(t.saturation&&t.contactCount===0){message='추진기 출력 한계 · 목표 자세/고도에 도달하지 못할 수 있습니다';warning=true;}
  else if(t.gasPct<1){message='사용 가능한 기체가 부족합니다 · R로 초기화';warning=true;}
  else if(t.contactCount===0&&Math.abs(roll)>70){message='기울어진 추력 · 수직 성분이 감소합니다';warning=true;}
  $('flight-alert').hidden=!message||mode==='inspect';$('flight-alert').textContent=message;$('flight-alert').classList.toggle('warning',warning);
  if(time-lastSample>=.05){lastSample=time;const row={time_s:time,x_m:sim.state.pos.x,y_m:sim.state.pos.y,z_m:sim.state.pos.z,speed_m_s:t.speed,altitude_m:t.altitude,vertical_speed_m_s:t.verticalSpeed,pressure_abs_MPa:t.pressureMPa,gas_kg:t.gasKg,temp_K:t.temperature,thrust_N:t.thrustN,fan_N:t.fanN,mass_kg:t.totalMass,contacts:t.contactCount,roll_rad:t.attitude.roll,pitch_rad:t.attitude.pitch,yaw_rad:t.attitude.yaw,kinetic_J:t.kineticEnergy,potential_J:t.potentialEnergy,spring_J:t.springEnergy,battery_pct:t.batteryPct};samples.push(row);if(samples.length>18000)samples.shift();trace.push([time,t.altitude]);while(trace.length&&trace[0][0]<time-12)trace.shift();}
  drawTrace();
}
function drawTrace(){const canvas=$('trace'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#7b9baf18';ctx.lineWidth=1;for(let y=20;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}if(trace.length<2)return;const max=Math.max(1,...trace.map(v=>v[1]))*1.15;const points=trace.map(v=>[(v[0]-(sim.state.time-12))/12*w,h-12-v[1]/max*(h-25)]);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle='#a2f5db';ctx.lineWidth=2;ctx.stroke();ctx.lineTo(points.at(-1)[0],h);ctx.lineTo(points[0][0],h);ctx.closePath();let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#a2f5db28');g.addColorStop(1,'#a2f5db00');ctx.fillStyle=g;ctx.fill();}

function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  if(tab==='controls'){
    const controls=[['지상 가속 / 제동·후진','W','S'],['지상 조향','A','D'],['공중 전후 / 좌우 이동','W','A','S','D'],['마우스 드래그','시점 회전'],['구조 탐색 스크롤·핀치','분해 / 조립'],['후방 가속 추진기','SHIFT'],['수직 추진기','SPACE'],['공중 피치','↑','↓'],['공중 롤','←','→'],['공중 요','Q','E'],['마찰 브레이크','B'],['자세 안정화','T'],['고도 유지','H'],['팬 다운포스','F'],['힘 벡터','V'],['카메라 전환','C'],['일시정지 / 재생','P'],['차량·기체 초기화','R']];
    $('guide-content').innerHTML=`<div class="callout"><b>처음이라면 ‘수직 도약 시연’을 눌러보세요.</b><br>자동 제어기가 선택한 0.6 / 2 / 3 m 도약을 시도합니다. 기본값은 3 m이며, 출발·착지 과정의 제어 오차로 실제 최고 높이는 달라집니다. Space를 누르고 있으면 더 높이 올라갈 수 있지만, 하강 감속을 위한 기체가 필요합니다. 공중에서는 WASD로 차량 기준 전후·좌우로 기울이고 Space로 분사해 이동합니다. 키를 놓으면 자세 안정화가 수평으로 되돌립니다. 화살표 키는 수동 피치·롤, Q/E는 요 회전입니다. 추진기는 실제로 기체를 소모합니다.</div><div class="control-grid">${controls.map(([title,...keys])=>`<div><span>${title}</span><span>${keys.map(k=>`<kbd>${k}</kbd>`).join('')}</span></div>`).join('')}</div><div class="callout warning">고도 유지와 자세 안정화에도 추력 한계가 있습니다. 착지 직전에 기체가 부족하거나 너무 기울어져 있으면 추력으로 정지할 수 없습니다. 스테이지의 색이 있는 블록과 아치는 충돌 대상이며 상면에 착지할 수 있습니다. 판정 링은 통과 표시입니다. 먼 건물·콘·산은 배경입니다. 충돌은 상자 형태의 근사이며 실차 파손 해석은 아닙니다.</div><p class="muted">모든 모드에서 캔버스를 드래그하면 시점을 회전할 수 있습니다. 구조 탐색에서는 위로 스크롤하거나 트랙패드 핀치로 확대하면 바퀴 → 차체·캐빈 → 탱크·배터리 → 추진계 순서로 분해되고, 반대 동작으로 조립됩니다. 주행 모드에서는 스크롤이 일반 확대·축소로 작동합니다. 물리 계산은 정지하므로 분해된 부품이 실제로 떨어지는 것은 아닙니다. 모바일에서는 화면 하단 터치 버튼으로 주행·분사가 가능합니다.</p>`;
  }else if(tab==='physics')$('guide-content').innerHTML=`<div class="lesson-grid">${LESSONS.map(l=>`<article class="lesson-card"><small>${escape(l.tag)}</small><h3>${escape(l.title)}</h3><div class="formula">${escape(l.formula)}</div><p>${escape(l.body)}</p></article>`).join('')}</div>`;
  else $('guide-content').innerHTML=`<div class="callout"><b>보이는 차와 계산하는 차를 구분합니다.</b><br>기본 외형은 metarex.4d가 제작한 Tesla Roadster 2020 콘셉트 모델(CC BY 4.0)입니다. 최신 Rocket 외형이나 Tesla 공식 CAD가 아닙니다. 추진기·탱크·내부 추가 부품은 교육용 가정입니다. 질량 1,900 kg, 600 L 이상 공기 탱크, 초기 절대압 35.875 MPa, 노즐 배치와 관성은 교육용 설정입니다.</div><p class="muted">현재 모델: 6자유도 강체, 조절 가능한 고정 무게중심·관성·휠베이스·트레드, 안팎 바퀴의 조향각 차이, 이상기체 단열 방출, 수축 노즐, 유한 밸브 응답, 네 모서리의 스프링·댐퍼 접촉, 바퀴 회전과 마찰 원, 토크·출력 제한 모터, 근사 항력·윙·팬. 타이어와 서스펜션의 별도 수직 질량, 실기체, 구조 파손, 실측 공력 지도는 생략했습니다. 실제 Tesla 성능을 검증한 디지털 트윈이 아닙니다.</p><div class="callout warning">‘물리 검증’은 구현한 방정식의 수치 검산입니다. 실측과의 일치는 별도 검증이 필요합니다. GLB를 불러와도 물리 사양과 충돌 형상이 자동으로 실차에 맞춰지지 않습니다.</div><ul class="source-list">${SOURCES.map(s=>`<li><a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title||s.label)} ↗</a><p>${escape(s.note||s.kind)}</p></li>`).join('')}</ul>`;
}
function openGuide(tab='controls'){renderGuide(tab);keys.clear();$('guide-modal').showModal();}
function setupParams(){
  const config=[['dryMass',1200,2800,50],['tankVolume',.1,1,.05],['tankPressureMPa',5,50,.125],['initialTemperature',250,350,5],['friction',.3,1.6,.05],['springK',35000,120000,5000],['damperC',2000,12000,500],['fanMaxForce',0,30000,1000],['motorPowerKW',200,1000,50],['windZ',-15,15,1],['cgX',-.35,.35,.01],['cgY',-.15,.25,.01],['cgZ',-.2,.2,.01],['inertiaRoll',500,1800,50],['inertiaYaw',1800,6000,100],['inertiaPitch',1800,6000,100],['wheelbase',2.4,3.3,.05],['trackWidth',1.5,2.2,.01],['valveTau',.01,.15,.01]];
  $('param-fields').innerHTML=config.map(([key,min,max,step])=>{const info=PARAMETER_INFO[key]||['측풍 속도','m/s','가정 · 지면 +Z 방향의 일정한 바람'];return `<label class="param-field"><div><span>${escape(info[0])}</span><output id="param-out-${key}">${sim.params[key]} ${escape(info[1])}</output></div><input type="range" name="${key}" min="${min}" max="${max}" step="${step}" value="${sim.params[key]}" data-unit="${escape(info[1])}"><small>${escape(info[2])}</small></label>`;}).join('');
  $$('[name]').filter(e=>e.closest('#params-form')).forEach(input=>input.addEventListener('input',()=>{$(`param-out-${input.name}`).textContent=`${input.value} ${input.dataset.unit}`;}));
}
function exportCSV(){if(!samples.length){toast('실험 기록이 아직 없습니다. 잠시 실행한 뒤 저장하세요.');return;}const headers=Object.keys(samples[0]);const text='# Roadster Flight Lab — hypothetical educational model; SI units; absolute pressure\n'+headers.join(',')+'\n'+samples.map(s=>headers.map(k=>typeof s[k]==='number'?s[k].toFixed(6):s[k]).join(',')).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='roadster-experiment.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${samples.length}개 시점의 실험 기록을 저장했습니다.`);}

function setupUI(){
  $('hop-profile').innerHTML=Object.values(FLIGHT_PROFILES).sort((a,b)=>a.height-b.height).map(p=>`<option value="${p.id}">${p.label} · ${p.height===3?'높은 도약':p.height===2?'중간 도약':'낮은 도약'}</option>`).join('');$('hop-profile').value=DEFAULT_FLIGHT_PROFILE;
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $$('[data-scenario]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.scenario==='hop')startDemo();else{$('altHold').checked=false;$('height-setting').classList.remove('show');reset(b.dataset.scenario);setPaused(false);}}));
  $('stage-start').addEventListener('click',startStage);$('stage-exit').addEventListener('click',()=>{reset();setPaused(false);});
  $('demo').addEventListener('click',startDemo);$('pause').addEventListener('click',()=>setPaused(!paused));$('reset').addEventListener('click',()=>{if(stage)startStage();else{reset();if(mode!=='inspect')setPaused(false);}});
  $('help').addEventListener('click',()=>openGuide());$('all-controls').addEventListener('click',()=>openGuide());$('about-link').addEventListener('click',()=>openGuide('sources'));
  $('panel-toggle').addEventListener('click',()=>{$('left-panel').classList.toggle('open');$('panel-toggle').textContent=$('left-panel').classList.contains('open')?'× 닫기':'☷ 실험 설정';});
  $$('[data-guide]').forEach(b=>b.addEventListener('click',()=>renderGuide(b.dataset.guide)));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('vectors').addEventListener('click',()=>{showVectors=!showVectors;$('vectors').setAttribute('aria-pressed',showVectors);});
  $('camera').addEventListener('click',()=>{const options=['chase','orbit','top'];camera=options[(options.indexOf(camera)+1)%3];scene.setCamera(camera);$('camera-label').textContent={chase:'추적 카메라',orbit:'자유 카메라',top:'상부 카메라'}[camera];});
  $$('[data-paint]').forEach(b=>b.addEventListener('click',()=>{paint=b.dataset.paint;$$('[data-paint]').forEach(v=>v.classList.toggle('selected',v===b));}));
  $('altHold').addEventListener('change',()=>{$('height-setting').classList.toggle('show',$('altHold').checked);if($('altHold').checked&&sim.state.pos.y-sim.restHeight>.2){$('target-height').value=clamp(sim.state.pos.y-sim.restHeight,.2,10).toFixed(1);$('target-height-value').textContent=$('target-height').value+' m';}});
  $('target-height').addEventListener('input',()=>{$('target-height-value').textContent=$('target-height').value+' m';});
  $('explode').addEventListener('input',()=>{const value=Number($('explode').value);scene.setExplode(value);$('explode-value').textContent=Math.round(value*100)+'%';});
  $('part-buttons').innerHTML=Object.entries(PARTS).map(([id,p])=>`<button data-part="${id}">${escape(p.title)}</button>`).join('');
  $$('[data-part]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.part;scene.focusPart(id==='wheels'?'wheel-fl':id);selectPart(id);}));
  $('part-close').addEventListener('click',()=>{$('part-card').hidden=true;scene.focusPart(null);} );
  $('model-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>70*1024*1024){toast('GLB는 70 MB 이하로 준비해주세요.');return;}toast('외형 모델을 읽고 있습니다…');try{await scene.setModelGLB(file);$('vehicle-title').innerHTML='Custom <em>Vehicle</em>';$('model-status').textContent='사용자 GLB · 물리 사양 유지';toast('외형을 불러왔습니다. 주행 모드에서 확인하세요. 물리 사양은 유지됩니다.');}catch(err){toast('모델을 불러오지 못했습니다. 단일 GLB 파일을 확인해주세요.');console.error(err);}e.target.value='';});
  $('params-open').addEventListener('click',()=>{keys.clear();setupParams();$('params-modal').showModal();});
  $('params-default').addEventListener('click',()=>{$$('#params-form input').forEach(e=>{e.value=DEFAULTS[e.name]??0;e.dispatchEvent(new Event('input'));});});
  $('params-form').addEventListener('submit',e=>{e.preventDefault();$$('#params-form input').forEach(el=>{sim.params[el.name]=Number(el.value);});$('params-modal').close();reset();setPaused(false);});
  $('run-validation').addEventListener('click',()=>{const button=$('run-validation');button.disabled=true;button.textContent='계산 검증 중…';setTimeout(()=>{try{const result=runValidation();$('validation-results').innerHTML=result.map(r=>`<div class="validation-row" title="${escape(r.detail)}"><b>${escape(r.name)}</b><span class="${r.pass?'':'fail'}">${r.pass?'PASS':'CHECK'}</span><small>${escape(r.actual)}<br>기준: ${escape(r.expected)}</small></div>`).join('');toast(`${result.filter(r=>r.pass).length} / ${result.length} 검증 통과 · 실차 성능 인증은 아닙니다.`);}catch(err){toast('검증 실행 오류: '+err.message);console.error(err);}finally{button.disabled=false;button.innerHTML='물리 검증 다시 실행 <span>↻</span>';}},50);});
  $('lab-drop').addEventListener('click',()=>{$('altHold').checked=false;$('fan').checked=false;$('stabilize').checked=false;reset('drop');setPaused(false);showVectors=true;$('vectors').setAttribute('aria-pressed','true');});
  $('export').addEventListener('click',exportCSV);
  const toggle=(id)=>{const el=$(id);el.checked=!el.checked;el.dispatchEvent(new Event('change'));toast(`${{stabilize:'자세 안정화',altHold:'고도 유지',fan:'팬 다운포스'}[id]} ${el.checked?'ON':'OFF'}`);};
  window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(e.code==='KeyR'){if(stage)startStage();else reset();return;}if(e.code==='KeyP'){setPaused(!paused);return;}if(e.code==='KeyC'){$('camera').click();return;}if(e.code==='KeyV'){$('vectors').click();return;}if(e.code==='KeyT'){toggle('stabilize');return;}if(e.code==='KeyF'){toggle('fan');return;}if(e.code==='KeyH'){toggle('altHold');return;}
    if(e.code==='Escape'){$('left-panel').classList.remove('open');return;}
    if(mode==='inspect')return;
    if(['KeyW','KeyS','KeyA','KeyD','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','KeyB'].includes(e.code)){keys.add(e.code);if(demo){demo=null;toast('수동 조작으로 전환했습니다.');}}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  $$('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);b.classList.add('pressed');demo=null;});const release=()=>{keys.delete(b.dataset.key);b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();accumulator=0;}lastStamp=0;});
  window.addEventListener('resize',()=>scene.resize());
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));
  $('world').addEventListener('contextmenu',e=>e.preventDefault());
}
function animate(stamp){
  const elapsed=lastStamp?Math.min((stamp-lastStamp)/1000,.1):1/60;lastStamp=stamp;
  const uiBlocked=!!document.querySelector('dialog[open]');
  if(!paused&&mode!=='inspect'&&!uiBlocked&&!document.hidden){accumulator+=elapsed;let iterations=0;while(accumulator>=STEP&&iterations<50&&!paused){stepSimulation(STEP);accumulator-=STEP;iterations++;}}
  else accumulator=0;
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint,wing:$('wing').checked,stageProgress:stage?.progress??0});
  if(stamp-lastUI>80){updateUI(elapsed);lastUI=stamp;}
  frames++;frameTimer+=elapsed;if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent={chase:'추적 카메라',orbit:'자유 카메라',top:'상부 카메라'}[value];});setupUI();updateUI(0);requestAnimationFrame(animate);
  scene.loadRoadsterModel().then(status=>{if(!status.ok)throw status.error||new Error('Roadster model load failed');$('vehicle-title').innerHTML='Tesla <em>Roadster</em>';$('model-status').textContent='2020 CONCEPT · CC BY 4.0';toast('Tesla Roadster 2020 외형을 불러왔습니다. 추진계와 물리 사양은 교육용 가정입니다.');}).catch(err=>{$('model-status').textContent='외형 로드 실패 · 대체 차체';toast('Roadster 외형을 불러오지 못해 대체 차체를 표시합니다. 새로고침하면 다시 시도합니다.');console.error(err);});
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
  // Read-only convenience for local diagnostics; UI remains the supported interaction.
  window.flightLab={sim,scene,getSnapshot:()=>sim.telemetry(),runValidation};
}catch(err){console.error(err);$('boot-message').textContent='3D 화면을 시작할 수 없습니다. WebGL을 지원하는 최신 Chrome 또는 Edge에서 열어주세요.';$('boot').insertAdjacentHTML('beforeend','<button class="secondary-btn" onclick="location.reload()">다시 시도</button>');}
