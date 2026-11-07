import {VEHICLES,vehicleProfile,vehiclePhysics} from './vehicle-profiles.js?v=20261107-fleet1';
import {createLandingRun,landingRunInput,updateLandingRun,landingClearance} from './landing-experiment.js?v=20261107-land1';
import {LandingUI} from './landing-ui.js?v=20261107-fleet1';
import { RenderStateBuffer } from './render-state.js?v=20261107-drive2';
import { createFrictionRun, frictionRunInput, updateFrictionRun } from './friction-experiment.js?v=20261107-drive2';
import { PhysicsSim, DEFAULTS, PARAMETER_INFO, runValidation } from './physics.js?v=20261107-fleet1';
import { FlightScene } from './scene.js?v=20261107-fleet1';
import { COURSE, createStageRun, updateStageRun } from './stage.js?v=20261107-drive2';
import {SANDBOX,FACILITY_SOLIDS,experimentObstacles} from './world-obstacles.js?v=20261107-drive2';
import { manualInput } from './controls.js?v=20261107-drive2';
import { FLIGHT_PROFILES, DEFAULT_FLIGHT_PROFILE, createGuidedRun, updateGuidedRun, getGuidedInput, getLevelMoveInput } from './flight-plan.js?v=20261107-drive2';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const escape = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim = new PhysicsSim({roadRoughness:1});
const renderStates=new RenderStateBuffer(sim);
let frictionRun=null,collisionRun=null,lastInput={};const frictionResults=[];
let scene,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='drive',camera='chase',paused=false,paint='#b51627',showVectors=false;
let previousPause=false,scenario='ground',demo=null,stage=null,lastStamp=0,accumulator=0,lastUI=0,lastSample=0,frames=0,frameTimer=0;
const keys=new Set(),samples=[],trace=[];
let toastTimer;
const frameSamples=[];
const STEP=.002;
let landingUI,landingSession=null,landingRun=null,landingSerial=0;

function restoreLandingParams(session){
  const restored={...session.originalParams};
  if(session.originalVehicle!==activeVehicle.id){
    const chassis=vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS);
    for(const key of ['dryMass','wheelRadius','wheelbase','trackWidth','bodyLength','bodyWidth','bodyHeight','bodyCenterY','inertiaRoll','inertiaYaw','inertiaPitch','liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ'])restored[key]=chassis[key];
  }
  Object.assign(sim.params,restored);
  for(const [id,value] of Object.entries(session.originalControls))$(id).checked=value;
}
function cancelLanding(message='실험 중단 · 완료된 결과는 보존됩니다.'){
  if(!landingSession)return;
  const session=landingSession;landingSession=null;landingRun=null;restoreLandingParams(session);
  landingUI.setBusy(false,message);$('vehicle-select').disabled=vehicleLoading;
}
function stopLanding(){cancelLanding();reset('ground',false);setPaused(true);}
async function startLanding(kind){
  if(vehicleLoading)return;
  cancelLanding();
  if(mode!=='lab')setMode('lab');
  reset('ground',false);setPaused(true);
  const settings=landingUI.readOptions(),groupId='landing-'+(++landingSerial);
  const jobs=kind==='vehicles'?VEHICLES.filter(v=>settings.vehicleIds.includes(v.id)).map(v=>({vehicleId:v.id,method:settings.method})):kind==='methods'?['free','brake','gentle'].map(method=>({vehicleId:activeVehicle.id,method})):[{vehicleId:activeVehicle.id,method:settings.method}];
  const originalControls=Object.fromEntries(['obstacles-enabled','fan','wing','stabilize','altHold'].map(id=>[id,$(id).checked]));
  landingSession={groupId,kind,settings,jobs,index:0,originalParams:{...sim.params},originalVehicle:activeVehicle.id,originalControls};
  landingUI.setBusy(true,'차체 준비 중…');$('vehicle-select').disabled=true;
  await nextLanding(landingSession);
}
async function nextLanding(session){
  if(landingSession!==session)return;
  const job=session.jobs[session.index];
  if(!job){
    landingRun=null;setPaused(true);landingUI.setBusy(false,'비교 완료 · 결과를 확인하세요.');
    $('vehicle-select').disabled=false;landingUI.showResults();return;
  }
  setPaused(true);landingUI.setProgress(`${session.index+1} / ${session.jobs.length} · 차체 준비 중…`);
  try{
    if(!await selectVehicle(job.vehicleId,{forLanding:true}))throw new Error('차체를 불러오지 못했습니다.');
    if(landingSession!==session)return;
    // Every trial uses a fresh, full tank and published-profile chassis defaults.
    Object.assign(sim.params,vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS),{
      tankVolume:session.originalParams.tankVolume,tankPressureMPa:session.originalParams.tankPressureMPa,
      initialTemperature:session.originalParams.initialTemperature});
    landingRun=createLandingRun(sim,{...session.settings,method:job.method,vehicleId:activeVehicle.id,title:activeVehicle.title});
    session.metadata={...session.settings,method:job.method,groupId:session.groupId,groupSize:session.jobs.length,
      groupKind:session.kind,vehicleId:activeVehicle.id,vehicleTitle:activeVehicle.title,id:session.groupId+'-'+session.index,
      initialMass:sim.mass,initialGas:sim.initialGas,tankVolume:sim.params.tankVolume,
      tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature};
    for(const id of ['fan','wing','altHold'])$(id).checked=false;
    $('obstacles-enabled').checked=false;scene.setStage(null);scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);
    camera='chase';scene.setCamera(camera);scene.frameStageStart(sim);$('camera-label').textContent='추적 카메라';
    keys.clear();renderStates.reset(sim);samples.length=0;trace.length=0;lastSample=0;setPaused(false);
    $('vehicle-select').disabled=true;landingUI.setProgress(`${session.index+1} / ${session.jobs.length} · ${activeVehicle.title} · 착지 중`);
  }catch(error){if(landingSession===session){cancelLanding('실험 중단 · '+error.message);reset('ground',false);setPaused(true);}console.error(error);}
}
function recordLanding(dt){
  if(!landingRun)return;
  updateLandingRun(landingRun,sim,dt);
  if(!landingRun.done)return;
  const session=landingSession;
  landingUI.addResult({...session.metadata,...landingRun.result,samples:landingRun.samples});
  landingRun=null;session.index++;setPaused(true);
  // Yield until the finished step and render interpolation have committed.
  setTimeout(()=>nextLanding(session),0);
}

function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
function setPaused(value){paused=value;accumulator=0;renderStates.reset(sim);$('pause').textContent=paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',paused?'재생':'일시정지');$('live-label').textContent=paused?'PHYSICS PAUSED':'PHYSICS LIVE';}
function applySandbox(enabled=$('obstacles-enabled').checked){$('obstacles-enabled').checked=enabled;$('obstacles-enabled').disabled=false;sim.setObstacles(experimentObstacles(enabled?'sandbox':'clear'));scene?.setStage(enabled?SANDBOX:null);$('obstacle-status').textContent=enabled?'장애물 6개 · 접촉과 충돌 적용':'시험 장애물 없음 · 외곽 시설 충돌 유지';}
function reset(preset='ground',message=true,keepLanding=false){if(!keepLanding)cancelLanding();stage=null;collisionRun=null;applySandbox();sim.reset(preset);lastInput={};renderStates.reset(sim);frictionRun=null;$('friction-run-status').textContent='72 km/h · 5초 비교';demo=null;$('altHold').checked=false;$('height-setting').classList.remove('show');keys.clear();samples.length=0;trace.length=0;lastSample=0;accumulator=0;scenario=preset;$$('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario===preset));if(message)toast(preset==='drop'?'3 m 낙하 실험':'차량과 탱크를 초기화했습니다.');}
function vehicleCredit(p){return '<a href="'+escape(p.source)+'" target="_blank" rel="noopener noreferrer">3D: '+escape(p.author)+'</a> · <a href="'+escape(p.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+escape(p.license)+'</a> · 수정 적용';}
async function selectVehicle(id,{forLanding=false}={}){
  if(vehicleLoading)return false;
  if(!forLanding)cancelLanding();
  const profile=vehicleProfile(id),wasPaused=paused;
  vehicleLoading=true;keys.clear();setPaused(true);$('vehicle-select').disabled=true;
  $('model-status').textContent=profile.short+' 불러오는 중…';
  try{
    const vehicle=await scene.loadVehicle(profile);
    activeVehicle=profile;
    // Preserve environment controls; each body starts with its own chassis preset.
    const shared={};for(const key of ['friction','rollingResistance','roadRoughness','aeroEnabled','tankVolume','tractionControl','absEnabled'])shared[key]=sim.params[key];
    Object.assign(sim.params,vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),shared);
    reset('ground',false,forLanding);frictionResults.length=0;$('friction-results').innerHTML='';
    selectedPartId=null;$('part-card').hidden=true;$('part-search').value='';
    $('vehicle-title').innerHTML=escape(profile.brand)+' <em>'+escape(profile.model)+'</em>';
    $('model-status').textContent=profile.reference;
    $('vehicle-credit').innerHTML=vehicleCredit(profile);
    $('explode').value='0';$('explode-value').textContent='0%';
    refreshPartCatalog();scene.frameWholeVehicle();setPaused(mode==='inspect'||wasPaused);
    $('vehicle-select').value=profile.id;
    if(!forLanding)toast(profile.title+' · 차체 변경 완료');
    return true;
  }catch(error){$('vehicle-select').value=activeVehicle.id;$('model-status').textContent='차체 로드 실패 · 이전 차체 유지';setPaused(wasPaused);toast('차체 로드 실패 · 다시 선택해 주세요');console.error(error);return false;}
  finally{vehicleLoading=false;$('vehicle-select').disabled=!!landingRun||!!landingSession&&landingSession.index<landingSession.jobs.length;}
}
function setMode(next){
  if(next===mode)return;
  if(landingSession){cancelLanding();reset('ground',false);}
  const wasInspect=mode==='inspect';mode=next;keys.clear();demo=null;cancelFrictionRun();
  if(mode==='inspect'){previousPause=paused;setPaused(true);camera='orbit';}
  else if(wasInspect){setPaused(previousPause);camera='chase';}
  scene.setMode(mode);scene.setCamera(camera);
  document.body.classList.toggle('inspect',mode==='inspect');
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('drive-panel').hidden=mode!=='drive';$('inspect-panel').hidden=mode!=='inspect';$('lab-panel').hidden=mode!=='lab';
  $('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);renderPartCatalog();
  $('panel-toggle').textContent=mode==='inspect'?'☷ 부품 목록':'☷ 실험 설정';
  $('panel-toggle').setAttribute('aria-label',mode==='inspect'?'부품 목록 열기':'실험 패널 열기');
  if(mode==='inspect'&&matchMedia('(max-width:700px)').matches)$('left-panel').classList.add('open');
  $('camera-label').textContent=camera==='orbit'?'자유 카메라':'추적 카메라';
  if(mode==='inspect')toast('드래그 회전 · 스크롤 분해/조립');
}
function startDemo(){
  if(mode==='inspect')setMode('drive');
  reset('ground',false);applySandbox(false);$('fan').checked=false;$('altHold').checked=false;$('height-setting').classList.remove('show');$('stabilize').checked=true;setPaused(false);
  scenario='hop';demo=createGuidedRun($('hop-profile').value,sim.state.time);
  $$('[data-scenario]').forEach(b=>b.classList.toggle('active',b.dataset.scenario==='hop'));
  toast(`${demo.profile.label} 자동 도약`);
}
function startLevelDemo(){
 startDemo();demo=createGuidedRun('2',sim.state.time);demo.vector=true;
 camera='orbit';scene.setCamera(camera);scene.frameLevelDemo(sim);$('camera-label').textContent='자유 카메라';
 toast('수평 이동 시연');
}
function startStage(){
  if(mode!=='drive')setMode('drive');
  reset('ground',false);sim.setObstacles([...FACILITY_SOLIDS,...COURSE.obstacles]);scene.setStage(COURSE);$('obstacle-status').textContent='도약 코스 · 장애물 충돌 적용';$('obstacles-enabled').checked=true;$('obstacles-enabled').disabled=true;
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
  renderStates.beforeStep();
  lastInput=getInput();sim.step(dt,lastInput);
  renderStates.afterStep(sim);
  recordLanding(dt);
  if(frictionRun){
    updateFrictionRun(frictionRun,sim);
    if(frictionRun.done){frictionResults.unshift(frictionRun);frictionResults.length=Math.min(frictionResults.length,4);frictionRun=null;renderFrictionResults();setPaused(true);toast('비교 완료');}
  }
  if(collisionRun){
    if(sim.lastObstacleImpact&&collisionRun.impactTime===null)collisionRun.impactTime=sim.state.time;
    if(collisionRun.impactTime!==null&&sim.state.time-collisionRun.impactTime>.6){collisionRun=null;setPaused(true);toast('충돌 실험 완료');}
  }
  if(previous){
    updateStageRun(stage,previous,sim,dt);
    if(stage.lastEvent)toast(stage.status==='complete'?`STAGE CLEAR · ${stage.elapsed.toFixed(1)}초 완료`:stage.lastEvent.label+' 통과');
    if(stage.status==='complete'||stage.status==='failed'){keys.clear();setPaused(true);}
  }
}
function getInput(){
  if(landingRun)return landingRunInput(landingRun,sim);
  if(collisionRun)return {stabilize:false,fan:false,wing:false};
  if(frictionRun)return frictionRunInput(frictionRun);
  const input=manualInput(keys,sim.contactCount===0,{
    stabilize:$('stabilize').checked,altHold:$('altHold').checked,
    targetHeight:Number($('target-height').value),coastRegen:$('coast-regen').checked,fan:$('fan').checked,wing:$('wing').checked});
  if(demo){
    updateGuidedRun(demo,sim);
    if(demo.ended){
      const result=demo;demo=null;input.altHold=false;
      toast(result.reason==='landed'?`도약 완료 · 첫 접촉 ${result.contactSpeed.toFixed(2)} m/s`:'시연 종료 · 현재 조건에서 목표를 유지할 수 없습니다.');
    }else Object.assign(input,demo.vector?getLevelMoveInput(sim.state.time-demo.startTime):getGuidedInput(sim.state.time-demo.startTime,demo.profile));
  }
  return input;
}
function cancelFrictionRun(){collisionRun=null;if(frictionRun){frictionRun=null;$('friction-run-status').textContent='조건 또는 조작 변경으로 실험을 중단했습니다.';}}
function startCollisionDemo(){
 if(mode!=='drive')setMode('drive');reset('ground',false);$('obstacles-enabled').checked=true;applySandbox(true);
 for(const id of ['fan','wing','stabilize','altHold'])$(id).checked=false;
 sim.state.vel.x=12;for(const w of sim.wheels)w.omega=12/sim.params.wheelRadius;renderStates.reset(sim);
 collisionRun={impactTime:null};camera='chase';scene.setCamera(camera);scene.frameStageStart(sim);$('camera-label').textContent='추적 카메라';setPaused(false);
 toast('43.2 km/h 충돌 시연');
}
function startFrictionRun(kind){
 if(mode==='inspect')setMode('drive');reset('rolling',false);applySandbox(false);
 for(const id of ['fan','wing','stabilize','altHold'])$(id).checked=false;
 frictionRun=createFrictionRun(kind,sim);setPaused(false);camera='chase';scene.setCamera(camera);scene.frameStageStart(sim);$('camera-label').textContent='추적 카메라';
 $('world').focus({preventScroll:true});toast('초기 수평속도 72 km/h · '+(kind==='brake'?'브레이크 ON':'가속·제동 OFF')+' · 5초 비교');
}
function renderFrictionResults(){
 $('friction-run-status').textContent='비교 완료 · 일시정지';
 $('friction-results').innerHTML=frictionResults.map(r=>'<li><b>'+(r.kind==='brake'?'제동':'타력')+' · '+(r.speed*3.6).toFixed(1)+' km/h · '+r.distance.toFixed(1)+' m 이동</b><small>μ '+r.mu.toFixed(2)+' · Crr '+r.crr.toFixed(3)+' · 요철 '+(r.roughness*3).toFixed(0)+' mm · 회생 타력 OFF · 공기저항 '+(r.aero?'ON':'OFF')+' · 5.0 s</small></li>').join('');
}
function updatePartActions(){
  $('part-hide').textContent=scene.hiddenParts.has(selectedPartId)?'다시 표시':'선택 숨기기';
  $('part-isolate').textContent=selectedPartId&&scene.isolatedPartId===selectedPartId?'단독 보기 해제':'이것만 보기';
  $('part-isolate').setAttribute('aria-pressed',!!selectedPartId&&scene.isolatedPartId===selectedPartId);
}
function renderPartCatalog(){
  const focusedPart=document.activeElement?.dataset.part;
  const catalog=scene.getPartCatalog(),query=$('part-search').value.trim().toLocaleLowerCase(),category=$('part-category').value;
  const available=catalog.filter(p=>p.kind==='model'||$('show-hypotheses').checked);
  const filtered=available.filter(p=>(!category||p.category===category)&&(!query||[p.title,p.sourceName,p.sourceObjectName,...(p.materialNames||[])].join(' ').toLocaleLowerCase().includes(query)));
  $('catalog-summary').textContent=catalog.length?'원본 외형 '+catalog.filter(p=>p.kind==='model').length+'개 메시 · 교육용 장치 '+catalog.filter(p=>p.kind==='hypothesis').length+'개':'원본 외형을 불러오는 중…';
  $('part-count').textContent=filtered.length+' / '+available.length+'개 항목';
  $('part-buttons').innerHTML=filtered.map(p=>'<button type="button" data-part="'+escape(p.id)+'" class="'+(p.id===selectedPartId?'active ':'')+(scene.hiddenParts.has(p.id)?'part-hidden':'')+'" aria-pressed="'+(p.id===selectedPartId)+'"><span>'+escape(p.title)+'</span><small>'+escape(p.categoryLabel)+' · '+escape(p.kind==='hypothesis'?'교육용 가정':p.id.replace('model-','#'))+(scene.hiddenParts.has(p.id)?' · 숨김':'')+'</small></button>').join('');
  if(focusedPart)$$('[data-part]').find(b=>b.dataset.part===focusedPart)?.focus({preventScroll:true});
  $('part-empty').hidden=filtered.length>0;
  $('part-empty').textContent=catalog.length?'검색 결과가 없습니다. 검색어나 분류를 바꿔보세요.':'모델이 준비되면 세부 항목이 표시됩니다.';
  $('inspector-state').textContent=scene.isolatedPartId?'선택 항목만 표시 중':scene.hiddenParts.size?scene.hiddenParts.size+'개 항목 숨김':'전체 구성 표시';
  updatePartActions();
}
function refreshPartCatalog(){
  const categories=new Map(scene.getPartCatalog().map(p=>[p.category,p.categoryLabel]));
  $('part-category').innerHTML='<option value="">모든 부위</option>'+[...categories].filter(([id])=>id!=='hypothesis'||$('show-hypotheses').checked).map(([id,title])=>'<option value="'+escape(id)+'">'+escape(title)+'</option>').join('');
  renderPartCatalog();
}
function selectPart(id){
  const entry=scene.getPartCatalog().find(p=>p.id===id);
  if(!entry)return;
  selectedPartId=id;
  $('part-title').textContent=entry.title.replace(' · 가정 장치','');
  $('part-subtitle').textContent=entry.categoryLabel;
  $('part-card').hidden=false;
  renderPartCatalog();
  if(matchMedia('(max-width:700px)').matches){$('left-panel').classList.remove('open');$('panel-toggle').textContent='☷ 부품 목록';}
}
function updateUI(realDt){
  updateStageUI();
  if(frameSamples.length){const sorted=frameSamples.map(s=>s.ms).sort((a,b)=>a-b);const avg=frameSamples.reduce((s,f)=>s+f.ms,0)/frameSamples.length;const cpu=frameSamples.reduce((s,f)=>s+f.physics,0)/frameSamples.length;const render=frameSamples.reduce((s,f)=>s+f.render,0)/frameSamples.length;$('performance-readout').textContent=(1000/avg).toFixed(0)+' FPS · '+avg.toFixed(1)+' ms';$('performance-details').textContent='물리 '+cpu.toFixed(1)+' ms · 화면 '+render.toFixed(1)+' ms · P95 '+sorted[Math.floor((sorted.length-1)*.95)].toFixed(1)+' ms · '+scene.renderer.info.render.calls+' draw / '+scene.renderer.info.render.triangles+' triangles · '+scene.canvas.width+'×'+scene.canvas.height+' px';}
  const t=sim.telemetry();
  $('tank-capacity-live').textContent=t.tankVolumeL.toFixed(0)+' L / '+t.tankCapacityKg.toFixed(0)+' kg';
  $('feed-pressure').textContent=t.manifoldPressureMPa.toFixed(2)+' MPa';$('gas-flow').textContent=t.massFlowKgS.toFixed(2)+' kg/s';
  $('battery-state').textContent=(sim.state.batteryJ/(sim.params.batteryKWh*3.6e6)*100).toFixed(2)+'% · '+sim.params.batteryKWh+' kWh';
  $('drive-power').textContent=(Math.max(0,t.electricPowerW)/1000).toFixed(1)+' kW';$('regen-power').textContent=(t.regenPowerW/1000).toFixed(1)+' kW';
  $('motor-readings').innerHTML=t.motorState.motors.map((motor,i)=>'<div><span>'+['앞 모터','뒤 왼쪽','뒤 오른쪽'][i]+'</span><b>'+Math.round(motor.rpm).toLocaleString()+' rpm · '+motor.torqueNm.toFixed(0)+' N·m</b></div>').join('');
  $('traction-state').textContent='최대 슬립 '+(Math.max(...sim.wheels.map(w=>Math.abs(w.slip)))*100).toFixed(0)+'% · 미끄러지는 바퀴 '+t.slidingWheels+'개 · TCS 출력 '+(t.tractionCut*100).toFixed(0)+'%';
  $('valve-strip').innerHTML=sim.thrusters.map((v,i)=>'<span title="밸브 '+(i+1)+' · '+(v.opening*100).toFixed(0)+'%"><i style="height:'+(v.opening*100).toFixed(1)+'%"></i></span>').join('');
  const impact=t.lastObstacleImpact;
  $('collision-readout').textContent=impact?(impact.speed*3.6).toFixed(1)+' km/h · '+(impact.impulse/1000).toFixed(2)+' kN·s':'아직 충돌 없음';
  $('collision-detail').textContent=impact?'접촉 '+t.collisionCount+'회 · '+([...SANDBOX.obstacles,...COURSE.obstacles,...FACILITY_SOLIDS].find(o=>o.id===impact.id)?.label||'시설 구조물')+' · T '+impact.time.toFixed(2)+' s':'충돌 직전 법선 속도 / 충격량';
  $('grip-usage').textContent=(t.gripUsage*100).toFixed(0)+'%';
  $('grip-bar').style.width=Math.min(100,t.gripUsage*100)+'%';
  $('grip-bar').classList.toggle('limit',t.gripUsage>.95);
  if(frictionRun)$('friction-run-status').textContent=(frictionRun.kind==='brake'?'제동':'타력')+' 비교 '+frictionRun.elapsed.toFixed(1)+' / 5.0 s · '+frictionRun.distance.toFixed(1)+' m';
  $('rolling-force').textContent=(t.rollingResistanceN/1000).toFixed(2)+' kN';$('brake-force').textContent=(t.brakeForceN/1000).toFixed(2)+' kN';
  $('ground-action').textContent=paused?'일시정지 · 마지막 계산값':t.contactCount===0?'공중 · 노면 마찰 0':lastInput.brake?'접지 · 제동 중':Math.abs(lastInput.throttle||0)>0?'접지 · 가속 중':'접지 · 타력 주행';
  $('gimbal-angle').textContent=t.gimbalAngleDeg.toFixed(1)+'°';$('level-attitude').textContent=(t.attitude.roll*180/Math.PI).toFixed(1)+'° / '+(t.attitude.pitch*180/Math.PI).toFixed(1)+'°';
  $('speed').textContent=String(Math.round(t.speed*3.6)).padStart(3,'0');
  $('horizontal-speed').innerHTML=(t.horizontalSpeed*3.6).toFixed(1)+' <small>km/h</small>';$('horizontal-ms').textContent=t.horizontalSpeed.toFixed(2)+' m/s';
  $('tire-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';$('air-force').textContent=(t.airDragN/1000).toFixed(2)+' kN';$('friction-value').textContent=Number(sim.params.friction).toFixed(2);
  $('altitude-label').textContent=landingSession?'바퀴–지면 높이':'고도';
  $('altitude').innerHTML=`${(landingSession?Math.max(0,landingClearance(sim)):t.altitude).toFixed(2)}<small>m</small>`;$('vertical').innerHTML=`${t.verticalSpeed>=0?'+':''}${t.verticalSpeed.toFixed(2)}<small>m/s</small>`;
  $('pressure').innerHTML=`${t.pressureMPa.toFixed(2)} <small>MPa</small>`;
  $('pressure-fill').style.width=clamp(t.pressureMPa/sim.params.tankPressureMPa*100,0,100)+'%';
  $('pressure-fill').style.background=t.pressureMPa<8?'#ffad89':'#a2f5db';
  $('gas').textContent=t.gasKg.toFixed(1);$('thrust').textContent=(t.thrustN/1000).toFixed(1);$('fan-force').textContent=(t.fanN/1000).toFixed(1);$('mass').textContent=Math.round(t.totalMass).toLocaleString('en-US');
  $('axle-loads').textContent=`${((sim.wheels[0].load+sim.wheels[1].load)/1000).toFixed(1)} / ${((sim.wheels[2].load+sim.wheels[3].load)/1000).toFixed(1)} kN`;
  $('contact-count').textContent=`${t.contactCount} / 4`;$$('#contact-dots i').forEach((el,i)=>{el.style.background=sim.wheels[i]?.load>10?'#a2f5db':'transparent';});
  const roll=t.attitude.roll*180/Math.PI,pitch=t.attitude.pitch*180/Math.PI;
  $('roll').textContent=roll.toFixed(1)+'°';$('pitch').textContent=pitch.toFixed(1)+'°';$('attitude-world').style.transform=`translateY(${clamp(pitch*1.1,-80,80)}px) rotate(${roll}deg)`;
  $('status-badge').textContent=paused?'PAUSED':t.status;$('drive-state').textContent=demo?'GUIDED FLIGHT':t.contactCount===0?'THRUSTER FLIGHT':t.speed>.5?'GROUND DRIVE':'READY TO EXPLORE';
  const time=sim.state.time;$('sim-time').textContent=`T + ${String(Math.floor(time/60)).padStart(2,'0')}:${(time%60).toFixed(2).padStart(5,'0')}`;
  let message='',warning=false;
  if(t.lastObstacleImpact&&time-t.lastObstacleImpact.lastTime<1.5){message='충돌 · '+(t.lastObstacleImpact.speed*3.6).toFixed(1)+' km/h · '+(t.lastObstacleImpact.impulse/1000).toFixed(2)+' kN·s';warning=true;}
  else if(demo)message=demo.vector?'VECTOR FLIGHT · 노즐 방향 전환 · 차체 수평 제어':`GUIDED FLIGHT · ${demo.profile.label} 수직 도약 진행 중`;
  else if(t.contactCount===0&&t.pressureMPa<8){message='추력 여유 부족 · 착지 감속에 주의하세요';warning=true;}
  else if(t.saturation&&t.contactCount===0){message='추진기 출력 한계 · 목표 자세/고도에 도달하지 못할 수 있습니다';warning=true;}
  else if(t.gasPct<1){message='사용 가능한 기체가 부족합니다 · R로 초기화';warning=true;}
  else if(t.contactCount===0&&Math.abs(roll)>70){message='기울어진 추력 · 수직 성분이 감소합니다';warning=true;}
  $('flight-alert').hidden=!message||mode==='inspect';$('flight-alert').textContent=message;$('flight-alert').classList.toggle('warning',warning);
  if(time-lastSample>=.05){lastSample=time;const row={time_s:time,x_m:sim.state.pos.x,y_m:sim.state.pos.y,z_m:sim.state.pos.z,speed_m_s:t.speed,horizontal_speed_m_s:t.horizontalSpeed,friction_force_N:t.frictionForceN,rolling_resistance_N:t.rollingResistanceN,brake_force_N:t.brakeForceN,rolling_coefficient:sim.params.rollingResistance,body_air_drag_N:t.airDragN,friction_coefficient:sim.params.friction,grip_usage:t.gripUsage,collision_count:t.collisionCount,collision_speed_m_s:t.lastObstacleImpact?.speed||0,collision_impulse_Ns:t.lastObstacleImpact?.impulse||0,gimbal_deg:t.gimbalAngleDeg,gimbal_forward_deg:t.gimbalForwardDeg,gimbal_right_deg:t.gimbalRightDeg,altitude_m:t.altitude,vertical_speed_m_s:t.verticalSpeed,pressure_abs_MPa:t.pressureMPa,gas_kg:t.gasKg,temp_K:t.temperature,thrust_N:t.thrustN,fan_N:t.fanN,mass_kg:t.totalMass,contacts:t.contactCount,roll_rad:t.attitude.roll,pitch_rad:t.attitude.pitch,yaw_rad:t.attitude.yaw,kinetic_J:t.kineticEnergy,potential_J:t.potentialEnergy,spring_J:t.springEnergy,battery_pct:t.batteryPct,battery_J:sim.state.batteryJ,electric_power_W:t.electricPowerW,regen_power_W:t.regenPowerW,motor_front_rpm:t.motorState.motors[0].rpm,motor_rear_left_rpm:t.motorState.motors[1].rpm,motor_rear_right_rpm:t.motorState.motors[2].rpm,gas_flow_kg_s:t.massFlowKgS,feed_pressure_MPa:t.manifoldPressureMPa,road_roughness:sim.params.roadRoughness,max_slip:Math.max(...sim.wheels.map(w=>Math.abs(w.slip)))};samples.push(row);if(samples.length>18000)samples.shift();trace.push([time,t.altitude]);while(trace.length&&trace[0][0]<time-12)trace.shift();}
  drawTrace();
}
function drawTrace(){const canvas=$('trace'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#7b9baf18';ctx.lineWidth=1;for(let y=20;y<h;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}if(trace.length<2)return;const max=Math.max(1,...trace.map(v=>v[1]))*1.15;const points=trace.map(v=>[(v[0]-(sim.state.time-12))/12*w,h-12-v[1]/max*(h-25)]);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle='#a2f5db';ctx.lineWidth=2;ctx.stroke();ctx.lineTo(points.at(-1)[0],h);ctx.lineTo(points[0][0],h);ctx.closePath();let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#a2f5db28');g.addColorStop(1,'#a2f5db00');ctx.fillStyle=g;ctx.fill();}

function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  const controls=[['지상 전진 / 후진','W','S'],['지상 조향','A','D'],['공중 전후 / 좌우 이동','W','A','S','D'],['마우스 드래그','시점 회전'],['구조 탐색 스크롤·핀치','분해 / 조립'],['후방 가속 추진기','SHIFT'],['수직 추진기','SPACE'],['공중 피치','↑','↓'],['공중 롤','←','→'],['공중 요','Q','E'],['회생·마찰 제동','B'],['자세 안정화','T'],['고도 유지','H'],['팬 다운포스','F'],['힘 벡터','V'],['카메라 전환','C'],['일시정지 / 재생','P'],['차량·기체 초기화','R']];
  $('guide-content').innerHTML=tab==='controls'?'<div class="control-grid">'+controls.map(([title,...keys])=>'<div><span>'+title+'</span><span>'+keys.map(k=>'<kbd>'+k+'</kbd>').join('')+'</span></div>').join('')+'</div>':'<p>실차 외형 · 공통 가상 추진계 · <a href="./assets/vehicles/vehicle-specifications.md" target="_blank" rel="noopener noreferrer">제원 기준</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join('');
}
function openGuide(tab='controls'){renderGuide(tab);keys.clear();$('guide-modal').showModal();}
function setupParams(){
  const config=[['dryMass',1200,2800,50],['tankVolume',.1,1.2,.05],['tankPressureMPa',5,50,.125],['initialTemperature',250,350,5],['friction',0,1.6,.05],['rollingResistance',0,.08,.001],['springK',35000,120000,5000],['damperC',2000,12000,500],['fanMaxForce',0,30000,1000],['motorPowerKW',200,1000,50],['windZ',-15,15,1],['cgX',-.35,.35,.01],['cgY',-.15,.25,.01],['cgZ',-.2,.2,.01],['inertiaRoll',500,1800,50],['inertiaYaw',1800,6000,100],['inertiaPitch',1800,6000,100],['wheelbase',2.4,3.3,.05],['trackWidth',1.5,2.2,.01],['valveTau',.01,.15,.01]];
  $('param-fields').innerHTML=config.map(([key,min,max,step])=>{const info=PARAMETER_INFO[key]||['측풍 속도','m/s','가정 · 지면 +Z 방향의 일정한 바람'];return `<label class="param-field"><div><span>${escape(info[0])}</span><output id="param-out-${key}">${sim.params[key]} ${escape(info[1])}</output></div><input type="range" name="${key}" min="${min}" max="${max}" step="${step}" value="${sim.params[key]}" data-unit="${escape(info[1])}">${key.startsWith('cg')?'<small>+ '+({cgX:'앞',cgY:'위',cgZ:'오른쪽'}[key])+'</small>':''}</label>`;}).join('');
  $$('[name]').filter(e=>e.closest('#params-form')).forEach(input=>input.addEventListener('input',()=>{$(`param-out-${input.name}`).textContent=`${input.value} ${input.dataset.unit}`;}));
}
function exportCSV(){if(!samples.length){toast('실험 기록이 아직 없습니다. 잠시 실행한 뒤 저장하세요.');return;}const headers=Object.keys(samples[0]);const text='# '+activeVehicle.title+' — hypothetical shared conversion; SI units; absolute pressure; dry_mass_kg='+sim.params.dryMass+'\n'+headers.join(',')+'\n'+samples.map(s=>headers.map(k=>typeof s[k]==='number'?s[k].toFixed(6):s[k]).join(',')).join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='roadster-experiment.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${samples.length}개 시점의 실험 기록을 저장했습니다.`);}

function setupUI(){
  $('vehicle-select').innerHTML=VEHICLES.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+'</option>').join('');
  landingUI=new LandingUI({vehicles:VEHICLES,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onStop:stopLanding});
  // End the controlled trial before external settings mutate simulation state.
  const externalSettings=['tank-capacity','road-roughness','grip-control','coast-regen','obstacles-enabled','rolling-resistance','road-surface','air-resistance','fan','wing','stabilize','altHold','target-height'];
  const beforeExternalEdit=e=>{if(!landingSession||!externalSettings.includes(e.target.id))return;const checked=e.target.checked;cancelLanding();reset('ground',false);e.target.checked=checked;setPaused(true);};
  $('left-panel').addEventListener('input',beforeExternalEdit,true);
  $('left-panel').addEventListener('change',beforeExternalEdit,true);
  $('params-form').addEventListener('submit',()=>cancelLanding(),true);
  $('vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $('tank-capacity').addEventListener('change',()=>{sim.params.tankVolume=Number($('tank-capacity').value);reset('ground',false);setPaused(false);toast('탱크 변경 · 초기화');});
  $('road-roughness').addEventListener('change',()=>{cancelFrictionRun();sim.params.roadRoughness=Number($('road-roughness').value);});
  $('grip-control').addEventListener('change',()=>{cancelFrictionRun();sim.params.tractionControl=sim.params.absEnabled=$('grip-control').checked;});
  $('coast-regen').addEventListener('change',cancelFrictionRun);
  $('powertrain-view').addEventListener('change',()=>{if($('powertrain-view').checked){camera='orbit';scene.setCamera(camera);scene.frameWholeVehicle?.();$('camera-label').textContent='자유 카메라';}toast('투시 전환');});
  $$('[data-drive-part]').forEach(button=>button.addEventListener('click',()=>{if(mode!=='inspect')setMode('inspect');$('show-hypotheses').checked=true;scene.setHypothesesVisible(true);scene.setExplode(.72,true);scene.focusPart(button.dataset.drivePart);if(scene.isolatedPartId!==button.dataset.drivePart)scene.isolatePart(button.dataset.drivePart);selectPart(button.dataset.drivePart);scene.frameSelectedPart();}));
  scene.setHypothesesVisible(true);
  $('fan').checked=false;
  $('level-demo').addEventListener('click',startLevelDemo);
  $('render-quality').addEventListener('change',()=>{scene.setQuality($('render-quality').value);document.body.classList.toggle('quality-smooth',scene.quality==='smooth');frameSamples.length=0;});
  $('obstacles-enabled').addEventListener('change',()=>{reset('ground',false);setPaused(false);toast('장애물 변경 · 초기화');});
  $('collision-demo').addEventListener('click',startCollisionDemo);
  $('rolling-resistance').addEventListener('input',()=>{cancelFrictionRun();sim.params.rollingResistance=Number($('rolling-resistance').value);$('rolling-value').textContent=sim.params.rollingResistance.toFixed(3);});
  $('coast-test').addEventListener('click',()=>startFrictionRun('coast'));$('brake-test').addEventListener('click',()=>startFrictionRun('brake'));
  $('road-surface').addEventListener('change',()=>{cancelFrictionRun();const value=Number($('road-surface').value);if(Number.isFinite(value))sim.params.friction=value;$('world').focus({preventScroll:true});toast('마찰계수 변경');});
  $('air-resistance').addEventListener('change',()=>{cancelFrictionRun();sim.params.aeroEnabled=$('air-resistance').checked;$('world').focus({preventScroll:true});toast(sim.params.aeroEnabled?'공기저항 ON':'공기저항 OFF');});
  $('tank-focus').addEventListener('click',()=>{if(!scene.getPartCatalog().some(p=>p.id==='tank')){toast('모델을 불러오는 중입니다. 잠시 후 다시 선택하세요.');return;}$('show-hypotheses').checked=true;scene.setHypothesesVisible(true);$('part-search').value='';$('part-category').value='';refreshPartCatalog();scene.setExplode(.72,true);scene.focusPart('tank');if(scene.isolatedPartId!=='tank')scene.isolatePart('tank');selectPart('tank');scene.frameSelectedPart();});
  $('hop-profile').innerHTML=Object.values(FLIGHT_PROFILES).sort((a,b)=>a.height-b.height).map(p=>`<option value="${p.id}">${p.label} · ${p.height===3?'높은 도약':p.height===2?'중간 도약':'낮은 도약'}</option>`).join('');$('hop-profile').value=DEFAULT_FLIGHT_PROFILE;
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $$('[data-scenario]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.scenario==='hop')startDemo();else{$('altHold').checked=false;$('height-setting').classList.remove('show');reset(b.dataset.scenario);setPaused(false);}}));
  $('stage-start').addEventListener('click',startStage);$('stage-exit').addEventListener('click',()=>{reset();setPaused(false);});
  $('demo').addEventListener('click',startDemo);$('pause').addEventListener('click',()=>setPaused(!paused));$('reset').addEventListener('click',()=>{if(stage)startStage();else{reset();if(mode!=='inspect')setPaused(false);}});
  $('help').addEventListener('click',()=>openGuide());$('all-controls').addEventListener('click',()=>openGuide());$('about-link').addEventListener('click',()=>openGuide('sources'));
  $('panel-toggle').addEventListener('click',()=>{$('left-panel').classList.toggle('open');$('panel-toggle').textContent=$('left-panel').classList.contains('open')?'× 닫기':mode==='inspect'?'☷ 부품 목록':'☷ 실험 설정';});
  $$('[data-guide]').forEach(b=>b.addEventListener('click',()=>renderGuide(b.dataset.guide)));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('vectors').addEventListener('click',()=>{showVectors=!showVectors;$('vectors').setAttribute('aria-pressed',showVectors);});
  $('camera').addEventListener('click',()=>{const options=['chase','orbit','top'];camera=options[(options.indexOf(camera)+1)%3];scene.setCamera(camera);$('camera-label').textContent={chase:'추적 카메라',orbit:'자유 카메라',top:'상부 카메라'}[camera];});
  $$('[data-paint]').forEach(b=>b.addEventListener('click',()=>{paint=b.dataset.paint;$$('[data-paint]').forEach(v=>v.classList.toggle('selected',v===b));}));
  $('altHold').addEventListener('change',()=>{$('height-setting').classList.toggle('show',$('altHold').checked);if($('altHold').checked&&sim.state.pos.y-sim.restHeight>.2){$('target-height').value=clamp(sim.state.pos.y-sim.restHeight,.2,10).toFixed(1);$('target-height-value').textContent=$('target-height').value+' m';}});
  $('target-height').addEventListener('input',()=>{$('target-height-value').textContent=$('target-height').value+' m';});
  $('explode').addEventListener('input',()=>{const value=Number($('explode').value);scene.setExplode(value);$('explode-value').textContent=Math.round(value*100)+'%';});
  refreshPartCatalog();
  $('part-search').addEventListener('input',renderPartCatalog);
  $('part-category').addEventListener('change',renderPartCatalog);
  $('show-hypotheses').addEventListener('change',()=>{scene.setHypothesesVisible($('show-hypotheses').checked);if(scene.getPartCatalog().some(p=>p.id===selectedPartId&&p.kind==='hypothesis')){$('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);}refreshPartCatalog();});
  $('part-buttons').addEventListener('click',e=>{const button=e.target.closest('[data-part]');if(!button)return;scene.focusPart(button.dataset.part);selectPart(button.dataset.part);});
  $('part-zoom').addEventListener('click',()=>scene.frameSelectedPart());
  $('part-hide').addEventListener('click',()=>{scene.togglePartVisibility(selectedPartId);renderPartCatalog();});
  $('part-isolate').addEventListener('click',()=>{scene.isolatePart(selectedPartId);renderPartCatalog();});
  $('parts-restore').addEventListener('click',()=>{scene.restoreParts();$('part-search').value='';$('part-category').value='';renderPartCatalog();});
  $('parts-assemble').addEventListener('click',()=>{scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);scene.frameWholeVehicle();selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();});
  $('part-close').addEventListener('click',()=>{$('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);renderPartCatalog();});
  $('model-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>70*1024*1024){toast('GLB는 70 MB 이하로 준비해주세요.');return;}toast('외형 모델을 읽고 있습니다…');try{await scene.setModelGLB(file);$('vehicle-title').innerHTML='Custom <em>Vehicle</em>';$('model-status').textContent='사용자 GLB · 물리 사양 유지';toast('외형 변경 완료');}catch(err){toast('모델을 불러오지 못했습니다. 단일 GLB 파일을 확인해주세요.');console.error(err);}e.target.value='';});
  $('params-open').addEventListener('click',()=>{keys.clear();setupParams();$('params-modal').showModal();});
  $('params-default').addEventListener('click',()=>{$$('#params-form input').forEach(e=>{e.value=vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS)[e.name]??0;e.dispatchEvent(new Event('input'));});});
  $('params-form').addEventListener('submit',e=>{e.preventDefault();$$('#params-form input').forEach(el=>{sim.params[el.name]=Number(el.value);});$('params-modal').close();$('tank-capacity').value=String(sim.params.tankVolume);$('road-surface').value=['1.15','0.65','0.15','0'].includes(String(sim.params.friction))?String(sim.params.friction):'custom';$('rolling-resistance').value=sim.params.rollingResistance;$('rolling-value').textContent=sim.params.rollingResistance.toFixed(3);reset();setPaused(false);});
  $('run-validation').addEventListener('click',()=>{const button=$('run-validation');button.disabled=true;button.textContent='계산 검증 중…';setTimeout(()=>{try{const result=runValidation();$('validation-results').innerHTML=result.map(r=>`<div class="validation-row"><b>${escape(r.name)}</b><span class="${r.pass?'':'fail'}">${r.pass?'PASS':'CHECK'}</span><small>${escape(r.actual)}<br>기준: ${escape(r.expected)}</small></div>`).join('');toast(`${result.filter(r=>r.pass).length} / ${result.length} 검증 통과`);}catch(err){toast('검증 실행 오류: '+err.message);console.error(err);}finally{button.disabled=false;button.innerHTML='물리 검증 다시 실행 <span>↻</span>';}},50);});
  $('lab-drop').addEventListener('click',()=>{$('altHold').checked=false;$('fan').checked=false;$('stabilize').checked=false;reset('drop');setPaused(false);showVectors=true;$('vectors').setAttribute('aria-pressed','true');});
  $('export').addEventListener('click',exportCSV);
  const toggle=(id)=>{const el=$(id);el.checked=!el.checked;el.dispatchEvent(new Event('change'));toast(`${{stabilize:'자세 안정화',altHold:'고도 유지',fan:'팬 다운포스'}[id]} ${el.checked?'ON':'OFF'}`);};
  window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
    if(e.repeat)return;
    if(landingSession&&landingSession.index<landingSession.jobs.length&&!['KeyP','KeyC','KeyR','Escape'].includes(e.code))return;
    if(e.code==='KeyR'){if(stage)startStage();else reset();return;}if(e.code==='KeyP'){setPaused(!paused);return;}if(e.code==='KeyC'){$('camera').click();return;}if(e.code==='KeyV'){$('vectors').click();return;}if(e.code==='KeyT'){toggle('stabilize');return;}if(e.code==='KeyF'){toggle('fan');return;}if(e.code==='KeyH'){toggle('altHold');return;}
    if(e.code==='Escape'){$('left-panel').classList.remove('open');return;}
    if(mode==='inspect')return;
    if(['KeyW','KeyS','KeyA','KeyD','Space','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyQ','KeyE','KeyB'].includes(e.code)){keys.add(e.code);cancelFrictionRun();if(demo){demo=null;toast('수동 조작으로 전환했습니다.');}}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  $$('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(landingSession&&landingSession.index<landingSession.jobs.length)return;b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);cancelFrictionRun();b.classList.add('pressed');demo=null;});const release=()=>{keys.delete(b.dataset.key);b.classList.remove('pressed');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();accumulator=0;}renderStates.reset(sim);lastStamp=0;frameSamples.length=0;});
  window.addEventListener('resize',()=>scene.resize());
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));
  $('world').addEventListener('contextmenu',e=>e.preventDefault());
}
function animate(stamp){
  const frameMs=lastStamp?stamp-lastStamp:16.67;const physicsStart=performance.now();
  const elapsed=lastStamp?Math.min((stamp-lastStamp)/1000,.1):1/60;lastStamp=stamp;
  const uiBlocked=!!document.querySelector('dialog[open]');
  if(!vehicleLoading&&!paused&&mode!=='inspect'&&!uiBlocked&&!document.hidden){accumulator+=elapsed;let iterations=0;while(accumulator>=STEP&&iterations<50&&!paused){stepSimulation(STEP);accumulator=Math.max(0,accumulator-STEP);iterations++;}}
  else accumulator=0;
  const physicsEnd=performance.now();
  if(!document.hidden&&lastStamp)scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint,wing:$('wing').checked,stageProgress:stage?.progress??0,cutaway:$('powertrain-view').checked,renderState:renderStates.sample(paused||mode==='inspect'||uiBlocked?1:accumulator/STEP)});
  const renderEnd=performance.now();if(!document.hidden&&frameMs<500){frameSamples.push({ms:frameMs,physics:physicsEnd-physicsStart,render:renderEnd-physicsEnd});if(frameSamples.length>240)frameSamples.shift();}
  if(stamp-lastUI>80){updateUI(elapsed);lastUI=stamp;}
  frames++;frameTimer+=elapsed;if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent={chase:'추적 카메라',orbit:'자유 카메라',top:'상부 카메라'}[value];});setupUI();applySandbox();updateUI(0);requestAnimationFrame(animate);
  selectVehicle('roadster');
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
  // Read-only convenience for local diagnostics; UI remains the supported interaction.
  window.flightLab={sim,scene,getSnapshot:()=>sim.telemetry(),runValidation};
}catch(err){console.error(err);$('boot-message').textContent='3D 화면을 시작할 수 없습니다. WebGL을 지원하는 최신 Chrome 또는 Edge에서 열어주세요.';$('boot').insertAdjacentHTML('beforeend','<button class="secondary-btn" onclick="location.reload()">다시 시도</button>');}
