import {ENGINE_STROKES} from './drivetrain-section.js?v=20261118-model154';
import {createTireReadout} from './tire-readout.js?v=20261118-model154';
import {suspensionLayout,suspensionDescription} from './suspension-layouts.js?v=20261118-model154';
import {FACILITY_SOLIDS} from './world-obstacles.js?v=20261107-drive2';
import {RechargeReadout} from './recharge-readout.js?v=20261115-fleet1';
import {Vector3} from 'three';
import {bindLandingLiftControls} from './landing-controls.js?v=20261110-seoul1';
import {CITY_SURFACES,BRAKE_REASONS,normalizeCityExperiment,cityExperimentParams,CityBrakeTrial,brakeResultsCSV} from './city-experiment.js?v=20261118-audit148';
import {DrivingController,CITY_DRIVE_PARAMS} from './driving-input.js?v=20261118-circuit155';
import {VEHICLES,vehicleProfile,vehiclePhysics} from './vehicle-profiles.js?v=20261118-city151';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from './landing-experiment.js?v=20261119-height160';
import {LandingUI} from './landing-ui.js?v=20261119-height160';
import {roadsterHeightStudySource} from './landing-height-source.js?v=20261119-height160';
import {LandingLiveUI,landingPhaseLabel} from './landing-live.js?v=20261118-physics146';
import {RenderStateBuffer} from './render-state.js?v=20261118-frameperf1';
import {advanceFrame} from './frame-steps.js?v=20261118-frameperf2';
import {LandingPlanner} from './landing-preparation.js?v=20261119-height160';
import {createSeoulMapPanel} from './seoul-map-panel.js?v=20261119-wide157';
import {DriveMapSession} from './drive-map-session.js?v=20261118-atlas156';
import {StationRace,normalizeRaceDifficulty,RACE_COURSE} from './station-race.js?v=20261119-ai158';
import {showRaceHUD, updateRaceHUD, drawRaceMap} from './station-race-hud.js?v=20261119-ai158';
import {PhysicsSim,DEFAULTS} from './physics.js?v=20261119-ai158';
import {FlightScene} from './scene.js?v=20261119-chase1591';

import {experimentVehicles,experimentMass} from './experiment-vehicles.js?v=20261115-capacity375';
import {searchCityVehicles,vehicleOptionsForMode} from './vehicle-catalog.js?v=20261111-cockpit1';

const EXPERIMENT_VEHICLES=experimentVehicles(VEHICLES),experimentIds=new Set(EXPERIMENT_VEHICLES.map(v=>v.id));
let lastLabVehicleId='roadster',vehicleLoadTask=null;
let roadsterStudyGeometry=null;
async function getHeightStudySource(settings){
  if(!roadsterStudyGeometry&&vehicleLoadTask)await vehicleLoadTask;
  return roadsterHeightStudySource(roadsterStudyGeometry,settings);
}
const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});
const renderStates=new RenderStateBuffer(sim);
const landingPlanner=new LandingPlanner();
let labTires,cityTires;
let landingLiveUI,landingLearningVisible=true,landingPlaybackRate=1;
let scene,landingUI,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='lab',camera='orbit',paused=true,showVectors=false,showLandingSuspension=false;
let cockpitPanelsOpen=false,lastCockpitView=false;
const compactCityViewport=matchMedia('(max-width:700px), (max-height:560px) and (orientation:landscape)');
let cityLoading=false,modeEpoch=0,cityDistance=0,driveInput={},driveGear='D';
let citySettings=normalizeCityExperiment({});
const brakeTrial=new CityBrakeTrial();
const mapSession=new DriveMapSession();
let mapPanel,cityPoseReady=false;
const driveKeys=new Set(),worldUp=new Vector3(0,1,0);
let driver=new DrivingController(),race=null,cityReturn=null;
let preferredRaceDifficulty='normal';
const previousCityPosition=new Vector3();
let clearDriveInputs=()=>driveKeys.clear();
let landingLiftHeld=false,clearLandingLift=()=>{landingLiftHeld=false;};
const rechargeReadout=new RechargeReadout();
const DRIVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyB','KeyH','KeyQ','KeyE','KeyF','KeyX','ShiftLeft','ShiftRight']);
const cameraLabel=()=>mode==='lab'?'시점 복원':camera==='top'?'상부 카메라':camera==='chase'?'추적 카메라':camera==='hood'?'운전석 카메라':'자유 카메라';
let landingSession=null,landingRun=null,lastResult=null,landingSerial=0;
const freeDriving=()=>mode==='city'||(mode==='lab'&&!landingSession);
let lastStamp=0,accumulator=0,lastUI=0,frames=0,frameTimer=0,toastTimer,lastManeuverNotice='idle';
const maneuverLabels={profile:'이 차체의 추진 장치를 확인하세요',thrust:'회전에 필요한 추력 여유가 부족해요 · 기체를 충전하세요',height:'8 m 이상 상승한 뒤 X를 누르세요',gas:'공중제비에 필요한 기체가 부족해요',momentum:'상승 중 X · 수직 속도 7 m/s 이상',attitude:'수평 자세로 안정된 뒤 X를 누르세요',prepare:'공중제비 · 상승 여유 확보',rolling:'공중제비 · 회전 중',recovering:'공중제비 · 자세 회복',complete:'공중제비 완료 · 수평 자세 회복',cancelled:'공중제비 취소',contact:'지면 접촉 · 회전 종료',unavailable:'지금은 공중제비를 시작할 수 없어요'};
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setPaused(value){
  paused=race?.phase==='finished'||value;if(!value&&landingSession)landingSession.singleStepping=false;if(value){clearLandingLift();clearDriveInputs();brakeTrial.cancel('paused');}accumulator=0;renderStates.reset(sim);
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').disabled=!landingRun&&!freeDriving();
  $('pause').setAttribute('aria-label',(mode==='city'?'주행':'실험')+(paused?' 재생':' 일시정지'));
  $('live-label').textContent=mode==='city'?(cityLoading?'도시 불러오는 중':race?.phase==='finished'?'경주 완주':paused?'일시정지':race?'서킷 경주':'서울 자유 주행'):landingRun?(paused?'일시정지':'측정 중'):mode==='inspect'?'구조 탐색':freeDriving()?'자유 조종':'실험 준비';
}
function parkAt(pose){
  sim.rivalSupport=false;
  const {pos,vel,q,omega}=sim.state;
  pos.set(pose.x,sim.restHeight,pose.z);q.setFromAxisAngle(worldUp,pose.heading);
  vel.set(0,0,0);omega.set(0,0,0);
  for(const wheel of sim.wheels){wheel.omega=0;wheel.steer=0;}
  driver.reset();clearDriveInputs();driveInput={};driveGear='D';
  renderStates.reset(sim);scene.frameCityStart(sim);
}
let pendingRaceEpoch=null;
async function startRace(gate){
  if(mode!=='city'||cityLoading||vehicleLoading||pendingRaceEpoch===modeEpoch)return;
  if(!scene.raceEntryReady){
    const epoch=modeEpoch,loading=$('city-loading');
    pendingRaceEpoch=epoch;setPaused(true);
    loading.textContent='미래도시 서킷을 준비하는 중…';loading.hidden=false;
    try{await scene.prepareStationRaceEntry();}
    catch(error){
      if(mode==='city'&&modeEpoch===epoch){console.error(error);toast('서킷 준비에 실패했습니다. 다시 진입해 주세요.');setPaused(false);}
      return;
    }finally{
      if(pendingRaceEpoch===epoch)pendingRaceEpoch=null;
      if(modeEpoch===epoch){loading.textContent='서울 도로를 불러오는 중…';loading.hidden=true;}
    }
    if(mode!=='city'||modeEpoch!==epoch||cityLoading)return;
    if(vehicleLoading){setPaused(false);return;}
  }
  if(!race){
    brakeTrial.cancel('paused');
    mapSession.sample(sim.state.pos.x,sim.state.pos.z);mapSession.breakPath();
    cityReturn={gate,sim,driver,distance:cityDistance};
    scene.city.streaming?.bindPhysics(null);
    showCityExperiments(false);cockpitPanelsOpen=false;
  }
  race=new StationRace({difficulty:preferredRaceDifficulty});
  sim=new PhysicsSim({...cityReturn.sim.params,...CITY_DRIVE_PARAMS,roadRoughness:0,unlimitedRaceGas:true});
  driver=new DrivingController();cityDistance=0;
  scene.setStationRace(race);sim.setObstacles(scene.raceWorld.obstacles);
  mapPanel.setRaceActive(true);
  parkAt(race.startPose);setPaused(false);
  showRaceHUD(true);updateRaceHUD(race,sim.telemetry(),driver);
  $('world').setAttribute('aria-label','AI 차량 3대와 달리는 4.381 km 미래도시 서킷 · 매 랩 공중 링 '+RACE_COURSE.gates.filter(g=>g.air).length+'개 필수 · 기체 무제한');
  $('world').focus({preventScroll:true});
}
function recoverRace(){
  if(race?.phase!=='racing')return;
  parkAt(race.recover());setPaused(false);toast('마지막 통과 지점으로 복귀');
  $('world').focus({preventScroll:true});
}
function leaveRace(){
  if(!race)return;
  const {gate,sim:citySim,driver:cityDriver,distance}=cityReturn;
  race=null;cityReturn=null;sim=citySim;driver=cityDriver;cityDistance=distance;
  scene.setStationRace(null);scene.city.streaming?.bindPhysics(sim);
  const exit=gate?.returnPose;
  if(exit)parkAt({x:exit.position[0],z:exit.position[2],heading:exit.heading});
  else {clearDriveInputs();renderStates.reset(sim);scene.frameCityStart(sim);}
  mapSession.sample(sim.state.pos.x,sim.state.pos.z);mapPanel.setRaceActive(false);
  if(gate)scene.city.streetOverlay?.portals?.suppress(gate);
  showRaceHUD(false);setPaused(false);
  $('world').setAttribute('aria-label','서울 실제 도로 기반 자유 주행');
  $('world').focus({preventScroll:true});
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
  const session=landingSession;landingSession=null;landingRun=null;session.planning?.abort();restoreLandingParams(session);
  if(session.kind==='ballast')updateLabMass();
  landingUI.setBusy(false,message);$('vehicle-select').disabled=vehicleLoading;setPaused(true);
}
function reset({cancel=true,clearMeasurement=true,restoreCityPlace=false}={}){
  if(race){recoverRace();return;}
  if(cancel)cancelLanding();
  clearDriveInputs();driver.reset();driveInput={};cityDistance=0;brakeTrial.reset({keepResults:true});
  const parameters=vehiclePhysics(activeVehicle,scene?.vehicle?.geometryParams,DEFAULTS);
  parameters.parkedWheelMounts=mode==='city';
  parameters.cityWheelGeometry=mode==='city'?scene?.vehicle?.cityWheelGeometry??null:null;
  parameters.cityGroundSupports=mode==='city'?scene?.vehicle?.cityGroundSupports??null:null;
  if(freeDriving())Object.assign(parameters,CITY_DRIVE_PARAMS,mode==='city'?cityExperimentParams(citySettings):{});
  else Object.assign(parameters,{roadRoughness:0,aeroEnabled:false});
  if(mode==='lab'&&!landingSession)Object.assign(parameters,{friction:Number($('lab-surface').value),roadRoughness:0});
  Object.assign(sim.params,parameters);
  const obstacles=mode==='city'?(scene.city?.obstacles||[]):mode==='lab'?FACILITY_SOLIDS:[];
  sim.setObstacles(obstacles);scene.city?.streaming?.bindPhysics(mode==='city'?sim:null);sim.reset('ground');
  if(mode==='city'&&scene.city){
    scene.city.streetOverlay?.portals?.reset();
    const savedDistance=restoreCityPlace?mapSession.restore(sim):null;
    if(savedDistance===null){
      const spawn=scene.city.spawn;sim.state.pos.x=spawn.position[0];sim.state.pos.z=spawn.position[2];sim.state.q.setFromAxisAngle(worldUp,spawn.heading);
      mapSession.breakPath();
    }else cityDistance=savedDistance;
    mapSession.sample(sim.state.pos.x,sim.state.pos.z);cityPoseReady=true;
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
    // Many consecutive trials test the same assembly. Keep its camera, paint
    // and GPU buffers ready while createLandingRun resets the physical state.
    const sameAssembly=activeVehicle.id===job.vehicleId&&scene.vehicle.profileId===job.vehicleId&&!scene.hasCustomModel;
    if(!sameAssembly&&!await selectVehicle(job.vehicleId,{forLanding:true}))throw new Error('차체를 불러오지 못했습니다.');
    if(landingSession!==session)return;
    Object.assign(sim.params,vehiclePhysics(activeVehicle,scene.vehicle.geometryParams,DEFAULTS),{
      tankVolume:session.originalParams.tankVolume,tankPressureMPa:session.originalParams.tankPressureMPa,initialTemperature:session.originalParams.initialTemperature});
    const trialSettings={...session.settings,...job,brakeHeight:job.brakeHeight??session.settings.brakeHeight,vehicleId:activeVehicle.id,title:activeVehicle.title};
    if(session.kind==='ballast')updateLabMass(job.ballastKg);
    if(trialSettings.method==='eco'){
      session.planning=new AbortController();
      landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · 절약 착지 분사 시점 계산 중…');
      const run=await landingPlanner.prepare(sim,trialSettings,session.planning.signal);
      if(landingSession!==session)return;
      session.planning=null;landingRun=run;
    }else landingRun=createLandingRun(sim,trialSettings);
    scene.setLandingExperiment(trialSettings);
    lastResult=null;
    session.metadata={...session.settings,...job,method:job.method,brakeHeight:job.brakeHeight??session.settings.brakeHeight,groupId:session.groupId,groupSize:session.jobs.length,groupKind:session.kind,vehicleId:activeVehicle.id,vehicleTitle:activeVehicle.title,id:session.groupId+'-'+session.index,initialMass:sim.mass,initialGas:sim.initialGas,tankVolume:sim.params.tankVolume,tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature};
    scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);
    if(matchMedia('(max-width:1000px)').matches)setSettingsPanel(false);
    restoreLabView({resetView:session.index===0});
    renderStates.reset(sim);setPaused(!!session.singleStepping);$('vehicle-select').disabled=true;
    const massLabel=session.kind==='ballast'?' · 추가 '+job.ballastKg+' kg':'';
    landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · '+activeVehicle.title+massLabel+' · 착지 중');
  }catch(error){if(landingSession===session){cancelLanding('실험 중단 · '+error.message);reset({cancel:false});console.error(error);}}
}
function stepSimulation(){
  if(freeDriving()){
    if(race&&race.phase!=='racing'){
      if(race.phase==='countdown')race.update(LANDING_STEP,sim.state.pos);
      return;
    }
    driveInput=driver.update(driveKeys,sim,LANDING_STEP);if(mode!=='city'){driveInput.fan=false;driveInput.compressor=false;}if(driveInput.throttle)driveGear=driveInput.throttle<0?'R':'D';
    if(mode==='city'&&!race)brakeTrial.sample(sim,{braking:driveKeys.has('KeyB'),drifting:driveKeys.has('ShiftLeft')||driveKeys.has('ShiftRight'),airborne:driver.airborne,settings:citySettings,vehicleId:activeVehicle.id});
    const previousX=sim.state.pos.x,previousZ=sim.state.pos.z;
    const previousY=sim.state.pos.y;
    sim.step(LANDING_STEP,driveInput);
    if(race){
      const recovery=race.update(LANDING_STEP,sim.state.pos,sim);
      if(recovery){parkAt(recovery);toast(race.recoveryReason==='air-gate'?'필수 링 미통과 · 이륙 전부터 다시 시작':'코스 이탈 · 마지막 통과 지점으로 복귀');}
      if(race.phase==='finished'){setPaused(true);updateRaceHUD(race);}
      return;
    }
    if(mode==='city'&&scene.city?.streaming&&!scene.city.streaming.guard(sim.state,LANDING_STEP)){
      sim.state.pos.x=previousX;sim.state.pos.z=previousZ;
      brakeTrial.cancel(sim.obstacleContacts.length?'collision':'map-boundary');
    }else if(mode==='city'&&sim.contactCount>0&&scene.city?.streetOverlay?.portals){
      const gate=scene.city.streetOverlay.portals.crossing(previousCityPosition.set(previousX,previousY,previousZ),sim.state.pos);
      if(gate){startRace(gate);return;}
    }
    cityDistance+=Math.hypot(sim.state.vel.x,sim.state.vel.z)*LANDING_STEP;return;
  }
  if(!landingRun)return;
  sim.step(LANDING_STEP,landingRunInput(landingRun,sim,landingLiftHeld));
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
  updateLabMass();
}
function updateLabMass(ballastKg=0){
  const info=experimentIds.has(activeVehicle.id)?experimentMass(activeVehicle):null;
  $('lab-mass').hidden=mode!=='lab'||!info;
  if(!info)return;
  $('lab-mass-total').textContent=Math.round(info.total+ballastKg).toLocaleString('ko-KR')+' kg';
  $('lab-mass-detail').textContent='차체·장치 '+Math.round(activeVehicle.dryMass).toLocaleString('ko-KR')+
    (ballastKg?' + 추가 '+ballastKg:'')+' + 기체 '+Math.round(info.gas)+' kg'+(info.assumed?' · 질량 가정값':'');
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

function vehicleCredit(p){return '<a href="'+escape(p.source)+'" target="_blank" rel="noopener noreferrer">'+'차체 외형: '+escape(p.author)+'</a> · <a href="'+escape(p.licenseUrl)+'" target="_blank" rel="noopener noreferrer">'+escape(p.license)+'</a>'+' · 수정 적용';}
async function selectVehicle(id,{forLanding=false}={}){
  if(vehicleLoading)return false;
  if(race)return false;
  if(mode==='city'&&cityPoseReady)mapSession.remember(sim,cityDistance);
  if(!forLanding)cancelLanding();
  const profile=vehicleProfile(id);vehicleLoading=true;setPaused(true);$('vehicle-select').disabled=true;$('city-vehicle-select').disabled=true;
  $('model-status').hidden=false;$('model-status').textContent=profile.short+' 불러오는 중…';
  try{
    vehicleLoadTask=scene.loadVehicle(profile);const vehicle=await vehicleLoadTask;activeVehicle=profile;
    if(profile.id==='roadster')roadsterStudyGeometry={...vehicle.geometryParams};
    if(mode==='lab'&&experimentIds.has(profile.id))lastLabVehicleId=profile.id;
    Object.assign(sim.params,vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),{roadRoughness:0,aeroEnabled:false});reset({cancel:false,restoreCityPlace:mode==='city'});
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
  if(race)leaveRace();
  if(mode==='city'&&cityPoseReady)mapSession.remember(sim,cityDistance);
  cityPoseReady=false;mapPanel.close();
  const previousMode=mode,epoch=++modeEpoch;cancelLanding();clearDriveInputs();driver.reset();mode=next;cityLoading=mode==='city'&&!scene.city;
  camera=mode==='city'?'chase':'orbit';setPaused(true);
  scene.setMode(mode);scene.setCamera(camera);scene.focusPart(null);
  document.body.classList.toggle('inspect',mode==='inspect');document.body.classList.toggle('city',mode==='city');
  $$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
  $('inspect-panel').hidden=mode!=='inspect';$('lab-panel').hidden=mode!=='lab';$('part-card').hidden=true;selectedPartId=null;
  $('city-hud').hidden=mode!=='city';$('city-loading').textContent='서울 도로를 불러오는 중…';$('city-loading').hidden=!cityLoading;
  $('panel-toggle').textContent=mode==='inspect'?'☷ 부품 목록':'☷ 실험 설정';$('camera-label').textContent=cameraLabel();
  $('world').setAttribute('aria-label',mode==='city'?'서울 실제 도로 기반 자유 주행':'착지 충격과 차체 구조를 관찰하는 3D 공간');
  if(mode==='city'){
    mapPanel.load();
    try{await scene.loadCity();if(epoch!==modeEpoch)return;cityLoading=false;$('city-loading').hidden=true;reset({cancel:false,restoreCityPlace:true});$('world').focus({preventScroll:true});}
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
  const available=catalog.filter(p=>p.kind!=='hypothesis'||$('show-hypotheses').checked);
  const filtered=available.filter(p=>(!category||p.category===category)&&(!query||[p.title,p.sourceName,p.sourceObjectName,...(p.materialNames||[])].join(' ').toLocaleLowerCase().includes(query)));
  $('catalog-summary').textContent=catalog.length?(scene.vehicle.referenceRoadster?'재현 외형 ':'원본 외형 ')+catalog.filter(p=>p.kind==='model').length+'개 메시 · 기계 단면 '+catalog.filter(p=>scene.vehicle.detailParts.get(p.id)?.userData.powertrainSection).length+'개':'원본 외형을 불러오는 중…';
  $('part-count').textContent=filtered.length+' / '+available.length+'개 항목';
  $('part-buttons').innerHTML=filtered.map(p=>'<button type="button" data-part="'+escape(p.id)+'" class="'+(p.id===selectedPartId?'active ':'')+(scene.hiddenParts.has(p.id)?'part-hidden':'')+'" aria-pressed="'+(p.id===selectedPartId)+'"><span>'+escape(p.title)+'</span><small>'+escape(p.categoryLabel)+' · '+escape(p.kind==='hypothesis'?'교육용 가정':p.kind==='reference'?'자료 기반 단면':p.id.replace('model-','#'))+(scene.hiddenParts.has(p.id)?' · 숨김':'')+'</small></button>').join('');
  if(focusedPart)$$('[data-part]').find(b=>b.dataset.part===focusedPart)?.focus({preventScroll:true});
  $('part-empty').hidden=filtered.length>0;
  $('part-empty').textContent=catalog.length?'검색 결과가 없습니다. 검색어나 분류를 바꿔보세요.':'모델이 준비되면 세부 항목이 표시됩니다.';
  $('inspector-state').textContent=scene.isolatedPartId?'선택 항목만 표시 중':scene.hiddenParts.size?scene.hiddenParts.size+'개 항목 숨김':'전체 구성 표시';
  updatePartActions();
}
function refreshPartCatalog(){
  const ids=scene.vehicle.detailParts;
  const engine=ids?.has('engine-assembly'), motor=ids?.has('drive-front');
  const button=$('drivetrain-focus');
  button.hidden=!engine&&!motor;
  button.dataset.partId=engine?'engine-assembly':'drive-front';
  button.textContent=engine?'엔진 단면':'전동기 단면';
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
  const part=scene.vehicle.detailParts.get(id);
  const suspension=id==='suspension', powertrain=!!part?.userData.powertrainSection;
  const animates=suspension||id==='engine-assembly'||id.startsWith('drive-');
  $('part-mechanism').hidden=!(suspension||powertrain);
  $('part-description').textContent=suspension?suspensionDescription(activeVehicle.id):(entry.description||entry.geometryNote||'');
  const source=suspension?suspensionLayout(activeVehicle.id).source:entry.sourceUrl;
  const link=$('part-source');
  link.hidden=!source;
  if(source)link.href=source;else link.removeAttribute('href');
  $('part-motion').hidden=!animates;
  $('engine-strokes').hidden=id!=='engine-assembly';
  syncStrokeLegend();
  syncPartMotion();
  $('part-card').hidden=false;
  renderPartCatalog();
  if(matchMedia('(max-width:1000px)').matches){$('left-panel').classList.remove('open');$('panel-toggle').textContent='☷ 부품 목록';}
}

function syncStrokeLegend(){
  const shown=selectedPartId==='engine-assembly'&&!!scene.showEngineStrokes;
  $('engine-strokes').setAttribute('aria-pressed',String(shown));
  $('stroke-legend').hidden=!shown;
}
function syncPartMotion(){
  const button=$('part-motion');
  button.textContent=scene.mechanismPlaying?'작동 정지':'작동 재생';
  button.setAttribute('aria-pressed',String(!!scene.mechanismPlaying));
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
  $('city-drive-focus').addEventListener('click',()=>toggleCockpitPanels(false));
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
  return ({charging:'주변 공기 흡입 · 압축 중',moving:'정차 후 충전',airborne:'지상에 착지한 뒤 충전',thrusters:'분사 종료 후 충전',full:'탱크 충전 한도',ready:'운용 충전 완료 · 99%',cooling:'냉각하며 충전',battery:'배터리 부족',off:'충전 대기'})[t.compressorState]||'충전 대기';
}
function updateCityExperiments(t){
  if($('city-experiments').hidden)return;
  if($('city-tire-details').open)cityTires(sim);
  $('city-friction-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';
  $('city-air-force').textContent=(t.airDragN/1000).toFixed(2)+' kN';
  $('city-rolling-force').textContent=(t.rollingResistanceN/1000).toFixed(2)+' kN';
  $('city-thrust-force').textContent=(t.thrustN/1000).toFixed(1)+' kN';
  $('city-contacts').textContent=t.contactCount+' / 4';$('city-gas-flow').textContent=t.massFlowKgS.toFixed(1)+' kg/s';
  $('city-fan-force').textContent=(t.fanN/1000).toFixed(2)+' kN';
  $('city-fan-power').textContent=((t.fanPowerW||0)/1000).toFixed(1)+' kW';
  $('city-tank-pressure').textContent=t.pressureMPa.toFixed(2)+' MPa';
  $('city-charge-flow').textContent=(t.compressorFlowKgS||0).toFixed(3)+' kg/s';
  $('city-charge-power').textContent=((t.compressorPowerW||0)/1000).toFixed(1)+' kW';
  $('city-battery').textContent=(100*sim.state.batteryJ/(sim.params.batteryKWh*3.6e6)).toFixed(1)+'%';
  $('city-charge-status').textContent=compressorStatus(t)+' · 충전한 공기 '+(t.gasRefilledKg||0).toFixed(2)+' kg';
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
  const activatesControl=e=>e.code==='Space'&&e.target?.closest?.('button:not([data-drive]),summary');
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
    if(race?.phase==='finished')return false;
    if(paused)setPaused(false);
    return true;
  };
  window.addEventListener('keydown',e=>{
    if(mode==='city'&&e.code==='Enter'&&e.target?.matches?.('input[type="number"]')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!document.querySelector('dialog[open]')){
      e.preventDefault();clear();$('world').focus({preventScroll:true});return;
    }
    if(!freeDriving()||!DRIVE_KEYS.has(e.code)||editable(e.target)||activatesControl(e)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();
    // Only a new press may take control after a pause, reset or focus change.
    if(!e.repeat&&readyToDrive()){keyboardKeys.add(e.code);sync();}
  });
  window.addEventListener('keyup',e=>{
    if(!DRIVE_KEYS.has(e.code))return;
    keyboardKeys.delete(e.code);sync();
    if(mode==='city'&&!editable(e.target)&&!activatesControl(e))e.preventDefault();
  });
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
  if(race){drawRaceMap($('city-map').getContext('2d'),race,sim.state.pos,t.attitude.yaw);return;}
  if(!cityPoseReady)return;
  const x=sim.state.pos.x,z=sim.state.pos.z;
  mapSession.sample(x,z);
  mapPanel.update({x,z,yaw:t.attitude.yaw,route:mapSession.segments,routeRevision:mapSession.revision,
    roads:city.roads,portals:city.streetOverlay?.portals,cells:city.streetOverlay?.cells});
}
function updateCityHUD(t){
  $('city-camera').textContent=camera==='orbit'?'◉ 자유':camera==='hood'?'◉ 운전석':'◉ 추적';
  $('city-speed').textContent=Math.round(t.horizontalSpeed*3.6);$('city-gear').textContent=t.horizontalSpeed<.1&&!driveInput.throttle?'N':driveGear;
  if(race){updateRaceHUD(race,t,driver);drawCityMap(t);return;}
  const near=scene.city?.streetOverlay?.portals?.nearest(sim.state.pos.x,sim.state.pos.z);
  $('race-entrance-hint').hidden=!near;
  if(near){
    const dx=near.x-sim.state.pos.x,dz=near.z-sim.state.pos.z;
    const relative=Math.atan2(dz,dx)+t.attitude.yaw;
    const arrow=['↑','↗','→','↘','↓','↙','←','↖'][(Math.round(relative/(Math.PI/4))+16)%8];
    $('race-entrance-text').textContent=near.label+' · 경주 입구 '+arrow+' '+Math.round(near.distance)+' m';
  }
  const forward=new Vector3(1,0,0).applyQuaternion(sim.state.q),acceleration=t.acceleration.dot(forward);
  $('city-acceleration').textContent=(acceleration>=0?'+':'')+acceleration.toFixed(1)+' m/s² · '+(acceleration/sim.params.gravity).toFixed(1)+' g';
  $('city-distance').textContent=(cityDistance/1000).toFixed(2)+' km · 탱크 '+t.pressureMPa.toFixed(1)+' MPa';
  $('city-compressor').setAttribute('aria-pressed',driver.compressorEnabled);
  $('city-compressor').textContent=driver.compressorEnabled?(['ready','full'].includes(t.compressorState)?'충전 완료':['charging','cooling'].includes(t.compressorState)?'충전 중 · 중지':'충전 대기 · 중지'):'공기 충전';
  const charge=rechargeReadout.update(sim.state,sim.params,{enabled:driver.compressorEnabled,capacityKg:sim.initialGas,powerBudgetW:sim.params.batteryMaxDischargeKW*1000,status:t.compressorState});
  $('city-recharge').hidden=!driver.compressorEnabled;
  $('city-recharge').textContent=charge?charge.text+' · '+((t.compressorPowerW||0)/1000).toFixed(0)+' kW':'';
  $('city-compressor').title=compressorStatus(t);
  $('city-motion').textContent=paused?'일시정지':driver.landingAssist?'착지 보조':t.saturation&&driver.airborne?'추력 한계':driveInput.airBrake?'공중 제동':driveInput.lift?'상승 분사':driver.altHold?'고도 유지':driveInput.handbrake?'드리프트':driveInput.boost?'F 추진 가속':driver.airborne?'자유 비행':t.horizontalSpeed<.1&&!driveInput.throttle?'정지 유지':driveInput.brake>.3?'제동':driveInput.corneringAssist?'코너링 보조':driveInput.throttle?'가속':driveInput.brake>0?'페달 해제 감속':'타력';
  if(['prepare','rolling','recovering'].includes(driver.maneuverStatus))$('city-motion').textContent=maneuverLabels[driver.maneuverStatus];
  $('city-altitude').textContent=t.heightAboveSurface.toFixed(1)+' m';
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
  $('city-flight-status').textContent=paused?'운전 키를 누르면 재개 · R 지상 복귀':t.status==='GAS DEPLETED'?'기체 소진 · 정차 후 공기 충전':driver.airborne?(driver.flightSteering==='turn'?'W/S 추진 · A/D 선회 · Q/E 회전':'WASD 수평 이동 · Q/E 회전'):'W 전진 · F 가속 · Shift 드리프트 · B 제동';
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
  const compact=mode==='city'&&compactCityViewport.matches;
  const drawer=inside||compact;
  if(inside!==lastCockpitView||!drawer){cockpitPanelsOpen=false;lastCockpitView=inside;}
  document.body.classList.toggle('cockpit-view',inside);
  document.body.classList.toggle('compact-city-hud',compact);
  document.body.classList.toggle('cockpit-panels-open',drawer&&cockpitPanelsOpen);
  $('cockpit-tools').hidden=!drawer;
  $('cockpit-exit').textContent=inside?'외부 시점 C':'시점 C';
  $('cockpit-exit').title=inside?'외부 시점 (C)':'시점 변경 (C)';
  $('cockpit-toggle').setAttribute('aria-expanded',drawer&&cockpitPanelsOpen);
  $('cockpit-toggle').textContent=cockpitPanelsOpen?'설정 닫기':'차량 · 설정';
  $('cockpit-controls').setAttribute('aria-pressed',document.body.classList.contains('show-drive-controls'));
}
function toggleCockpitPanels(open=!cockpitPanelsOpen){
  clearDriveInputs();cockpitPanelsOpen=!!open;
  if(open){
    document.body.classList.toggle('show-drive-controls',false);
    $('city-controls').setAttribute('aria-pressed',false);
  }
  syncCockpitHUD();
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
  $('landing-current-trial').textContent=landingSession?Math.min(landingSession.index+1,landingSession.jobs.length)+' / '+landingSession.jobs.length+' · '+({free:'자유 낙하',brake:'추력 제동',gentle:'완만한 하강',eco:'절약 착지'}[trialMethod]||'준비 중'):'자유 조종';
  $('landing-playback').hidden=mode!=='lab';
  $('landing-suspension').setAttribute('aria-pressed',String(showLandingSuspension));
  $('camera').title=mode==='lab'?'기본 관찰 시점 복원 (C)':'카메라 전환 (C)';
  $('camera-label').textContent=cameraLabel();
  $('landing-step').disabled=!(mode==='lab'&&landingRun&&paused&&!vehicleLoading);
  $('vectors').textContent=mode==='lab'?'∑ 물리 표시':'↗ 힘 벡터';
  $('vectors').setAttribute('aria-pressed',mode==='lab'?landingLearningVisible:showVectors);
  if(mode==='city'){updateCityHUD(t);return;}
  if(mode==='lab'&&$('landing-diagnostics').open)labTires(sim);
  landingLiveUI?.setVisible(mode==='lab'&&landingLearningVisible);
  landingLiveUI?.update(sim,scene.landingVisual,run,{active:!!landingRun,paused});
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
  $('lab-friction-force').textContent=(t.frictionForceN/1000).toFixed(2)+' kN';
  $('lab-surface').disabled=!!landingSession;
  const liftReady=mode==='lab'&&!!landingRun&&!paused&&!vehicleLoading&&landingRun.touchdownTime===null;
  if(!liftReady&&landingLiftHeld)clearLandingLift();
  $('status-badge').textContent=landingRun?(paused?'일시정지':landingLiftHeld?'수동 분사':t.contactCount?'접촉':(landingRun.method==='eco'?landingPhaseLabel(sim,landingRun,{active:true}):'하강')):lastResult?'측정 완료':'준비';
}
function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  $('guide-content').innerHTML=tab==='sources'?'<p>AI 경주차 외형은 Lexyc16의 <a href="https://sketchfab.com/3d-models/none-db9a5f7ae9d84a0fb01cac96afe3e69c" target="_blank" rel="noopener noreferrer">Nissan Z Proto</a>이며 축척·도색·바퀴 회전을 적용했습니다. <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p><p>공기 장치: <a href="https://github.com/leejuhan-1214/roadster/blob/main/docs/roadster-air-systems.md" target="_blank" rel="noopener noreferrer">테슬라 특허·공식 자료와 구현 가정</a></p><p>착지 탐구: <a href="https://github.com/leejuhan-1214/roadster/blob/main/docs/landing-study-guide.md" target="_blank" rel="noopener noreferrer">실험 설계·물리식·축소 실험·출처</a></p><p>2020 Roadster 외형을 포함한 77종에 공통 가상 추진 장치를 적용했습니다. 이 장치는 각 실차의 기본 사양이 아닙니다. 실험 5종은 동일한 375 kg 초기 공기를 사용하며 차체별 분사 위치가 다릅니다. <a href="./assets/vehicles/vehicle-specifications.md" target="_blank" rel="noopener noreferrer">제원 기준</a></p>'+'<p>환경: <a href="./assets/environment/sky/LICENSE.txt" target="_blank" rel="noopener noreferrer">촬영 하늘</a> · <a href="./assets/environment/road/LICENSE.txt" target="_blank" rel="noopener noreferrer">도로 재질</a>  · <a href="./assets/trees/LICENSE.txt" target="_blank" rel="noopener noreferrer">스캔 나무 모델</a> · Poly Haven CC0 · 은행·양버즘·느티·왕벚·메타세쿼이아·소나무는 수종별 규칙으로 생성한 모델(실측 아님)</p><p>운전석: <a href="https://github.com/leejuhan-1214/roadster/blob/main/docs/cockpit-references.md" target="_blank" rel="noopener noreferrer">실내 참고 자료와 구현 범위</a></p><p>강남 건물: <a href="./assets/city-buildings/README.txt" target="_blank" rel="noopener noreferrer">공식 건축 자료와 OSM에 기반한 재현 모델 · 출처</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join(''):'<ol><li>차체와 출발 높이를 선택합니다.</li><li>4방식 비교로 자유 낙하·추력 제동·완만한 하강·절약 착지를 같은 조건에서 비교합니다.</li><li>제동 높이와 서스펜션을 바꿔 충격을 줄이는 조건을 찾습니다.</li><li>비교 결과에서 이론값 검증·제동 높이·기체 소비와 반력 그래프를 확인합니다.</li><li>물리 표시(V)로 중력·추력·연속 지면반력을 비교합니다. 실험 재생을 0.25×/0.1×로 낮추거나 P로 멈춘 뒤 +2 ms씩 관찰할 수 있습니다.</li></ol><p>드래그: 시점 회전 · P: 실험 일시정지 · C: 시점 복원 · V: 물리 표시 · R: 초기화</p><p>구조 탐색에서 스크롤하면 분해·조립합니다. 도시 주행: W/↑ 가속, S/↓ 제동·후진, A/D 방향, B 제동. Space 상승, F 추진 가속 · Shift 드리프트, H 현재 고도 유지. 공중 기본 A/D는 차체 방향을 유지하는 좌우 수평 분사, W/S는 전후 추진입니다. Q/E는 기수 회전, 화살표는 자세 제어입니다. 각 차체는 Space로 충분히 상승한 뒤 X를 누르면 분사로 한 바퀴 회전한 뒤 자세를 회복합니다. 질량·관성·높이·기체 조건이 부족하면 시작하지 않습니다. B는 회전을 취소하고 제동합니다. 조작 중 높이 보정은 기체를 사용하며 H는 지속적인 높이 유지입니다. 착지 보조는 수평 속도를 줄여 하강하며 수동 키를 누르면 해제됩니다. B는 기체를 써서 공중 감속하며 가스가 떨어지면 제어할 수 없습니다. C: 추적→운전석→자유 시점. 운전석에서 드래그로 둘러보고 두 번 클릭하면 정면으로 돌아옵니다. 휠은 시야각을 조절합니다. 운전석의 차량·설정 버튼으로 차량 목록과 전체 계기를 열고, Escape로 닫습니다. 12종은 원본 모델 실내를 사용하며, 나머지는 차종별 자료를 참고한 재현 실내입니다. 원본 계기 텍스처는 시각 자료이고 실제 속도는 HUD에서 확인합니다. 팬 접지 보조는 지상 가속·제동 때 바닥의 공기를 빼서 접지력을 높이며 배터리를 사용합니다. 공중 부양은 별도의 압축기체 노즐이 담당합니다. 공기 충전을 켜면 정차·분사 종료 후 배터리로 주변 공기를 압축해 탱크를 채웁니다. 충전은 압축에 필요한 일과 냉각을 계산하며 운용 기준인 99%에서 멈춥니다. 300 kW 압축기와 5 kW 냉각 보조장치는 가정값이며 실제 자동차의 탑재 사양이 아닙니다. 화면의 예상 시간은 현재 기체량·온도·배터리를 반영합니다. R은 출발점·탱크·배터리를 초기화하는 시뮬레이션 복귀입니다. 화면의 조작 버튼으로도 사용할 수 있습니다. 실험 패널에서 노면·구름저항·항력·바람을 바꾸고 같은 속도에서 B를 눌러 제동거리를 비교합니다.</p>';
  if(tab==='controls'&&mode==='city'){
    const info=document.createElement('p');
    const mapHelp=document.createElement('p');
    mapHelp.textContent='서울 지도 · 미니맵 또는 M을 눌러 한강·다리·랜드마크와 주행 경로를 봅니다. 드래그로 이동하고 휠 또는 두 손가락으로 확대합니다. 내 차를 누르면 현재 위치로 지도가 돌아옵니다.';
    $('guide-content').append(mapHelp);
    info.textContent='미니맵의 금색 마름모를 찾아 역 출입구로 들어가면 AI 3대와 2랩을 달립니다. 차량 설정이나 경주 화면에서 AI 난이도를 바꿀 수 있습니다. 서킷에서는 분사 기체가 무제한입니다. 매 랩 비행 구간에서 Space로 상승하고 공중 A/D로 옆으로 이동해 강조된 링을 차례로 통과하세요. Space를 놓으면 상승 분사가 멈춥니다. H는 현재 고도 유지, F는 부스트입니다. 링을 놓치면 이륙 구간으로 돌아갑니다. R은 트랙 복귀, 도시로 버튼은 역 출구 옆으로 복귀합니다.';
    $('guide-content').prepend(info);
  }
}
function openGuide(tab='controls'){renderGuide(tab);$('guide-modal').showModal();}
function focusApparatus(id){
  const entry=scene.getPartCatalog().find(p=>p.id===id);
  if(!entry)return;
  if(entry.kind==='hypothesis'){$('show-hypotheses').checked=true;scene.setHypothesesVisible(true);}
  $('part-search').value='';$('part-category').value='';
  const mechanical=id==='suspension'||!!scene.vehicle.detailParts.get(id)?.userData.powertrainSection;
  refreshPartCatalog();scene.setExplode(mechanical?0:.65,true);scene.focusPart(id);if(scene.isolatedPartId!==id)scene.isolatePart(id);selectPart(id);scene.frameSelectedPart();
}
function setSettingsPanel(open){
  $('left-panel').classList.toggle('open',open);
  $('panel-toggle').setAttribute('aria-expanded',String(open));
  if(open)$('left-panel').scrollTop=0;
  scene.inspectionViewport();
}
function setupRaceDifficulty(){
  const controls=[$('city-race-difficulty'),$('race-difficulty')];
  const storageKey='roadster.raceDifficulty';
  // Some private or embedded browsers disable persistent storage.
  try{preferredRaceDifficulty=normalizeRaceDifficulty(window.localStorage.getItem(storageKey));}catch{}
  for(const control of controls){
    control.value=preferredRaceDifficulty;
    let pointerChoice=false;
    control.addEventListener('pointerdown',()=>{pointerChoice=true;});
    control.addEventListener('keydown',()=>{pointerChoice=false;});
    control.addEventListener('change',()=>{
      preferredRaceDifficulty=normalizeRaceDifficulty(control.value);
      for(const selector of controls)selector.value=preferredRaceDifficulty;
      if(race&&race.phase!=='finished')race.setDifficulty(preferredRaceDifficulty);
      try{window.localStorage.setItem(storageKey,preferredRaceDifficulty);}catch{}
      if(pointerChoice)$('world').focus({preventScroll:true});
      pointerChoice=false;
    });
  }
}
function setupUI(){
  setupRaceDifficulty();
  mapPanel=createSeoulMapPanel({
    beforeOpen(){
      if(mode!=='city'||!cityPoseReady||vehicleLoading||race)return false;
      clearDriveInputs();accumulator=0;renderStates.reset(sim);drawCityMap(sim.telemetry());
      return true;
    },
    afterClose(){if(mode==='city')$('world').focus({preventScroll:true});}
  });
  for(const stroke of ENGINE_STROKES){
    const label=document.createElement('span');
    label.style.setProperty('--stroke-color',stroke.color);
    label.textContent=stroke.label;
    $('stroke-legend').append(label);
  }
  labTires=createTireReadout($('lab-wheel-loads'));
  cityTires=createTireReadout($('city-wheel-loads'));
  refreshVehiclePicker();
  landingUI=new LandingUI({vehicles:EXPERIMENT_VEHICLES,getHeightStudySource,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onCompareFleetMethods:()=>startLanding('fleet-methods'),onCompareBrakeHeights:()=>startLanding('brake-heights'),onCompareBallast:()=>startLanding('ballast'),onStop:stopLanding,onConfigure:()=>setSettingsPanel(true)});
  landingLiveUI=new LandingLiveUI($('telemetry'));
  scene.setLandingLearningVisible(landingLearningVisible);
  $('landing-speed').addEventListener('change',event=>{landingPlaybackRate=Number(event.target.value)||1;accumulator=0;});
  $('landing-step').addEventListener('click',()=>{if(mode==='lab'&&landingRun&&paused&&!vehicleLoading){landingSession.singleStepping=true;stepSimulation();renderStates.reset(sim);updateUI();}});
  renderCityVehicleOptions();
  $('city-vehicle-search').addEventListener('input',()=>{clearDriveInputs();renderCityVehicleOptions();});
  $('city-vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $('city-reset').addEventListener('click',()=>reset());
  $('race-recover').addEventListener('click',recoverRace);
  $('race-exit').addEventListener('click',leaveRace);
  $('race-return').addEventListener('click',leaveRace);
  $('race-land').addEventListener('click',()=>{
    if(race?.phase!=='racing')return;
    clearDriveInputs();driver.toggleLandingAssist(sim);setPaused(false);
    $('world').focus({preventScroll:true});
  });
  $('race-retry').addEventListener('click',()=>{if(race)startRace(cityReturn.gate);});
  $('city-controls').addEventListener('click',()=>{clearDriveInputs();showCityExperiments(false);const shown=document.body.classList.toggle('show-drive-controls');$('city-controls').setAttribute('aria-pressed',shown);if(shown&&cockpitPanelsOpen)toggleCockpitPanels(false);});
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
  $('reset').addEventListener('click',()=>{if(race){recoverRace();return;}reset();scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);if(mode==='city')scene.frameCityStart(sim);else if(mode==='lab')restoreLabView();else scene.frameWholeVehicle({resetView:true});selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();toast('초기화 · 비교 기록은 유지됩니다.');});
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
  $('drivetrain-focus').addEventListener('click',e=>focusApparatus(e.currentTarget.dataset.partId));
  $('engine-strokes').addEventListener('click',()=>{
    if(mode!=='inspect'||selectedPartId!=='engine-assembly')return;
    if(scene.isolatedPartId!==selectedPartId){
      scene.isolatePart(selectedPartId);
      scene.frameSelectedPart();
      updatePartActions();
    }
    scene.setStrokeDisplay(!scene.showEngineStrokes);
    syncStrokeLegend();
  });
  $('part-motion').addEventListener('click',()=>{
    if(mode!=='inspect'||!selectedPartId)return;
    if(!scene.mechanismPlaying){
      if(scene.isolatedPartId!==selectedPartId)scene.isolatePart(selectedPartId);
      scene.setExplode(0,true);
      scene.frameSelectedPart();
    }
    scene.mechanismPlaying=!scene.mechanismPlaying;
    syncPartMotion();
    updatePartActions();
  });
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
  $('landing-suspension').addEventListener('click',()=>{
    showLandingSuspension=!showLandingSuspension;
    $('landing-suspension').setAttribute('aria-pressed',String(showLandingSuspension));
  });
  $('part-close').addEventListener('click',()=>{$('part-card').hidden=true;selectedPartId=null;scene.focusPart(null);renderPartCatalog();});
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();$('left-panel').classList.remove('open');if(mode==='city'&&cockpitPanelsOpen)toggleCockpitPanels(false);showCityExperiments(false);$('world').focus({preventScroll:true});return;}
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat||e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(e.code==='KeyM'&&mode==='city'&&!race){e.preventDefault();mapPanel.open();}
    else if(e.code==='KeyP'&&(landingRun||freeDriving())){e.preventDefault();setPaused(!paused);}
    else if(e.code==='KeyR')$('reset').click();else if(e.code==='KeyC')$('camera').click();else if(e.code==='KeyV')$('vectors').click();
    else if(e.code==='Escape'){$('left-panel').classList.remove('open');showCityExperiments(false);}
  });
  document.addEventListener('visibilitychange',()=>{clearDriveInputs();accumulator=0;renderStates.reset(sim);lastStamp=0;frames=0;frameTimer=0;});
  window.addEventListener('resize',()=>{scene.resize();if(landingRun&&matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');});
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));$('world').addEventListener('contextmenu',e=>e.preventDefault());
  scene.setHypothesesVisible(true);refreshPartCatalog();
  if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.add('open');
}
function animate(stamp){
  requestAnimationFrame(animate);
  if(document.hidden)return;
  const frameMs=lastStamp?stamp-lastStamp:1000/60,elapsed=Math.min(frameMs/1000,.1);lastStamp=stamp;
  if(mapPanel?.isOpen)return;
  const blocked=!!document.querySelector('dialog[open]');
  if(blocked&&landingLiftHeld)clearLandingLift();
  if(mode==='city'&&!race)scene.city?.streaming?.update(sim.state.pos.x,sim.state.pos.z,sim.state.vel.x,sim.state.vel.z);
  if(((landingRun&&mode==='lab')||freeDriving())&&!vehicleLoading&&!cityLoading&&!paused&&!blocked){
    const debt=accumulator+elapsed*(landingRun?landingPlaybackRate:1);
    // A missed refresh gives the integrator more time. A fixed small budget
    // at 5–15 FPS can otherwise make the vehicle barely move between frames.
    const budgetMs=Math.min(100,Math.max(6,frameMs*.55));
    accumulator=advanceFrame(debt,LANDING_STEP,budgetMs,
      ()=>{stepSimulation();return !paused;},
      ()=>renderStates.captureStart(sim),()=>renderStates.afterStep(sim));
  }else accumulator=0;
  scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,modalOpen:blocked,vectors:showVectors,explode:Number($('explode').value),paint:$('city-paint').value,wing:false,cutaway:mode==='lab'&&showLandingSuspension,renderState:renderStates.sample(paused||mode==='inspect'||blocked?1:accumulator/LANDING_STEP)});
  if(stamp-lastUI>80){updateUI();lastUI=stamp;}frames++;frameTimer+=frameMs/1000;
  if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent=cameraLabel();});
  scene.setMode('lab');scene.setCamera(camera);setupUI();sim.setObstacles(FACILITY_SOLIDS);updateUI();requestAnimationFrame(animate);
  selectVehicle('roadster').then(ready=>{
    if(!ready)return;
    const requestedMode=new URLSearchParams(location.search).get('mode');
    if(!modeEpoch&&['inspect','city','race'].includes(requestedMode)){
      setMode(requestedMode==='race'?'city':requestedMode).then(async()=>{
        if(requestedMode==='race'&&mode==='city'&&modeEpoch===1&&cityPoseReady){startRace(null);return;}
        if(mode!=='inspect'||requestedMode!=='inspect')return;
        const query=new URLSearchParams(location.search),id=query.get('vehicle');
        if(id&&id!==activeVehicle.id&&VEHICLES.some(v=>v.id===id))await selectVehicle(id);
        if(mode==='inspect'&&query.has('part'))focusApparatus(query.get('part'));
      });
    }
    else if(!modeEpoch&&mode==='lab'&&new URLSearchParams(location.search).get('study')==='brake-height')landingUI.openHeightStudy();
    else if(mode==='lab')landingPlanner.warm();
  });
  // ?debug exposes the running objects for inspection; it changes no behaviour.
  if(new URLSearchParams(location.search).has('debug'))window.__roadster={get sim(){return sim;},scene,mapSession,get driver(){return driver;},get race(){return race;},driveKeys,reset,setMode,setPaused,get mode(){return mode;},get paused(){return paused;}};
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
}catch(error){console.error(error);$('boot-message').textContent='3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';}
