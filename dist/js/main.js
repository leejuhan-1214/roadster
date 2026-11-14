import {RechargeReadout} from './recharge-readout.js?v=20261115-calibrated1';
import {Vector3} from 'three';
import {bindLandingLiftControls} from './landing-controls.js?v=20261110-seoul1';
import {CITY_SURFACES,BRAKE_REASONS,normalizeCityExperiment,cityExperimentParams,CityBrakeTrial,brakeResultsCSV} from './city-experiment.js?v=20261114-air1';
import {DrivingController,CITY_DRIVE_PARAMS} from './driving-input.js?v=20261115-jet1';
import {VEHICLES,vehicleProfile,vehiclePhysics} from './jet-vehicle.js?v=20261115-jet1';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from './landing-experiment.js?v=20261115-jet1';
import {LandingUI} from './landing-ui.js?v=20261115-jet1';
import {LandingLiveUI,landingPhaseLabel} from './landing-live.js?v=20261115-jet1';
import {RenderStateBuffer} from './render-state.js?v=20261115-jet1';
import {PhysicsSim,DEFAULTS} from './physics.js?v=20261115-jet1';
import {FlightScene} from './scene.js?v=20261115-jet1';

import {experimentVehicles,experimentMass} from './experiment-vehicles.js?v=20261115-jet1';
import {searchCityVehicles,vehicleOptionsForMode} from './vehicle-catalog.js?v=20261111-cockpit1';

const EXPERIMENT_VEHICLES=experimentVehicles(VEHICLES),experimentIds=new Set(EXPERIMENT_VEHICLES.map(v=>v.id));
let lastLabVehicleId='roadster',vehicleLoadTask=null;
const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});
const renderStates=new RenderStateBuffer(sim);
let landingLiveUI,landingLearningVisible=true,landingPlaybackRate=1;
let scene,landingUI,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='lab',camera='orbit',paused=true,showVectors=false;
let cockpitPanelsOpen=false,lastCockpitView=false;
let cityLoading=false,modeEpoch=0,cityDistance=0,driveInput={},driveGear='D';
let citySettings=normalizeCityExperiment({});
const brakeTrial=new CityBrakeTrial();
const driveKeys=new Set(),driver=new DrivingController(),worldUp=new Vector3(0,1,0);
let clearDriveInputs=()=>driveKeys.clear();
let landingLiftHeld=false,clearLandingLift=()=>{landingLiftHeld=false;};
const rechargeReadout=new RechargeReadout();
const DRIVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyB','KeyH','KeyQ','KeyE','KeyF','KeyX','ShiftLeft','ShiftRight']);
const cameraLabel=()=>mode==='lab'?'시점 복원':camera==='top'?'상부 카메라':camera==='chase'?'추적 카메라':camera==='hood'?'운전석 카메라':'자유 카메라';
let landingSession=null,landingRun=null,lastResult=null,landingSerial=0;
const freeDriving=()=>mode==='city'||(mode==='lab'&&!landingSession);
let lastStamp=0,accumulator=0,lastUI=0,frames=0,frameTimer=0,toastTimer,lastManeuverNotice='idle';
const maneuverLabels={response:'제트엔진의 5초 응답으로 자동 공중제비를 지원하지 않습니다',profile:'이 차체의 추진 장치를 확인하세요',thrust:'현재 추력·응답 여유로는 공중제비를 시작할 수 없어요',height:'8 m 이상 상승한 뒤 X를 누르세요',gas:'공중제비에 필요한 연료가 부족해요',momentum:'상승 중 X · 수직 속도 7 m/s 이상',attitude:'수평 자세로 안정된 뒤 X를 누르세요',prepare:'공중제비 · 상승 여유 확보',rolling:'공중제비 · 회전 중',recovering:'공중제비 · 자세 회복',complete:'공중제비 완료 · 수평 자세 회복',cancelled:'공중제비 취소',contact:'지면 접촉 · 회전 종료',unavailable:'지금은 공중제비를 시작할 수 없어요'};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setPaused(value){
  paused=value;if(!value&&landingSession)landingSession.singleStepping=false;if(value){clearLandingLift();clearDriveInputs();brakeTrial.cancel('paused');}accumulator=0;renderStates.reset(sim);
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').disabled=!landingRun&&!freeDriving();
  $('pause').setAttribute('aria-label',(mode==='city'?'주행':'실험')+(paused?' 재생':' 일시정지'));
  $('live-label').textContent=mode==='city'?(cityLoading?'도시 불러오는 중':paused?'일시정지':'강남역 자유 주행'):landingRun?(paused?'일시정지':'측정 중'):mode==='inspect'?'구조 탐색':freeDriving()?'자유 조종':'실험 준비';
}
function restoreLandingParams(session){
  const original={...session.originalParams};
  if(session.originalVehicle!==activeVehicle.id){
    const chassis=vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS);
    for(const key of ['dryMass','wheelRadius','wheelbase','trackWidth','bodyLength','bodyWidth','bodyHeight','bodyCenterY','inertiaRoll','inertiaYaw','inertiaPitch','liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ','propulsionProfile'])original[key]=chassis[key];
  }
  Object.assign(sim.params,original);
}
function cancelLanding(message='실험 준비'){
  if(!landingSession)return;
  const session=landingSession;landingSession=null;landingRun=null;restoreLandingParams(session);
  landingUI.setBusy(false,message);$('vehicle-select').disabled=vehicleLoading;setPaused(true);
}
function reset({cancel=true,clearMeasurement=true}={}){
  if(cancel)cancelLanding();
  clearDriveInputs();driver.reset();driveInput={};cityDistance=0;brakeTrial.reset({keepResults:true});
  const parameters=vehiclePhysics(activeVehicle,scene?.vehicle?.geometryParams,DEFAULTS);
  if(freeDriving())Object.assign(parameters,CITY_DRIVE_PARAMS,mode==='city'?cityExperimentParams(citySettings):{});
  else Object.assign(parameters,{roadRoughness:0,aeroEnabled:false});
  if(mode==='lab'&&!landingSession)parameters.friction=Number($('lab-surface').value);
  Object.assign(sim.params,parameters);
  sim.setObstacles(mode==='city'?(scene.city?.obstacles||[]):[]);scene.city?.streaming?.bindPhysics(mode==='city'?sim:null);sim.reset('ground');sim.primeJetIdle?.();
  if(mode==='city'&&scene.city){
    const spawn=scene.city.spawn;sim.state.pos.x=spawn.position[0];sim.state.pos.z=spawn.position[2];sim.state.q.setFromAxisAngle(worldUp,spawn.heading);
    scene.frameCityStart(sim);
  }
  if(clearMeasurement)lastResult=null;
  scene?.setLandingExperiment(null);
  renderStates.reset(sim);accumulator=0;setPaused(mode==='inspect'||cityLoading||!!landingSession?.singleStepping);
}
function restoreLabView({resetView=true}={}){
  camera='orbit';scene.setCamera(camera);
  if(landingRun||lastResult)scene.frameLandingStart(sim,{resetView});
  else scene.frameLabVehicle(sim,{resetView});
  $('camera-label').textContent=cameraLabel();
}
function stopLanding(){cancelLanding();reset({cancel:false});restoreLabView();}
async function startLanding(kind){
  if(vehicleLoading)return;
  cancelLanding();if(mode!=='lab')await setMode('lab');if(mode!=='lab'||vehicleLoading)return;
  if(!experimentIds.has(activeVehicle.id)){toast('실험용 5종 중 차체를 선택해 주세요.');return;}
  reset();
  const settings=landingUI.readOptions();
  const jobs=createLandingJobs(kind,EXPERIMENT_VEHICLES,settings,activeVehicle.id);
  if(!jobs.length)return;
  landingSession={groupId:'landing-'+(++landingSerial),kind,settings,jobs,index:0,originalParams:{...sim.params},originalVehicle:activeVehicle.id};
  landingUI.setBusy(true,'차체 준비 중…');$('vehicle-select').disabled=true;
  await nextLanding(landingSession);
}
async function nextLanding(session){
  if(landingSession!==session)return;
  const job=session.jobs[session.index];
  if(!job){landingRun=null;setPaused(true);landingUI.setBusy(false,'측정 완료');$('vehicle-select').disabled=false;landingUI.showResults();return;}
  setPaused(true);landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · 차체 준비 중…');
  try{
    if(!await selectVehicle(job.vehicleId,{forLanding:true}))throw new Error('차체를 불러오지 못했습니다.');
    if(landingSession!==session)return;
    Object.assign(sim.params,vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS),{
      tankVolume:session.originalParams.tankVolume,tankPressureMPa:session.originalParams.tankPressureMPa,initialTemperature:session.originalParams.initialTemperature});
    const trialSettings={...session.settings,...job,brakeHeight:job.brakeHeight??session.settings.brakeHeight,vehicleId:activeVehicle.id,title:activeVehicle.title};
    landingRun=createLandingRun(sim,trialSettings);
    scene.setLandingExperiment(trialSettings);
    lastResult=null;
    session.metadata={...session.settings,...job,method:job.method,brakeHeight:job.brakeHeight??session.settings.brakeHeight,groupId:session.groupId,groupSize:session.jobs.length,groupKind:session.kind,vehicleId:activeVehicle.id,vehicleTitle:activeVehicle.title,id:session.groupId+'-'+session.index,initialMass:sim.mass,initialGas:sim.initialGas,tankVolume:sim.params.tankVolume,tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature};
    scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);
    if(matchMedia('(max-width:1000px)').matches)setSettingsPanel(false);
    restoreLabView({resetView:session.index===0});
    renderStates.reset(sim);setPaused(!!session.singleStepping);$('vehicle-select').disabled=true;
    landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · '+activeVehicle.title+' · 착지 중');
  }catch(error){if(landingSession===session){cancelLanding('실험 중단 · '+error.message);reset({cancel:false});}console.error(error);}
}
function stepSimulation(){
  if(freeDriving()){
    driveInput=driver.update(driveKeys,sim,LANDING_STEP);if(mode!=='city'){driveInput.fan=false;driveInput.compressor=false;}if(driveInput.throttle)driveGear=driveInput.throttle<0?'R':'D';
    brakeTrial.sample(sim,{braking:driveKeys.has('KeyB'),drifting:driveKeys.has('ShiftLeft')||driveKeys.has('ShiftRight'),airborne:driver.airborne,settings:citySettings,vehicleId:activeVehicle.id});
    const previousX=sim.state.pos.x,previousZ=sim.state.pos.z;
    renderStates.beforeStep();sim.step(LANDING_STEP,driveInput);
    if(mode==='city'&&scene.city?.streaming&&!scene.city.streaming.guard(sim.state,LANDING_STEP)){sim.state.pos.x=previousX;sim.state.pos.z=previousZ;}
    renderStates.afterStep(sim);
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
function refreshVehiclePicker(){
  const choices=vehicleOptionsForMode(mode,VEHICLES,EXPERIMENT_VEHICLES);
  $('vehicle-select').innerHTML=choices.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+(mode==='lab'?' · '+Math.round(experimentMass(v).total).toLocaleString('ko-KR')+' kg':'')+'</option>').join('');
  $('vehicle-select').value=activeVehicle.id;
  $('vehicle-picker-label').textContent=mode==='lab'?'실험 차체 · 5종':'차체 선택';
  const info=experimentIds.has(activeVehicle.id)?experimentMass(activeVehicle):null;
  $('lab-mass').hidden=mode!=='lab'||!info;
  if(info){$('lab-mass-total').textContent=Math.round(info.total).toLocaleString('ko-KR')+' kg';$('lab-mass-detail').textContent='차체·장치 '+Math.round(activeVehicle.dryMass).toLocaleString('ko-KR')+' + 연료 '+Math.round(info.gas)+' kg'+(info.assumed?' · 차체 질량 가정':'')+' · 엔진 770 + 구조·탱크·전장 206 kg 포함';}
}
function renderCityVehicleOptions(){
  const matches=searchCityVehicles(VEHICLES,$('city-vehicle-search').value),groups=new Map();
  for(const v of matches){if(!groups.has(v.brand))groups.set(v.brand,[]);groups.get(v.brand).push(v);}
  const option=v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+'</option>';
  let content=matches.some(v=>v.id===activeVehicle.id)?'':'<optgroup label="현재 차량">'+option(activeVehicle)+'</optgroup>';
  for(const [brand,cars]of [...groups].sort((a,b)=>a[0].localeCompare(b[0])))content+='<optgroup label="'+escape(brand)+'">'+cars.map(option).join('')+'</optgroup>';
  $('city-vehicle-select').innerHTML=content;$('city-vehicle-select').value=activeVehicle.id;
  $('city-fleet-count').textContent=matches.length===VEHICLES.length?VEHICLES.length+'종':matches.length+' / '+VEHICLES.length+'종';
}

function vehicleCredit(p){return '<a href="'+escape(p.source)+'" target="_blank" rel="noopener noreferrer">'+'3D: '+escape(p.author)+'</a> · <a href="'+escape(p.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+escape(p.license)+'</a>'+' · 수정 적용';}
async function selectVehicle(id,{forLanding=false}={}){
  if(vehicleLoading)return false;
  if(!forLanding)cancelLanding();
  const profile=vehicleProfile(id);vehicleLoading=true;setPaused(true);$('vehicle-select').disabled=true;$('city-vehicle-select').disabled=true;
  $('model-status').hidden=false;$('model-status').textContent=profile.short+' 불러오는 중…';
  try{
    vehicleLoadTask=scene.loadVehicle(profile);const vehicle=await vehicleLoadTask;activeVehicle=profile;
    if(mode==='lab'&&experimentIds.has(profile.id))lastLabVehicleId=profile.id;
    Object.assign(sim.params,vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),{roadRoughness:0,aeroEnabled:false});reset({cancel:false});
    selectedPartId=null;$('part-card').hidden=true;$('part-search').value='';
    $('vehicle-title').innerHTML=escape(profile.brand)+' <em>'+escape(profile.model)+'</em>';
    $('model-status').hidden=mode==='lab';$('model-status').textContent=profile.reference;$('vehicle-credit').innerHTML=vehicleCredit(profile);$('city-credit').innerHTML=vehicleCredit(profile);
    $('explode').value='0';$('explode-value').textContent='0%';refreshPartCatalog();if(!forLanding){if(mode==='lab')restoreLabView();else scene.frameWholeVehicle({resetView:true});}
    refreshVehiclePicker();renderCityVehicleOptions();
    if(mode==='city'){camera=camera==='hood'?'hood':'chase';scene.setCamera(camera);scene.frameCityStart(sim);$('camera-label').textContent=cameraLabel();$('world').focus({preventScroll:true});}
    if(!forLanding)toast(profile.title+' · 준비 완료');return true;
  }catch(error){$('vehicle-select').value=activeVehicle.id;$('city-vehicle-select').value=activeVehicle.id;$('model-status').hidden=false;$('model-status').textContent='차체 로드 실패 · 다시 선택해 주세요';console.error(error);return false;}
  finally{vehicleLoadTask=null;vehicleLoading=false;$('vehicle-select').disabled=!!landingSession&&landingSession.index<landingSession.jobs.length;$('city-vehicle-select').disabled=false;if(mode==='city'&&!cityLoading)setPaused(false);}
}
async function setMode(next){
  if(next===mode||!['lab','inspect','city'].includes(next))return;
  const previousMode=mode,epoch=++modeEpoch;cancelLanding();clearDriveInputs();driver.reset();mode=next;cityLoading=mode==='city'&&!scene.city;
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
  }else{
    cityLoading=false;if(vehicleLoadTask)await vehicleLoadTask.catch(()=>{});if(epoch!==modeEpoch)return;
    if(mode==='lab'&&!experimentIds.has(activeVehicle.id)){
      const loaded=await selectVehicle(lastLabVehicleId);if(epoch!==modeEpoch)return;
      if(!loaded){
        const fallbackMode=previousMode==='city'&&!scene.city?'inspect':previousMode;
        await setMode(fallbackMode);toast(fallbackMode===previousMode?'실험 차체를 불러오지 못해 이전 화면으로 돌아왔습니다. 다시 시도해 주세요.':'도시와 실험 차체를 불러오지 못해 구조 탐색으로 돌아왔습니다. 다시 시도해 주세요.');return;
      }
    }
    reset({cancel:false});renderPartCatalog();if(mode==='lab')restoreLabView();else scene.frameWholeVehicle({resetView:true});
  }
  $('model-status').hidden=mode==='lab'&&!vehicleLoading&&!$('model-status').textContent.startsWith('차체 로드 실패');
  refreshVehiclePicker();
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
  $('catalog-summary').textContent=catalog.length?(scene.vehicle.referenceRoadster?'재현 외형 ':'원본 외형 ')+catalog.filter(p=>p.kind==='model').length+'개 메시 · 교육용 장치 '+catalog.filter(p=>p.kind==='hypothesis').length+'개':'원본 외형을 불러오는 중…';
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
  $('city-fan').checked=driver.fanEnabled;
  $('city-flight-steering').value=driver.flightSteering;$('city-flight-assist').checked=driver.flightAssist;
}
function setupCityExperiments(){
  $('city-compressor').addEventListener('click',()=>{
    if(mode!=='city'||cityLoading||vehicleLoading)return;
    clearDriveInputs();driver.setOptions({compressorEnabled:!driver.compressorEnabled});
    if(paused)setPaused(false);$('world').focus({preventScroll:true});
  });
  $('city-experiments-toggle').addEventListener('click',()=>showCityExperiments($('city-experiments').hidden));
  $('city-experiments-close').addEventListener('click',()=>showCityExperiments(false));
  $('city-drive-focus').addEventListener('click',()=>{showCityExperiments(false);$('world').focus({preventScroll:true});});
  const applySettings=event=>{
    brakeTrial.cancel('settings-changed');
    citySettings=normalizeCityExperiment({surface:$('city-surface').value,rollingResistance:$('city-crr').value,
      aeroEnabled:$('city-aero').checked,windX:$('city-wind-x').value,windZ:$('city-wind-z').value,roadRoughness:$('city-roughness').value,fanEnabled:$('city-fan').checked});
    driver.setOptions({fanEnabled:citySettings.fanEnabled});
    if(mode==='city')Object.assign(sim.params,cityExperimentParams(citySettings));syncCityExperimentInputs();
    if(event?.target?.tagName==='SELECT'||event?.target?.type==='checkbox')$('world').focus({preventScroll:true});
  };
  for(const id of ['city-surface','city-crr','city-aero','city-wind-x','city-wind-z','city-roughness','city-fan'])$(id).addEventListener('change',applySettings);
  const applyFlight=()=>{driver.setOptions({flightSteering:$('city-flight-steering').value,flightAssist:$('city-flight-assist').checked});$('world').focus({preventScroll:true});};
  $('city-flight-steering').addEventListener('change',applyFlight);$('city-flight-assist').addEventListener('change',applyFlight);
  $('city-settings-reset').addEventListener('click',()=>{brakeTrial.cancel('settings-changed');citySettings=normalizeCityExperiment({});driver.setOptions({flightSteering:'strafe',flightAssist:true,fanEnabled:true,compressorEnabled:false});if(mode==='city')Object.assign(sim.params,cityExperimentParams(citySettings));syncCityExperimentInputs();});
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
function compressorStatus(t){
  if(!driver.compressorEnabled)return '공기 충전 꺼짐';
  return ({charging:'외부 압축기 · 주변 공기 충전',moving:'정차 후 충전',airborne:'지상에 착지한 뒤 충전',thrusters:'분사 종료 후 충전',full:'탱크 충전 한도',ready:'운용 충전 완료 · 99%',cooling:'냉각하며 충전',battery:'배터리 부족',off:'충전 대기'})[t.compressorState]||'충전 대기';
}
function updateCityExperiments(t){
  if($('city-experiments').hidden)return;
  $('city-friction-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';
  $('city-air-force').textContent=(t.airDragN/1000).toFixed(2)+' kN';
  $('city-rolling-force').textContent=(t.rollingResistanceN/1000).toFixed(2)+' kN';
  $('city-thrust-force').textContent=(t.thrustN/1000).toFixed(1)+' kN';
  $('city-contacts').textContent=t.contactCount+' / 4';$('city-gas-flow').textContent=t.massFlowKgS.toFixed(1)+' kg/s';
  $('city-fan-force').textContent=(t.fanN/1000).toFixed(2)+' kN';
  $('city-fan-power').textContent=((t.fanPowerW||0)/1000).toFixed(1)+' kW';
  $('city-tank-pressure').textContent=(t.jetAirflowKgS??0).toFixed(2)+' kg/s';
  $('city-charge-flow').textContent=(t.fuelFlowKgS??t.massFlowKgS??0).toFixed(3)+' kg/s';
  $('city-charge-power').textContent=((t.massFlowKgS*sim.params.jetFuelLHVJkg||0)/1e6).toFixed(2)+' MW';
  $('city-battery').textContent=(100*sim.state.batteryJ/(sim.params.batteryKWh*3.6e6)).toFixed(1)+'%';
  $('city-charge-status').textContent='제트 연료 소비 · '+(t.fuelUsedKg??sim.state.gasUsed??0).toFixed(2)+' kg';
  const snapshot=brakeTrial.getSnapshot(),current=snapshot.current,last=snapshot.lastResult;
  const reason=code=>BRAKE_REASONS[code]||({paused:'일시정지'}[code])||'측정 중단';
  $('city-brake-status').textContent=current?'측정 중 · '+current.distance.toFixed(1)+' m / '+current.elapsed.toFixed(2)+' s':snapshot.status==='invalid'?'무효 · '+reason(snapshot.reason):snapshot.status==='complete'&&last?'제동 완료 · '+last.stoppingDistance.toFixed(1)+' m / '+last.stoppingTime.toFixed(2)+' s':'7.2 km/h 이상에서 B를 계속 눌러 정지하세요.';
  const rows=snapshot.results.slice().reverse().map(r=>{
    const surface=CITY_SURFACES.find(s=>s.id===r.settings.surface)?.label||r.settings.surface;
    return '<div class="'+(r.valid?'':'invalid')+'">'+escape(vehicleProfile(r.vehicleId).short)+' · '+escape(surface)+' · 팬 '+(r.settings.fanEnabled?'켜짐':'꺼짐')+' · '+(r.initialSpeed*3.6).toFixed(1)+' km/h<br>'+(r.valid?r.stoppingDistance.toFixed(2)+' m · '+r.stoppingTime.toFixed(2)+' s · 최대 감속 '+r.maxDeceleration.toFixed(1)+' m/s²':'무효: '+reason(r.reason))+'</div>';
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
    if(!freeDriving()||cityLoading||vehicleLoading||document.querySelector('dialog[open]'))return false;
    if(paused)setPaused(false);
    return true;
  };
  window.addEventListener('keydown',e=>{
    if(mode==='city'&&e.code==='Enter'&&e.target?.matches?.('input[type="number"]')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){
      e.preventDefault();clear();$('world').focus({preventScroll:true});return;
    }
    if(!freeDriving()||!DRIVE_KEYS.has(e.code)||editable(e.target)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();if(readyToDrive()){keyboardKeys.add(e.code);sync();}
  });
  window.addEventListener('keyup',e=>{if(DRIVE_KEYS.has(e.code)){keyboardKeys.delete(e.code);sync();if(mode==='city'&&!editable(e.target))e.preventDefault();}});
  window.addEventListener('blur',clear);
  document.addEventListener('focusin',e=>{if(freeDriving()&&editable(e.target))clear();});
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
    if(!road.points?.length)continue;
    const bounds=road.mapBounds??=(road.points.reduce((b,p)=>({minX:Math.min(b.minX,p[0]),maxX:Math.max(b.maxX,p[0]),minZ:Math.min(b.minZ,p[1]),maxZ:Math.max(b.maxZ,p[1])}),{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity}));
    if(bounds.maxX<x-w/2/scale-30||bounds.minX>x+w/2/scale+30||bounds.maxZ<z-h/2/scale-30||bounds.minZ>z+h/2/scale+30)continue;ctx.beginPath();ctx.strokeStyle=road.width>14?'#839197':'#4e626d';ctx.lineWidth=Math.max(1.5,road.width*scale*.6);
    for(let i=0;i<road.points.length;i++){const px=(road.points[i][0]-x)*scale,py=(road.points[i][1]-z)*scale;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.stroke();
  }
  ctx.rotate(Math.PI/2-t.attitude.yaw);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-6,6);ctx.lineTo(0,3);ctx.lineTo(6,6);ctx.closePath();ctx.fillStyle='#8bffe0';ctx.fill();ctx.restore();
  ctx.font='bold 12px sans-serif';ctx.fillStyle='#dce7e9';ctx.fillText('N',w-17,18);
}
function updateCityHUD(t){
  $('city-camera').textContent=camera==='orbit'?'◉ 자유':camera==='hood'?'◉ 운전석':'◉ 추적';
  $('city-speed').textContent=Math.round(t.horizontalSpeed*3.6);$('city-gear').textContent=t.horizontalSpeed<.1&&!driveInput.throttle?'N':driveGear;
  const forward=new Vector3(1,0,0).applyQuaternion(sim.state.q),acceleration=t.acceleration.dot(forward);
  $('city-acceleration').textContent=(acceleration>=0?'+':'')+acceleration.toFixed(1)+' m/s² · '+(acceleration/sim.params.gravity).toFixed(1)+' g';
  $('city-distance').textContent=(cityDistance/1000).toFixed(2)+' km · 연료 '+(t.fuelKg??t.gasKg).toFixed(1)+' kg';
  $('city-compressor').hidden=true;driver.compressorEnabled=false;
  $('city-compressor').setAttribute('aria-pressed',false);
  $('city-compressor').textContent=driver.compressorEnabled?(['ready','full'].includes(t.compressorState)?'충전 완료':['charging','cooling'].includes(t.compressorState)?'충전 중 · 중지':'충전 대기 · 중지'):'외부 공기 충전';
  const charge=rechargeReadout.update(sim.state,sim.params,{enabled:driver.compressorEnabled,capacityKg:sim.initialGas,powerBudgetW:sim.params.batteryMaxDischargeKW*1000,status:t.compressorState});
  $('city-recharge').hidden=false;
  $('city-recharge').textContent='공기 직접 흡입 · 연료 '+(t.fuelFlowKgS??t.massFlowKgS??0).toFixed(2)+' kg/s · '+(t.status==='ENGINE STARTING'?'보조 엔진 시동 중':'상승 엔진 시동 완료 조건');
  $('city-compressor').title=compressorStatus(t);
  $('city-motion').textContent=paused?'일시정지':driver.landingAssist?'착지 보조':t.saturation&&driver.airborne?'추력 한계':driveInput.airBrake?'공중 제동':driveInput.lift?'상승 분사':driver.altHold?'고도 유지':driveInput.handbrake?'드리프트':driveInput.boost?'F 추진 가속':driver.airborne?'자유 비행':t.horizontalSpeed<.1&&!driveInput.throttle?'정지 유지':driveInput.brake>.3?'제동':driveInput.corneringAssist?'코너링 보조':driveInput.throttle?'가속':driveInput.brake>0?'페달 해제 감속':'타력';
  if(t.thermalLimited&&!paused)$('city-motion').textContent='분사 온도 하한 · 열 회복 대기';
  if(['prepare','rolling','recovering'].includes(driver.maneuverStatus))$('city-motion').textContent=maneuverLabels[driver.maneuverStatus];
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
  $('city-key-hint').textContent=editing?'입력 중 · Enter 운전':driver.airborne?(driver.flightSteering==='strafe'?'A/D 옆이동 · Q/E 회전':'Q/E 회전 · H 높이 유지'):steeringHeld?(left?'A ←':'D →')+' · '+(driveKeys.has('KeyB')?'B 제동':driveInput.handbrake?'Shift 드리프트':driveKeys.has('KeyF')?'F 가속':driveKeys.has('KeyW')?'W 가속':driveKeys.has('KeyS')?'S 후진':t.horizontalSpeed<.3?'W/S로 출발':'조향 중'):t.horizontalSpeed<.3?'W/S와 함께 A/D 조향':'WASD · F 가속 · Shift 드리프트';
  $('city-key-hint').classList.toggle('city-key-hint-active',!editing&&steeringHeld);
  $('city-land').textContent=driver.landingAssist?'착지 중 · 취소':'착지 보조';$('city-land').setAttribute('aria-pressed',driver.landingAssist);
  $('city-hover').textContent=driver.altHold?'H 유지 '+driver.targetHeight.toFixed(1)+' m'+(t.saturation?' · 추력 한계':''):'H 고도 유지';
  $('city-hover').setAttribute('aria-pressed',driver.altHold);
  $('city-flight-status').textContent=paused?'운전 키를 누르면 재개 · R 지상 복귀':['GAS DEPLETED','FUEL DEPLETED'].includes(t.status)?'연료 소진 · R로 새 실험':driver.airborne?(driver.flightSteering==='turn'?'W/S 추진 · A/D 선회 · Q/E 회전':'WASD 수평 이동 · Q/E 회전'):'W 전진 · F 가속 · Shift 드리프트 · B 제동';
  $('city-throttle').style.width=(Math.abs(driveInput.throttle||0)*100)+'%';$('city-brake').style.width=(Math.max(driveInput.brake||0,driveInput.handbrake||0)*100)+'%';
  $('city-road').textContent=scene.city?.nearestRoadName?.(sim.state.pos.x,sim.state.pos.z)||'강남역 · 서울';
  updateCityExperiments(t);
  const b=scene.city?.bounds,p=sim.state.pos;
  // The centre district and the streamed tiles are both mapped ground; warn only beyond them.
  $('city-boundary').hidden=!b||(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ)||!!scene.city.streaming?.contains(p.x,p.z);
  drawCityMap(t);
}

function syncCockpitHUD(){
  const inside=mode==='city'&&camera==='hood';
  if(inside!==lastCockpitView){cockpitPanelsOpen=false;lastCockpitView=inside;}
  document.body.classList.toggle('cockpit-view',inside);
  document.body.classList.toggle('cockpit-panels-open',inside&&cockpitPanelsOpen);
  $('cockpit-tools').hidden=!inside;
  $('cockpit-toggle').setAttribute('aria-expanded',inside&&cockpitPanelsOpen);
  $('cockpit-toggle').textContent=cockpitPanelsOpen?'설정 닫기':'차량 · 설정';
  $('cockpit-controls').setAttribute('aria-pressed',document.body.classList.contains('show-drive-controls'));
}
function toggleCockpitPanels(open=!cockpitPanelsOpen){
  clearDriveInputs();cockpitPanelsOpen=!!open;syncCockpitHUD();
  if(!cockpitPanelsOpen){showCityExperiments(false);$('world').focus({preventScroll:true});}
}
function updateUI(){
  const maneuverStatus=driver.maneuverStatus||'idle';
  if(maneuverStatus!==lastManeuverNotice){lastManeuverNotice=maneuverStatus;if(freeDriving()&&maneuverLabels[maneuverStatus])toast(maneuverLabels[maneuverStatus]);}
  const flipButton=$('city-flip');if(flipButton){flipButton.hidden=false;flipButton.disabled=!freeDriving()||vehicleLoading||cityLoading;}
  syncCockpitHUD();
  const t=sim.telemetry(),run=landingRun||lastResult;
  $('landing-current-vehicle').textContent=activeVehicle.short;
  const trialMethod=landingSession?.metadata?.method;
  $('landing-current-trial').textContent=landingSession?Math.min(landingSession.index+1,landingSession.jobs.length)+' / '+landingSession.jobs.length+' · '+({free:'추력 차단',brake:'지정 높이 재가속',gentle:'완만한 하강',eco:'절약 착지'}[trialMethod]||'준비 중'):'자유 조종';
  $('landing-playback').hidden=mode!=='lab';
  $('camera').title=mode==='lab'?'기본 관찰 시점 복원 (C)':'카메라 전환 (C)';
  $('camera-label').textContent=cameraLabel();
  $('landing-step').disabled=!(mode==='lab'&&landingRun&&paused&&!vehicleLoading);
  $('vectors').textContent=mode==='lab'?'∑ 물리 표시':'↗ 힘 벡터';
  $('vectors').setAttribute('aria-pressed',mode==='lab'?landingLearningVisible:showVectors);
  if(mode==='city'){updateCityHUD(t);return;}
  landingLiveUI?.setVisible(mode==='lab'&&landingLearningVisible);
  landingLiveUI?.update(sim,scene.landingVisual,run,{active:!!landingRun,paused});
  $('altitude').innerHTML=Math.max(0,landingClearance(sim)).toFixed(2)+' <small>m</small>';
  $('vertical').innerHTML=(t.verticalSpeed>=0?'+':'')+t.verticalSpeed.toFixed(2)+' <small>m/s</small>';
  const force=sim.contactMeanForceN;
  $('ground-force').innerHTML=(force/1000).toFixed(2)+' <small>kN</small>';
  $('peak-force').textContent=run?(run.peakEquivalentGroundForceN/1000).toFixed(2)+' kN':'—';
  $('peak-g').textContent=run&&run.touchdownTime!==null?run.contactPeakG.toFixed(2)+' g':'—';
  $('touchdown-speed').textContent=Number.isFinite(run?.touchdownSpeed)?run.touchdownSpeed.toFixed(2)+' m/s':'—';
  $('compression').textContent=run?(run.maxCompression*1000).toFixed(0)+' mm':'—';
  $('thrust').textContent=(t.thrustN/1000).toFixed(1)+' kN';$('gas').textContent=t.gasKg.toFixed(1)+' kg';
  $('mass').textContent=Math.round(t.totalMass).toLocaleString('en-US')+' kg';$('contact-count').textContent=t.contactCount+' / 4';
  $('sim-time').textContent=sim.state.time.toFixed(2)+' s';
  $('lab-friction-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';
  $('lab-surface').disabled=!!landingSession;
  const liftReady=mode==='lab'&&!!landingRun&&!paused&&!vehicleLoading&&landingRun.touchdownTime===null;
  if(!liftReady&&landingLiftHeld)clearLandingLift();
  $('status-badge').textContent=landingRun?landingPhaseLabel(sim,landingRun,{active:true,paused}):lastResult?'측정 완료':'준비';
  if(landingRun&&landingSession)landingUI.setProgress((landingSession.index+1)+' / '+landingSession.jobs.length+' · '+landingPhaseLabel(sim,landingRun,{active:true,paused}));
}
function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  $('guide-content').innerHTML=tab==='sources'?
    '<p><a href="https://github.com/leejuhan-1214/roadster/blob/main/docs/v144-jet-sources.md" target="_blank" rel="noopener noreferrer">제트엔진 제원·설치 가정·물리 근거</a> · <a href="https://github.com/leejuhan-1214/roadster/blob/main/docs/landing-study-guide.md" target="_blank" rel="noopener noreferrer">착지 실험 결과와 보고서</a></p><p>JetCat P1000-PRO를 참고한 외부 실험 장치입니다. 상승 64기·보조 6기, 엔진 770 kg과 구조·연료계통·전장 206 kg, 초기 연료 150 kg을 사용합니다. 15% 설치 손실과 부분 출력의 연료 보간은 가정입니다. 실차 순정 장치 또는 인증된 비행 설계가 아닙니다.</p><p>환경 출처: <a href="./assets/environment/sky/LICENSE.txt">하늘</a> · <a href="./assets/environment/road/LICENSE.txt">도로</a> · <a href="./assets/trees/LICENSE.txt">나무</a> · <a href="./assets/city-buildings/README.txt">건물</a> · <a href="./assets/vehicles/vehicle-specifications.md">차량 제원</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join(''):
    '<ol><li>부양 높이와 차체를 선택하고 4방식 비교를 시작합니다.</li><li>시동 완료 상태에서 지상 상승과 안정 부양을 실제 힘으로 계산한 뒤 착지를 시작합니다.</li><li>추력 차단·지정 높이 재가속·완만한 하강·절약 착지의 반력과 연료를 비교합니다.</li><li>결과의 실제 부양 높이·준비 연료·착지 연료를 확인합니다. 차체 접촉과 목표 미달도 그대로 기록합니다.</li></ol><p>W/S 주행 · A/D 지상 조향/공중 옆이동 · F 추진 · Shift 드리프트 · B 제동. Space 상승 추력, H 고도 유지, Q/E 방향, 마우스 드래그 시점, C 카메라, V 물리 표시, P 일시정지, R 새 초기조건으로 복귀.</p><p>공기를 저장하지 않습니다. 주변 공기를 흡입해 연료와 연소한 뒤 배출합니다. 엔진의 출력 변화는 약 5초로 제한하며, 연료 차단 후 즉시 최대 추력으로 재점화할 수 없습니다. 초기 화면과 각 비교는 상승 엔진 시동이 완료된 조건으로 시작하며 시동 전 비용은 비교에 포함하지 않습니다.</p><p>부양에는 계속 연료가 필요합니다. 설치 손실·흡입 간섭·고온 배기 재흡입·차체 구조는 실물 시험으로 검증하지 않았습니다. 이 시뮬은 조건 비교용입니다.</p>';
}
function openGuide(tab='controls'){renderGuide(tab);$('guide-modal').showModal();}
function focusApparatus(id){
  if(!scene.getPartCatalog().some(p=>p.id===id))return;
  $('show-hypotheses').checked=true;scene.setHypothesesVisible(true);$('part-search').value='';$('part-category').value='';
  refreshPartCatalog();scene.setExplode(.65,true);scene.focusPart(id);if(scene.isolatedPartId!==id)scene.isolatePart(id);selectPart(id);scene.frameSelectedPart();
}
function setSettingsPanel(open){
  $('left-panel').classList.toggle('open',open);
  $('panel-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('left-panel').scrollTop=0;
  scene.inspectionViewport();
}
function setupUI(){
  refreshVehiclePicker();
  landingUI=new LandingUI({vehicles:EXPERIMENT_VEHICLES,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onCompareFleetMethods:()=>startLanding('fleet-methods'),onCompareBrakeHeights:()=>startLanding('brake-heights'),onStop:stopLanding,onConfigure:()=>setSettingsPanel(true)});
  landingLiveUI=new LandingLiveUI($('telemetry'));
  scene.setLandingLearningVisible(landingLearningVisible);
  $('landing-speed').addEventListener('change',event=>{landingPlaybackRate=Number(event.target.value)||1;accumulator=0;});
  $('landing-step').addEventListener('click',()=>{if(mode==='lab'&&landingRun&&paused&&!vehicleLoading){landingSession.singleStepping=true;stepSimulation();renderStates.reset(sim);updateUI();}});
  renderCityVehicleOptions();
  $('city-vehicle-search').addEventListener('input',()=>{clearDriveInputs();renderCityVehicleOptions();});
  $('city-vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $('city-reset').addEventListener('click',()=>reset());
  $('city-controls').addEventListener('click',()=>{showCityExperiments(false);const shown=document.body.classList.toggle('show-drive-controls');$('city-controls').setAttribute('aria-pressed',shown);});
  $('city-camera').addEventListener('click',()=>$('camera').click());
  $('cockpit-toggle').addEventListener('click',()=>toggleCockpitPanels());
  $('cockpit-exit').addEventListener('click',()=>$('camera').click());
  $('cockpit-reset').addEventListener('click',()=>reset());
  $('cockpit-controls').addEventListener('click',()=>$('city-controls').click());
  $('city-season').addEventListener('click',()=>{
    const library=scene.city?.treeAsset?.library;if(!library)return;
    const next=library.season==='summer'?'autumn':'summer';library.setSeason(next);
    $('city-season').textContent=next==='autumn'?'🍂 가을':'🌿 여름';$('city-season').setAttribute('aria-pressed',next==='autumn');$('world').focus({preventScroll:true});
  });
  $('city-hover').addEventListener('click',()=>{if(mode==='city'&&!cityLoading&&!vehicleLoading){if(paused)setPaused(false);driver.toggleAltitudeHold(sim);}});
  $('city-vectors').addEventListener('click',()=>$('vectors').click());
  document.querySelectorAll('[data-paint]').forEach(button=>button.addEventListener('click',()=>{$('city-paint').value=button.dataset.paint;$('world').focus({preventScroll:true});}));
  $('city-paint').addEventListener('change',()=>{$('world').focus({preventScroll:true});});
  clearLandingLift=bindLandingLiftControls({window,document,
    isReady:()=>mode==='lab'&&!!landingRun&&!paused&&!vehicleLoading&&!document.hidden&&!document.querySelector('dialog[open]')&&landingRun.touchdownTime===null,
    onChange:held=>{landingLiftHeld=held;}
  });
  $('lab-surface').addEventListener('change',event=>{if(mode==='lab'&&!landingSession){sim.params.friction=Number(event.target.value);$('world').focus({preventScroll:true});}});
  setupDriveControls();
  setupCityExperiments();
  $('vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('pause').addEventListener('click',()=>{if(landingRun||freeDriving()){clearDriveInputs();setPaused(!paused)};});
  $('reset').addEventListener('click',()=>{reset();scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);if(mode==='city')scene.frameCityStart(sim);else if(mode==='lab')restoreLabView();else scene.frameWholeVehicle({resetView:true});selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();toast('초기화 · 비교 기록은 유지됩니다.');});
  $('help').addEventListener('click',()=>openGuide());$('about-link').addEventListener('click',()=>openGuide('sources'));
  $$('[data-guide]').forEach(b=>b.addEventListener('click',()=>renderGuide(b.dataset.guide)));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('panel-toggle').addEventListener('click',()=>setSettingsPanel(!$('left-panel').classList.contains('open')));
  $('left-panel').addEventListener('transitionend',()=>scene.inspectionViewport());
  $('telemetry').addEventListener('toggle',()=>scene.inspectionViewport(),true);
  $('panel-toggle').setAttribute('aria-expanded',String($('left-panel').classList.contains('open')));
  $('vectors').addEventListener('click',()=>{if(mode==='lab'){landingLearningVisible=!landingLearningVisible;scene.setLandingLearningVisible(landingLearningVisible);updateUI();return;}showVectors=!showVectors;$('vectors').setAttribute('aria-pressed',showVectors);$('city-vectors').setAttribute('aria-pressed',showVectors);});
  $('camera').addEventListener('click',()=>{if(mode==='inspect'){camera='orbit';scene.frameWholeVehicle({resetView:true});}else if(mode==='city')camera=camera==='chase'?'hood':camera==='hood'?'orbit':'chase';else {restoreLabView();return;}scene.setCamera(camera);$('camera-label').textContent=cameraLabel();});
  $('explode').addEventListener('input',()=>{const value=Number($('explode').value);scene.setExplode(value);$('explode-value').textContent=Math.round(value*100)+'%';});
  $('tank-focus').addEventListener('click',()=>focusApparatus(scene.vehicle.jetRig?'jet-rig':'tank'));
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
    if(e.code==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();$('left-panel').classList.remove('open');if(mode==='city'&&camera==='hood')toggleCockpitPanels(false);showCityExperiments(false);$('world').focus({preventScroll:true});return;}
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat||e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(e.code==='KeyP'&&(landingRun||freeDriving())){e.preventDefault();setPaused(!paused);}
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
  if(mode==='city')scene.city?.streaming?.update(sim.state.pos.x,sim.state.pos.z,sim.state.vel.x,sim.state.vel.z);
  if(((landingRun&&mode==='lab')||freeDriving())&&!vehicleLoading&&!cityLoading&&!paused&&!blocked&&!document.hidden){accumulator+=elapsed*(landingRun?landingPlaybackRate:1);let steps=0;while(accumulator>=LANDING_STEP&&steps<50&&!paused){stepSimulation();accumulator=Math.max(0,accumulator-LANDING_STEP);steps++;}}else accumulator=0;
  if(!document.hidden)scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint:$('city-paint').value,wing:false,cutaway:false,renderState:renderStates.sample(paused||mode==='inspect'||blocked?1:accumulator/LANDING_STEP)});
  if(stamp-lastUI>80){updateUI();lastUI=stamp;}frames++;frameTimer+=elapsed;
  if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent=cameraLabel();});
  scene.setMode('lab');scene.setCamera(camera);setupUI();sim.setObstacles([]);updateUI();requestAnimationFrame(animate);selectVehicle('roadster');
  // ?debug exposes the running objects for inspection; it changes no behaviour.
  if(new URLSearchParams(location.search).has('debug'))window.__roadster={sim,scene,driver,driveKeys,reset,setMode,setPaused,get mode(){return mode;},get paused(){return paused;}};
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
}catch(error){console.error(error);$('boot-message').textContent='3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';}
