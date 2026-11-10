import {Vector3} from 'three';
import {bindLandingLiftControls} from './landing-controls.js?v=20261110-space1';
import {CITY_SURFACES,BRAKE_REASONS,normalizeCityExperiment,cityExperimentParams,CityBrakeTrial,brakeResultsCSV} from './city-experiment.js?v=20261110-space1';
import {DrivingController,CITY_DRIVE_PARAMS} from './driving-input.js?v=20261110-space1';
import {VEHICLES,vehicleProfile,vehiclePhysics} from './vehicle-profiles.js?v=20261109-assessment1';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from './landing-experiment.js?v=20261110-space1';
import {LandingUI} from './landing-ui.js?v=20261110-space1';
import {RenderStateBuffer} from './render-state.js?v=20261107-drive2';
import {PhysicsSim,DEFAULTS} from './physics.js?v=20261110-space1';
import {FlightScene} from './scene.js?v=20261110-space1';

const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});
const renderStates=new RenderStateBuffer(sim);
let scene,landingUI,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='lab',camera='orbit',paused=true,showVectors=false;
let cityLoading=false,modeEpoch=0,cityDistance=0,driveInput={},driveGear='D';
let citySettings=normalizeCityExperiment({});
const brakeTrial=new CityBrakeTrial();
const driveKeys=new Set(),driver=new DrivingController(),worldUp=new Vector3(0,1,0);
let clearDriveInputs=()=>driveKeys.clear();
let landingLiftHeld=false,clearLandingLift=()=>{landingLiftHeld=false;};
const DRIVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyB','KeyH','KeyQ','KeyE','KeyF','ShiftLeft','ShiftRight']);
const cameraLabel=()=>camera==='top'?'상부 카메라':camera==='chase'?'추적 카메라':camera==='hood'?'운전석 카메라':'자유 카메라';
let landingSession=null,landingRun=null,lastResult=null,landingSerial=0;
let lastStamp=0,accumulator=0,lastUI=0,frames=0,frameTimer=0,toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setPaused(value){
  paused=value;if(value){clearLandingLift();clearDriveInputs();brakeTrial.cancel('paused');}accumulator=0;renderStates.reset(sim);
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').disabled=!landingRun&&mode!=='city';
  $('pause').setAttribute('aria-label',(mode==='city'?'주행':'실험')+(paused?' 재생':' 일시정지'));
  $('live-label').textContent=mode==='city'?(cityLoading?'도시 불러오는 중':paused?'일시정지':'강남역 자유 주행'):landingRun?(paused?'일시정지':'측정 중'):mode==='inspect'?'구조 탐색':'실험 준비';
}
function restoreLandingParams(session){
  const original={...session.originalParams};
  if(session.originalVehicle!==activeVehicle.id){
    const chassis=vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS);
    for(const key of ['dryMass','wheelRadius','wheelbase','trackWidth','bodyLength','bodyWidth','bodyHeight','bodyCenterY','inertiaRoll','inertiaYaw','inertiaPitch','liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ'])original[key]=chassis[key];
  }
  Object.assign(sim.params,original);
}
function cancelLanding(message='실험 중단 · 완료된 결과는 보존됩니다.'){
  if(!landingSession)return;
  const session=landingSession;landingSession=null;landingRun=null;restoreLandingParams(session);
  landingUI.setBusy(false,message);$('vehicle-select').disabled=vehicleLoading;setPaused(true);
}
function reset({cancel=true,clearMeasurement=true}={}){
  if(cancel)cancelLanding();
  clearDriveInputs();driver.reset();driveInput={};cityDistance=0;brakeTrial.reset({keepResults:true});
  const parameters=vehiclePhysics(activeVehicle,scene?.vehicle?.geometryParams,DEFAULTS);
  if(mode==='city')Object.assign(parameters,CITY_DRIVE_PARAMS,cityExperimentParams(citySettings));
  else Object.assign(parameters,{roadRoughness:0,aeroEnabled:false});
  Object.assign(sim.params,parameters);
  sim.setObstacles(mode==='city'?(scene.city?.obstacles||[]):[]);sim.reset('ground');
  if(mode==='city'&&scene.city){
    const spawn=scene.city.spawn;sim.state.pos.x=spawn.position[0];sim.state.pos.z=spawn.position[2];sim.state.q.setFromAxisAngle(worldUp,spawn.heading);
    scene.frameCityStart(sim);
  }
  if(clearMeasurement)lastResult=null;
  renderStates.reset(sim);accumulator=0;setPaused(mode!=='city'||cityLoading);
}
function stopLanding(){cancelLanding();reset({cancel:false});}
async function startLanding(kind){
  if(vehicleLoading)return;
  cancelLanding();if(mode!=='lab')setMode('lab');reset();
  const settings=landingUI.readOptions();
  const jobs=createLandingJobs(kind,VEHICLES,settings,activeVehicle.id);
  if(!jobs.length)return;
  landingSession={groupId:'landing-'+(++landingSerial),kind,settings,jobs,index:0,originalParams:{...sim.params},originalVehicle:activeVehicle.id};
  landingUI.setBusy(true,'차체 준비 중…');$('vehicle-select').disabled=true;
  await nextLanding(landingSession);
}
async function nextLanding(session){
  if(landingSession!==session)return;
  const job=session.jobs[session.index];
  if(!job){landingRun=null;setPaused(true);landingUI.setBusy(false,'비교 완료 · 결과를 확인하세요.');$('vehicle-select').disabled=false;landingUI.showResults();return;}
  setPaused(true);landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · 차체 준비 중…');
  try{
    if(!await selectVehicle(job.vehicleId,{forLanding:true}))throw new Error('차체를 불러오지 못했습니다.');
    if(landingSession!==session)return;
    Object.assign(sim.params,vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS),{
      tankVolume:session.originalParams.tankVolume,tankPressureMPa:session.originalParams.tankPressureMPa,initialTemperature:session.originalParams.initialTemperature});
    const trialSettings={...session.settings,...job,brakeHeight:job.brakeHeight??session.settings.brakeHeight,vehicleId:activeVehicle.id,title:activeVehicle.title};
    landingRun=createLandingRun(sim,trialSettings);
    lastResult=null;
    session.metadata={...session.settings,...job,method:job.method,brakeHeight:job.brakeHeight??session.settings.brakeHeight,groupId:session.groupId,groupSize:session.jobs.length,groupKind:session.kind,vehicleId:activeVehicle.id,vehicleTitle:activeVehicle.title,id:session.groupId+'-'+session.index,initialMass:sim.mass,initialGas:sim.initialGas,tankVolume:sim.params.tankVolume,tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature};
    scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);
    camera='orbit';scene.setCamera(camera);scene.frameLandingStart(sim);$('camera-label').textContent='자유 카메라';
    renderStates.reset(sim);setPaused(false);$('vehicle-select').disabled=true;
    landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · '+activeVehicle.title+' · 착지 중');
    if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');
  }catch(error){if(landingSession===session){cancelLanding('실험 중단 · '+error.message);reset({cancel:false});}console.error(error);}
}
function stepSimulation(){
  if(mode==='city'){
    driveInput=driver.update(driveKeys,sim,LANDING_STEP);if(driveInput.throttle)driveGear=driveInput.throttle<0?'R':'D';
    brakeTrial.sample(sim,{braking:driveKeys.has('KeyB'),drifting:driveKeys.has('ShiftLeft')||driveKeys.has('ShiftRight'),airborne:driver.airborne,settings:citySettings,vehicleId:activeVehicle.id});
    renderStates.beforeStep();sim.step(LANDING_STEP,driveInput);renderStates.afterStep(sim);
    cityDistance+=Math.hypot(sim.state.vel.x,sim.state.vel.z)*LANDING_STEP;return;
  }
  if(!landingRun)return;
  renderStates.beforeStep();sim.step(LANDING_STEP,landingRunInput(landingRun,sim,landingLiftHeld));renderStates.afterStep(sim);
  updateLandingRun(landingRun,sim,LANDING_STEP);
  if(landingRun.done){
    const session=landingSession;
    lastResult={...session.metadata,...landingRun.result,samples:landingRun.samples};landingUI.addResult(lastResult);
    landingRun=null;session.index++;setPaused(true);
    setTimeout(()=>nextLanding(session),0);
  }
}
function vehicleCredit(p){return '<a href="'+escape(p.source)+'" target="_blank" rel="noopener noreferrer">3D: '+escape(p.author)+'</a> · <a href="'+escape(p.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+escape(p.license)+'</a> · 수정 적용';}
async function selectVehicle(id,{forLanding=false}={}){
  if(vehicleLoading)return false;
  if(!forLanding)cancelLanding();
  const profile=vehicleProfile(id);vehicleLoading=true;setPaused(true);$('vehicle-select').disabled=true;$('city-vehicle-select').disabled=true;
  $('model-status').textContent=profile.short+' 불러오는 중…';
  try{
    const vehicle=await scene.loadVehicle(profile);activeVehicle=profile;
    Object.assign(sim.params,vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),{roadRoughness:0,aeroEnabled:false});reset({cancel:false});
    selectedPartId=null;$('part-card').hidden=true;$('part-search').value='';
    $('vehicle-title').innerHTML=escape(profile.brand)+' <em>'+escape(profile.model)+'</em>';
    $('model-status').textContent=profile.reference;$('vehicle-credit').innerHTML=vehicleCredit(profile);$('city-credit').innerHTML=vehicleCredit(profile);
    $('explode').value='0';$('explode-value').textContent='0%';refreshPartCatalog();scene.frameWholeVehicle({resetView:true});
    $('vehicle-select').value=profile.id;$('city-vehicle-select').value=profile.id;
    if(mode==='city'){camera='chase';scene.setCamera(camera);scene.frameCityStart(sim);$('camera-label').textContent=cameraLabel();$('world').focus({preventScroll:true});}
    if(!forLanding)toast(profile.title+' · 준비 완료');return true;
  }catch(error){$('vehicle-select').value=activeVehicle.id;$('model-status').textContent='차체 로드 실패 · 다시 선택해 주세요';console.error(error);return false;}
  finally{vehicleLoading=false;$('vehicle-select').disabled=!!landingSession&&landingSession.index<landingSession.jobs.length;$('city-vehicle-select').disabled=false;if(mode==='city'&&!cityLoading)setPaused(false);}
}
async function setMode(next){
  if(next===mode||!['lab','inspect','city'].includes(next))return;
  const epoch=++modeEpoch;cancelLanding();clearDriveInputs();driver.reset();mode=next;cityLoading=mode==='city'&&!scene.city;
  camera=mode==='city'?'chase':'orbit';setPaused(true);
  scene.setMode(mode);scene.setCamera(camera);scene.focusPart(null);
  document.body.classList.toggle('inspect',mode==='inspect');document.body.classList.toggle('city',mode==='city');
  $$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  $('inspect-panel').hidden=mode!=='inspect';$('lab-panel').hidden=mode!=='lab';$('part-card').hidden=true;selectedPartId=null;
  $('city-hud').hidden=mode!=='city';$('city-loading').hidden=!cityLoading;
  $('panel-toggle').textContent=mode==='inspect'?'☷ 부품 목록':'☷ 실험 설정';$('camera-label').textContent=cameraLabel();
  $('world').setAttribute('aria-label',mode==='city'?'강남역 실제 도로 기반 자유 주행':'착지 충격과 차체 구조를 관찰하는 3D 공간');
  if(mode==='city'){
    try{await scene.loadCity();if(epoch!==modeEpoch)return;cityLoading=false;$('city-loading').hidden=true;reset({cancel:false});$('world').focus({preventScroll:true});}
    catch(error){if(epoch===modeEpoch){cityLoading=false;console.error(error);setMode('lab');toast('도시를 불러오지 못했습니다. 다시 시도해 주세요.');}return;}
  }else{cityLoading=false;reset({cancel:false});renderPartCatalog();scene.frameWholeVehicle({resetView:true});}
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
  if(matchMedia('(max-width:1000px)').matches){$('left-panel').classList.remove('open');$('panel-toggle').textContent='☷ 부품 목록';}
}

function showCityExperiments(show){
  $('city-experiments').hidden=!show;$('city-experiments-toggle').setAttribute('aria-expanded',show);
  if(show){document.body.classList.remove('show-drive-controls');$('city-controls').setAttribute('aria-pressed',false);}
}
function syncCityExperimentInputs(){
  $('city-surface').value=citySettings.surface;$('city-crr').value=citySettings.rollingResistance;
  $('city-wind-x').value=citySettings.windX;$('city-wind-z').value=citySettings.windZ;
  $('city-roughness').value=citySettings.roadRoughness;$('city-aero').checked=citySettings.aeroEnabled;
  $('city-flight-steering').value=driver.flightSteering;$('city-flight-assist').checked=driver.flightAssist;
}
function setupCityExperiments(){
  $('city-experiments-toggle').addEventListener('click',()=>showCityExperiments($('city-experiments').hidden));
  $('city-experiments-close').addEventListener('click',()=>showCityExperiments(false));
  $('city-drive-focus').addEventListener('click',()=>{showCityExperiments(false);$('world').focus({preventScroll:true});});
  const applySettings=event=>{
    brakeTrial.cancel('settings-changed');
    citySettings=normalizeCityExperiment({surface:$('city-surface').value,rollingResistance:$('city-crr').value,
      aeroEnabled:$('city-aero').checked,windX:$('city-wind-x').value,windZ:$('city-wind-z').value,roadRoughness:$('city-roughness').value});
    if(mode==='city')Object.assign(sim.params,cityExperimentParams(citySettings));syncCityExperimentInputs();
    if(event?.target?.tagName==='SELECT'||event?.target?.type==='checkbox')$('world').focus({preventScroll:true});
  };
  for(const id of ['city-surface','city-crr','city-aero','city-wind-x','city-wind-z','city-roughness'])$(id).addEventListener('change',applySettings);
  const applyFlight=()=>{driver.setOptions({flightSteering:$('city-flight-steering').value,flightAssist:$('city-flight-assist').checked});$('world').focus({preventScroll:true});};
  $('city-flight-steering').addEventListener('change',applyFlight);$('city-flight-assist').addEventListener('change',applyFlight);
  $('city-settings-reset').addEventListener('click',()=>{brakeTrial.cancel('settings-changed');citySettings=normalizeCityExperiment({});driver.setOptions({flightSteering:'turn',flightAssist:true});if(mode==='city')Object.assign(sim.params,cityExperimentParams(citySettings));syncCityExperimentInputs();});
  $('city-apply-height').addEventListener('click',()=>{
    const height=Number($('city-target-height').value);
    if(mode!=='city'||vehicleLoading||cityLoading)return;
    if(!Number.isFinite(height)||height<.8){toast('유지 높이는 0.8 m 이상으로 입력하세요.');return;}
    clearDriveInputs();driver.setAltitudeTarget(height,sim);setPaused(false);$('world').focus({preventScroll:true});
  });
  $('city-land').addEventListener('click',()=>{if(mode==='city'&&!vehicleLoading&&!cityLoading){clearDriveInputs();driver.toggleLandingAssist(sim);if(paused)setPaused(false);$('world').focus({preventScroll:true});}});
  $('city-brake-clear').addEventListener('click',()=>brakeTrial.clear());
  $('city-brake-csv').addEventListener('click',()=>{
    const records=brakeTrial.getSnapshot().results;if(!records.length)return;
    const url=URL.createObjectURL(new Blob([brakeResultsCSV(records)],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='roadster-city-braking.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });syncCityExperimentInputs();
}
function updateCityExperiments(t){
  if($('city-experiments').hidden)return;
  $('city-friction-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';
  $('city-air-force').textContent=(t.airDragN/1000).toFixed(2)+' kN';
  $('city-rolling-force').textContent=(t.rollingResistanceN/1000).toFixed(2)+' kN';
  $('city-thrust-force').textContent=(t.thrustN/1000).toFixed(1)+' kN';
  $('city-contacts').textContent=t.contactCount+' / 4';$('city-gas-flow').textContent=t.massFlowKgS.toFixed(1)+' kg/s';
  const snapshot=brakeTrial.getSnapshot(),current=snapshot.current,last=snapshot.lastResult;
  const reason=code=>BRAKE_REASONS[code]||({paused:'일시정지'}[code])||'측정 중단';
  $('city-brake-status').textContent=current?'측정 중 · '+current.distance.toFixed(1)+' m / '+current.elapsed.toFixed(2)+' s':snapshot.status==='invalid'?'무효 · '+reason(snapshot.reason):snapshot.status==='complete'&&last?'제동 완료 · '+last.stoppingDistance.toFixed(1)+' m / '+last.stoppingTime.toFixed(2)+' s':'7.2 km/h 이상에서 B를 계속 눌러 정지하세요.';
  const rows=snapshot.results.slice().reverse().map(r=>{
    const surface=CITY_SURFACES.find(s=>s.id===r.settings.surface)?.label||r.settings.surface;
    return '<div class="'+(r.valid?'':'invalid')+'">'+escape(vehicleProfile(r.vehicleId).short)+' · '+escape(surface)+' · '+(r.initialSpeed*3.6).toFixed(1)+' km/h<br>'+(r.valid?r.stoppingDistance.toFixed(2)+' m · '+r.stoppingTime.toFixed(2)+' s · 최대 감속 '+r.maxDeceleration.toFixed(1)+' m/s²':'무효: '+reason(r.reason))+'</div>';
  }).join('');
  if($('city-brake-history').innerHTML!==rows)$('city-brake-history').innerHTML=rows;
  $('city-brake-csv').disabled=!snapshot.results.length;$('city-brake-clear').disabled=!snapshot.results.length;
}

function setupDriveControls(){
  const editable=target=>target?.matches?.('input,textarea,select,[contenteditable="true"]');
  const buttons=$$('[data-drive]'),keyboardKeys=new Set(),pointers=new Map();
  const nativeClear=driveKeys.clear.bind(driveKeys);
  const sync=()=>{
    nativeClear();
    for(const code of keyboardKeys)driveKeys.add(code);
    for(const pointer of pointers.values())driveKeys.add(pointer.code);
    for(const button of buttons){
      if(driveKeys.has(button.dataset.drive))button.classList.add('held');
      else button.classList.remove('held');
    }
  };
  const clear=()=>{keyboardKeys.clear();pointers.clear();sync();};
  // Resets, pauses and focus changes clear the contributing sources as well
  // as the shared input Set, preventing stale input from reappearing later.
  clearDriveInputs=clear;
  const readyToDrive=()=>{
    if(mode!=='city'||cityLoading||vehicleLoading||document.querySelector('dialog[open]'))return false;
    if(paused)setPaused(false);
    return true;
  };
  window.addEventListener('keydown',e=>{
    if(mode==='city'&&e.code==='Enter'&&e.target?.matches?.('input[type="number"]')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){
      e.preventDefault();clear();$('world').focus({preventScroll:true});return;
    }
    if(mode!=='city'||!DRIVE_KEYS.has(e.code)||editable(e.target)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();if(readyToDrive()){keyboardKeys.add(e.code);sync();}
  });
  window.addEventListener('keyup',e=>{if(DRIVE_KEYS.has(e.code)){keyboardKeys.delete(e.code);sync();if(mode==='city'&&!editable(e.target))e.preventDefault();}});
  window.addEventListener('blur',clear);
  document.addEventListener('focusin',e=>{if(mode==='city'&&editable(e.target))clear();});
  buttons.forEach(button=>{
    const release=e=>{
      if(e?.pointerId!==undefined){if(pointers.get(e.pointerId)?.button===button)pointers.delete(e.pointerId);}
      else for(const [id,pointer] of pointers)if(pointer.button===button)pointers.delete(id);
      sync();
    };
    button.addEventListener('pointerdown',e=>{
      if(!readyToDrive())return;e.preventDefault();$('world').focus({preventScroll:true});
      button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{code:button.dataset.drive,button});sync();
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release);
  });
}
function drawCityMap(t){
  const city=scene.city;if(!city)return;
  const canvas=$('city-map'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=.53;
  const x=sim.state.pos.x,z=sim.state.pos.z;
  ctx.clearRect(0,0,w,h);ctx.fillStyle='#142029';ctx.fillRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);
  for(const road of city.roads||[]){
    if(!road.points?.length)continue;ctx.beginPath();ctx.strokeStyle=road.width>14?'#839197':'#4e626d';ctx.lineWidth=Math.max(1.5,road.width*scale*.6);
    for(let i=0;i<road.points.length;i++){const px=(road.points[i][0]-x)*scale,py=(road.points[i][1]-z)*scale;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();
  }
  ctx.rotate(Math.PI/2-t.attitude.yaw);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-6,6);ctx.lineTo(0,3);ctx.lineTo(6,6);ctx.closePath();ctx.fillStyle='#8bffe0';ctx.fill();ctx.restore();
  ctx.font='bold 12px sans-serif';ctx.fillStyle='#dce7e9';ctx.fillText('N',w-17,18);
}
function updateCityHUD(t){
  $('city-camera').textContent=camera==='orbit'?'◉ 자유':camera==='hood'?'◉ 전방':'◉ 추적';
  $('city-speed').textContent=Math.round(t.horizontalSpeed*3.6);$('city-gear').textContent=t.horizontalSpeed<.1&&!driveInput.throttle?'N':driveGear;
  const forward=new Vector3(1,0,0).applyQuaternion(sim.state.q),acceleration=t.acceleration.dot(forward);
  $('city-acceleration').textContent=(acceleration>=0?'+':'')+acceleration.toFixed(1)+' m/s²';
  $('city-distance').textContent=(cityDistance/1000).toFixed(2)+' km · 탱크 '+t.pressureMPa.toFixed(1)+' MPa';
  $('city-motion').textContent=paused?'일시정지':driver.landingAssist?'착지 보조':t.saturation&&driver.airborne?'추력 한계':driveInput.airBrake?'공중 제동':driveInput.lift?'상승 분사':driver.altHold?'고도 유지':driveInput.handbrake?'드리프트':driveInput.boost?'F 추진 가속':driver.airborne?'자유 비행':t.horizontalSpeed<.1&&!driveInput.throttle?'정지 유지':driveInput.brake>.3?'제동':driveInput.corneringAssist?'코너링 보조':driveInput.throttle?'가속':driveInput.brake>0?'페달 해제 감속':'타력';
  $('city-altitude').textContent=Math.max(0,landingClearance(sim)).toFixed(1)+' m';
  $('city-vertical').textContent=(t.verticalSpeed>=0?'+':'')+t.verticalSpeed.toFixed(1)+' m/s';
  $('city-gas').textContent=t.gasKg.toFixed(0)+' kg';
  const steering=sim.wheels.slice(0,2).reduce((sum,w)=>sum+w.steer,0)*90/Math.PI;
  $('city-steering').textContent=(steering>.5?'좌 ':steering<-.5?'우 ':'조향 ')+Math.abs(steering).toFixed(0)+'°';
  const surfaceLabel={dry:'건조',wet:'젖음',ice:'빙판',none:'무마찰'}[citySettings.surface];
  $('city-drive-state').textContent=driver.airborne?(driver.flightSteering==='turn'?'비행 · A/D 선회':'비행 · A/D 옆이동'):'지상 · '+surfaceLabel+' μ '+sim.params.friction.toFixed(2);
  $('city-drive-state').classList.toggle('city-surface-slippery',!driver.airborne&&sim.params.friction<.7);
  const heading=(90-t.attitude.yaw*180/Math.PI+360)%360;
  $('city-heading').textContent='방향 '+heading.toFixed(0)+'°';
  const left=driveKeys.has('KeyA')||driveKeys.has('ArrowLeft'),right=driveKeys.has('KeyD')||driveKeys.has('ArrowRight');
  const steeringHeld=left!==right,editing=document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  $('city-key-hint').textContent=editing?'입력 중 · Enter 운전':driver.airborne?'Q/E 회전 · H 높이 유지':steeringHeld?(left?'A ←':'D →')+' · '+(driveKeys.has('KeyB')?'B 제동':driveInput.handbrake?'Shift 드리프트':driveKeys.has('KeyF')?'F 가속':driveKeys.has('KeyW')?'W 가속':driveKeys.has('KeyS')?'S 후진':t.horizontalSpeed<.3?'W/S로 출발':'조향 중'):t.horizontalSpeed<.3?'W/S와 함께 A/D 조향':'WASD · F 가속 · Shift 드리프트';
  $('city-key-hint').classList.toggle('city-key-hint-active',!editing&&steeringHeld);
  $('city-land').textContent=driver.landingAssist?'착지 중 · 취소':'착지 보조';$('city-land').setAttribute('aria-pressed',driver.landingAssist);
  $('city-hover').textContent=driver.altHold?'H 유지 '+driver.targetHeight.toFixed(1)+' m'+(t.saturation?' · 추력 한계':''):'H 고도 유지';
  $('city-hover').setAttribute('aria-pressed',driver.altHold);
  $('city-flight-status').textContent=paused?'운전 키를 누르면 재개 · R 지상 복귀':t.status==='GAS DEPLETED'?'기체 소진 · R 재충전':driver.airborne?(driver.flightSteering==='turn'?'W/S 추진 · A/D 선회 · Q/E 회전':'WASD 수평 이동 · Q/E 회전'):'W 전진 · F 가속 · Shift 드리프트 · B 제동';
  $('city-throttle').style.width=(Math.abs(driveInput.throttle||0)*100)+'%';$('city-brake').style.width=(Math.max(driveInput.brake||0,driveInput.handbrake||0)*100)+'%';
  $('city-road').textContent=scene.city?.nearestRoadName?.(sim.state.pos.x,sim.state.pos.z)||'강남역 · 서울';
  updateCityExperiments(t);
  const b=scene.city?.bounds,p=sim.state.pos;
  $('city-boundary').hidden=!b||(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ);
  drawCityMap(t);
}

function updateUI(){
  const t=sim.telemetry(),run=landingRun||lastResult;
  if(mode==='city'){updateCityHUD(t);return;}
  $('altitude').innerHTML=Math.max(0,landingClearance(sim)).toFixed(2)+' <small>m</small>';
  $('vertical').innerHTML=(t.verticalSpeed>=0?'+':'')+t.verticalSpeed.toFixed(2)+' <small>m/s</small>';
  const force=Math.max(0,sim.groundForceN)+Math.max(0,sim.groundCorrectionImpulseNs)/LANDING_STEP;
  $('ground-force').innerHTML=(force/1000).toFixed(2)+' <small>kN</small>';
  $('peak-force').textContent=run?(run.peakEquivalentGroundForceN/1000).toFixed(2)+' kN':'—';
  $('peak-g').textContent=run&&run.touchdownTime!==null?run.contactPeakG.toFixed(2)+' g':'—';
  $('touchdown-speed').textContent=Number.isFinite(run?.touchdownSpeed)?run.touchdownSpeed.toFixed(2)+' m/s':'—';
  $('compression').textContent=run?(run.maxCompression*1000).toFixed(0)+' mm':'—';
  $('thrust').textContent=(t.thrustN/1000).toFixed(1)+' kN';$('gas').textContent=t.gasKg.toFixed(1)+' kg';
  $('mass').textContent=Math.round(t.totalMass).toLocaleString('en-US')+' kg';$('contact-count').textContent=t.contactCount+' / 4';
  $('sim-time').textContent=sim.state.time.toFixed(2)+' s';
  const liftReady=mode==='lab'&&!!landingRun&&!paused&&!vehicleLoading&&landingRun.touchdownTime===null;
  $('landing-lift').disabled=!liftReady;
  if(!liftReady&&landingLiftHeld)clearLandingLift();
  $('landing-lift-status').textContent=landingRun?.manualLiftUsed?'수동 분사 '+landingRun.manualLiftDuration.toFixed(2)+' s · 자동 비교에서 제외':'실험 시작 후, 지면에 닿기 전 사용';
  $('status-badge').textContent=landingRun?(paused?'일시정지':landingLiftHeld?'수동 분사':t.contactCount?'접촉':'하강'):lastResult?'측정 완료':'준비';
}
function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  $('guide-content').innerHTML=tab==='sources'?'<p>실차 외형 · 공통 가상 착지 장치 · <a href="./assets/vehicles/vehicle-specifications.md" target="_blank" rel="noopener noreferrer">제원 기준</a></p>'+'<p>환경: <a href="./assets/environment/sky/LICENSE.txt" target="_blank" rel="noopener noreferrer">촬영 하늘</a> · <a href="./assets/environment/road/LICENSE.txt" target="_blank" rel="noopener noreferrer">도로 재질</a>  · <a href="./assets/trees/LICENSE.txt" target="_blank" rel="noopener noreferrer">나무 모델</a> · Poly Haven CC0</p><p>강남 건물: <a href="./assets/city-buildings/README.txt" target="_blank" rel="noopener noreferrer">공식 건축 자료와 OSM에 기반한 재현 모델 · 출처</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join(''):'<ol><li>차체와 출발 높이를 선택합니다.</li><li>자유 낙하·추력 제동·완만한 하강을 비교합니다.</li><li>제동 높이와 서스펜션을 바꿔 충격을 줄이는 조건을 찾습니다.</li><li>비교 결과의 그래프와 CSV로 측정값을 확인합니다.</li></ol><p>드래그: 시점 회전 · P: 실험 일시정지 · C: 카메라 · V: 힘 벡터 · R: 초기화</p><p>구조 탐색에서 스크롤하면 분해·조립합니다. 도시 주행: W/↑ 가속, S/↓ 제동·후진, A/D 방향, B 제동. Space 상승, F 추진 가속 · Shift 드리프트, H 현재 고도 유지. 공중 기본 A/D는 차체 방향 전환, W/S는 전후 추진입니다. 실험 패널에서 A/D를 수평 옆이동으로 바꿀 수 있습니다. Q/E는 기수 회전, 화살표는 자세 제어입니다. 조작 중 높이 보정은 기체를 사용하며 H는 지속적인 높이 유지입니다. 착지 보조는 수평 속도를 줄여 하강하며 수동 키를 누르면 해제됩니다. B는 기체를 써서 공중 감속하며 가스가 떨어지면 제어할 수 없습니다. 드래그 시점 회전, 휠 확대, C 카메라, R 복귀·재충전. 화면의 조작 버튼으로도 사용할 수 있습니다. 실험 패널에서 노면·구름저항·항력·바람을 바꾸고 같은 속도에서 B를 눌러 제동거리를 비교합니다.</p>';
}
function openGuide(tab='controls'){renderGuide(tab);$('guide-modal').showModal();}
function focusApparatus(id){
  if(!scene.getPartCatalog().some(p=>p.id===id))return;
  $('show-hypotheses').checked=true;scene.setHypothesesVisible(true);$('part-search').value='';$('part-category').value='';
  refreshPartCatalog();scene.setExplode(.65,true);scene.focusPart(id);if(scene.isolatedPartId!==id)scene.isolatePart(id);selectPart(id);scene.frameSelectedPart();
}
function setupUI(){
  $('vehicle-select').innerHTML=VEHICLES.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+'</option>').join('');
  landingUI=new LandingUI({vehicles:VEHICLES,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onCompareFleetMethods:()=>startLanding('fleet-methods'),onCompareBrakeHeights:()=>startLanding('brake-heights'),onStop:stopLanding});
  $('city-vehicle-select').innerHTML=$('vehicle-select').innerHTML;
  $('city-vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $('city-reset').addEventListener('click',()=>reset());
  $('city-controls').addEventListener('click',()=>{showCityExperiments(false);const shown=document.body.classList.toggle('show-drive-controls');$('city-controls').setAttribute('aria-pressed',shown);});
  $('city-camera').addEventListener('click',()=>$('camera').click());
  $('city-hover').addEventListener('click',()=>{if(mode==='city'&&!cityLoading&&!vehicleLoading){if(paused)setPaused(false);driver.toggleAltitudeHold(sim);}});
  $('city-vectors').addEventListener('click',()=>$('vectors').click());
  document.querySelectorAll('[data-paint]').forEach(button=>button.addEventListener('click',()=>{$('city-paint').value=button.dataset.paint;$('world').focus({preventScroll:true});}));
  $('city-paint').addEventListener('change',()=>{$('world').focus({preventScroll:true});});
  clearLandingLift=bindLandingLiftControls({window,document,button:$('landing-lift'),
    isReady:()=>mode==='lab'&&!!landingRun&&!paused&&!vehicleLoading&&!document.hidden&&!document.querySelector('dialog[open]')&&landingRun.touchdownTime===null,
    onChange:held=>{landingLiftHeld=held;$('landing-lift').setAttribute('aria-pressed',String(held));}
  });
  setupDriveControls();
  setupCityExperiments();
  $('vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('pause').addEventListener('click',()=>{if(landingRun||mode==='city'){clearDriveInputs();setPaused(!paused)};});
  $('reset').addEventListener('click',()=>{reset();scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);if(mode==='city')scene.frameCityStart(sim);else scene.frameWholeVehicle({resetView:true});selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();toast('초기화 · 비교 기록은 유지됩니다.');});
  $('help').addEventListener('click',()=>openGuide());$('about-link').addEventListener('click',()=>openGuide('sources'));
  $$('[data-guide]').forEach(b=>b.addEventListener('click',()=>renderGuide(b.dataset.guide)));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('panel-toggle').addEventListener('click',()=>$('left-panel').classList.toggle('open'));
  $('vectors').addEventListener('click',()=>{showVectors=!showVectors;$('vectors').setAttribute('aria-pressed',showVectors);$('city-vectors').setAttribute('aria-pressed',showVectors);});
  $('camera').addEventListener('click',()=>{if(mode==='inspect'){camera='orbit';scene.frameWholeVehicle({resetView:true});}else if(mode==='city')camera=camera==='chase'?'hood':camera==='hood'?'orbit':'chase';else camera=camera==='orbit'?'top':'orbit';scene.setCamera(camera);$('camera-label').textContent=cameraLabel();});
  $('explode').addEventListener('input',()=>{const value=Number($('explode').value);scene.setExplode(value);$('explode-value').textContent=Math.round(value*100)+'%';});
  $('tank-focus').addEventListener('click',()=>focusApparatus('tank'));
  $$('[data-focus-part]').forEach(b=>b.addEventListener('click',()=>focusApparatus(b.dataset.focusPart)));
  $('part-search').addEventListener('input',renderPartCatalog);$('part-category').addEventListener('change',renderPartCatalog);
  $('show-hypotheses').addEventListener('change',()=>{scene.setHypothesesVisible($('show-hypotheses').checked);if(scene.getPartCatalog().some(p=>p.id===selectedPartId&&p.kind==='hypothesis')){$('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);}refreshPartCatalog();});
  $('part-buttons').addEventListener('click',e=>{const button=e.target.closest('[data-part]');if(button){scene.focusPart(button.dataset.part);selectPart(button.dataset.part);}});
  $('part-zoom').addEventListener('click',()=>scene.frameSelectedPart());
  $('part-hide').addEventListener('click',()=>{scene.togglePartVisibility(selectedPartId);renderPartCatalog();});
  $('part-isolate').addEventListener('click',()=>{scene.isolatePart(selectedPartId);renderPartCatalog();});
  $('parts-restore').addEventListener('click',()=>{scene.restoreParts();$('part-search').value='';$('part-category').value='';renderPartCatalog();});
  $('parts-assemble').addEventListener('click',()=>{scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);scene.frameWholeVehicle({resetView:true});selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();});
  $('part-close').addEventListener('click',()=>{$('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);renderPartCatalog();});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();$('left-panel').classList.remove('open');showCityExperiments(false);$('world').focus({preventScroll:true});return;}
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat||e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(e.code==='KeyP'&&(landingRun||mode==='city')){e.preventDefault();setPaused(!paused);}
    else if(e.code==='KeyR')$('reset').click();else if(e.code==='KeyC')$('camera').click();else if(e.code==='KeyV')$('vectors').click();
    else if(e.code==='Escape'){$('left-panel').classList.remove('open');showCityExperiments(false);}
  });
  document.addEventListener('visibilitychange',()=>{clearDriveInputs();accumulator=0;renderStates.reset(sim);lastStamp=0;});
  window.addEventListener('resize',()=>{scene.resize();if(landingRun&&matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');});
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));$('world').addEventListener('contextmenu',e=>e.preventDefault());
  scene.setHypothesesVisible(true);refreshPartCatalog();
  if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.add('open');
}
function animate(stamp){
  const frameMs=lastStamp?stamp-lastStamp:16.67,elapsed=lastStamp?Math.min((stamp-lastStamp)/1000,.1):1/60;lastStamp=stamp;
  const blocked=!!document.querySelector('dialog[open]');
  if(blocked&&landingLiftHeld)clearLandingLift();
  if(((landingRun&&mode==='lab')||mode==='city')&&!vehicleLoading&&!cityLoading&&!paused&&!blocked&&!document.hidden){accumulator+=elapsed;let steps=0;while(accumulator>=LANDING_STEP&&steps<50&&!paused){stepSimulation();accumulator=Math.max(0,accumulator-LANDING_STEP);steps++;}}else accumulator=0;
  if(!document.hidden)scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint:$('city-paint').value,wing:false,cutaway:false,renderState:renderStates.sample(paused||mode==='inspect'||blocked?1:accumulator/LANDING_STEP)});
  if(stamp-lastUI>80){updateUI();lastUI=stamp;}frames++;frameTimer+=elapsed;
  if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent=cameraLabel();});
  scene.setMode('lab');scene.setCamera(camera);setupUI();sim.setObstacles([]);updateUI();requestAnimationFrame(animate);selectVehicle('roadster');
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
}catch(error){console.error(error);$('boot-message').textContent='3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';}
