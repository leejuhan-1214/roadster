import {Vector3} from 'three';
import {DrivingController,CITY_DRIVE_PARAMS} from './driving-input.js?v=20261109-gangnam1';
import {VEHICLES,vehicleProfile,vehiclePhysics} from './vehicle-profiles.js?v=20261109-assessment1';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from './landing-experiment.js?v=20261109-city1';
import {LandingUI} from './landing-ui.js?v=20261109-city1';
import {RenderStateBuffer} from './render-state.js?v=20261107-drive2';
import {PhysicsSim,DEFAULTS} from './physics.js?v=20261109-city1';
import {FlightScene} from './scene.js?v=20261109-gangnam1';

const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});
const renderStates=new RenderStateBuffer(sim);
let scene,landingUI,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='lab',camera='orbit',paused=true,showVectors=false;
let cityLoading=false,modeEpoch=0,cityDistance=0,driveInput={},driveGear='D';
const driveKeys=new Set(),driver=new DrivingController(),worldUp=new Vector3(0,1,0);
const DRIVE_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyB','KeyH','KeyQ','KeyE','ShiftLeft','ShiftRight']);
const cameraLabel=()=>camera==='top'?'상부 카메라':camera==='chase'?'추적 카메라':camera==='hood'?'운전석 카메라':'자유 카메라';
let landingSession=null,landingRun=null,lastResult=null,landingSerial=0;
let lastStamp=0,accumulator=0,lastUI=0,frames=0,frameTimer=0,toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setPaused(value){
  paused=value;if(value)driveKeys.clear();accumulator=0;renderStates.reset(sim);
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
  driveKeys.clear();driver.reset();driveInput={};cityDistance=0;
  const parameters=vehiclePhysics(activeVehicle,scene?.vehicle?.geometryParams,DEFAULTS);
  if(mode==='city')Object.assign(parameters,CITY_DRIVE_PARAMS);
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
    landingRun=createLandingRun(sim,{...session.settings,method:job.method,vehicleId:activeVehicle.id,title:activeVehicle.title});
    lastResult=null;
    session.metadata={...session.settings,method:job.method,groupId:session.groupId,groupSize:session.jobs.length,groupKind:session.kind,vehicleId:activeVehicle.id,vehicleTitle:activeVehicle.title,id:session.groupId+'-'+session.index,initialMass:sim.mass,initialGas:sim.initialGas,tankVolume:sim.params.tankVolume,tankPressureMPa:sim.params.tankPressureMPa,initialTemperature:sim.params.initialTemperature};
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
    renderStates.beforeStep();sim.step(LANDING_STEP,driveInput);renderStates.afterStep(sim);
    cityDistance+=Math.hypot(sim.state.vel.x,sim.state.vel.z)*LANDING_STEP;return;
  }
  if(!landingRun)return;
  renderStates.beforeStep();sim.step(LANDING_STEP,landingRunInput(landingRun,sim));renderStates.afterStep(sim);
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
  const epoch=++modeEpoch;cancelLanding();driveKeys.clear();driver.reset();mode=next;cityLoading=mode==='city'&&!scene.city;
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

function setupDriveControls(){
  const editable=target=>target?.matches?.('input,textarea,select,[contenteditable="true"]');
  const readyToDrive=()=>{
    if(mode!=='city'||cityLoading||vehicleLoading)return false;
    if(paused)setPaused(false);
    return true;
  };
  window.addEventListener('keydown',e=>{
    if(mode!=='city'||!DRIVE_KEYS.has(e.code)||editable(e.target)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    e.preventDefault();if(readyToDrive())driveKeys.add(e.code);
  });
  window.addEventListener('keyup',e=>{if(DRIVE_KEYS.has(e.code)){driveKeys.delete(e.code);if(mode==='city'&&!editable(e.target))e.preventDefault();}});
  window.addEventListener('blur',()=>driveKeys.clear());
  $$('[data-drive]').forEach(button=>{
    const release=()=>{driveKeys.delete(button.dataset.drive);button.classList.remove('held');};
    button.addEventListener('pointerdown',e=>{if(!readyToDrive())return;e.preventDefault();button.setPointerCapture(e.pointerId);driveKeys.add(button.dataset.drive);button.classList.add('held');});
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
  $('city-motion').textContent=paused?'일시정지':t.saturation&&driver.airborne?'추력 한계':driveInput.airBrake?'공중 제동':driveInput.lift?'상승 분사':driver.altHold?'고도 유지':driveInput.boost?'추진 분사':driver.airborne?'자유 비행':t.horizontalSpeed<.1&&!driveInput.throttle?'정지 유지':driveInput.brake>.3?'제동':driveInput.throttle?'가속':driveInput.brake>0?'페달 해제 감속':'타력';
  $('city-altitude').textContent=Math.max(0,landingClearance(sim)).toFixed(1)+' m';
  $('city-vertical').textContent=(t.verticalSpeed>=0?'+':'')+t.verticalSpeed.toFixed(1)+' m/s';
  $('city-gas').textContent=t.gasKg.toFixed(0)+' kg';
  const steering=sim.wheels.slice(0,2).reduce((sum,w)=>sum+w.steer,0)*90/Math.PI;
  $('city-steering').textContent=(steering>.5?'좌 ':steering<-.5?'우 ':'조향 ')+Math.abs(steering).toFixed(0)+'°';
  $('city-drive-state').textContent=driver.airborne?'비행 · A/D 조향 + 분사':'지상 · A/D 앞바퀴 조향';
  $('city-hover').textContent=driver.altHold?'H 유지 '+driver.targetHeight.toFixed(1)+' m'+(t.saturation?' · 추력 한계':''):'H 고도 유지';
  $('city-hover').setAttribute('aria-pressed',driver.altHold);
  $('city-flight-status').textContent=paused?'운전 키를 누르면 재개 · R 지상 복귀':t.status==='GAS DEPLETED'?'기체 소진 · R 재충전':driver.airborne?'W A S D 분사 이동 · B 공중 감속':'W 가속 · A/D 조향 · B 제동';
  $('city-throttle').style.width=(Math.abs(driveInput.throttle||0)*100)+'%';$('city-brake').style.width=((driveInput.brake||0)*100)+'%';
  $('city-road').textContent=scene.city?.nearestRoadName?.(sim.state.pos.x,sim.state.pos.z)||'강남역 · 서울';
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
  $('status-badge').textContent=landingRun?(paused?'일시정지':t.contactCount?'접촉':'하강'):lastResult?'측정 완료':'준비';
}
function renderGuide(tab='controls'){
  $$('[data-guide]').forEach(b=>b.classList.toggle('active',b.dataset.guide===tab));
  $('guide-content').innerHTML=tab==='sources'?'<p>실차 외형 · 공통 가상 착지 장치 · <a href="./assets/vehicles/vehicle-specifications.md" target="_blank" rel="noopener noreferrer">제원 기준</a></p>'+'<p>환경: <a href="./assets/environment/sky/LICENSE.txt" target="_blank" rel="noopener noreferrer">촬영 하늘</a> · <a href="./assets/environment/road/LICENSE.txt" target="_blank" rel="noopener noreferrer">도로 재질</a>  · <a href="./assets/trees/LICENSE.txt" target="_blank" rel="noopener noreferrer">나무 모델</a> · Poly Haven CC0</p><p>강남 건물: <a href="./assets/city-buildings/README.txt" target="_blank" rel="noopener noreferrer">공식 건축 자료와 OSM에 기반한 재현 모델 · 출처</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join(''):'<ol><li>차체와 출발 높이를 선택합니다.</li><li>자유 낙하·추력 제동·완만한 하강을 비교합니다.</li><li>제동 높이와 서스펜션을 바꿔 충격을 줄이는 조건을 찾습니다.</li><li>비교 결과의 그래프와 CSV로 측정값을 확인합니다.</li></ol><p>드래그: 시점 회전 · P: 실험 일시정지 · C: 카메라 · V: 힘 벡터 · R: 초기화</p><p>구조 탐색에서 스크롤하면 분해·조립합니다. 도시 주행: W/↑ 가속, S/↓ 제동·후진, A/D 방향, B 제동. Space 상승, Shift 추진, H 현재 고도 유지. 공중에서는 WASD 분사 이동, Q/E 기수 회전, 화살표 자세 제어. B는 기체를 써서 공중 감속하며 가스가 떨어지면 제어할 수 없습니다. 드래그 시점 회전, 휠 확대, C 카메라, R 복귀·재충전. 화면의 조작 버튼으로도 사용할 수 있습니다.</p>';
}
function openGuide(tab='controls'){renderGuide(tab);$('guide-modal').showModal();}
function focusApparatus(id){
  if(!scene.getPartCatalog().some(p=>p.id===id))return;
  $('show-hypotheses').checked=true;scene.setHypothesesVisible(true);$('part-search').value='';$('part-category').value='';
  refreshPartCatalog();scene.setExplode(.65,true);scene.focusPart(id);if(scene.isolatedPartId!==id)scene.isolatePart(id);selectPart(id);scene.frameSelectedPart();
}
function setupUI(){
  $('vehicle-select').innerHTML=VEHICLES.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+'</option>').join('');
  landingUI=new LandingUI({vehicles:VEHICLES,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onCompareFleetMethods:()=>startLanding('fleet-methods'),onStop:stopLanding});
  $('city-vehicle-select').innerHTML=$('vehicle-select').innerHTML;
  $('city-vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $('city-reset').addEventListener('click',()=>reset());
  $('city-controls').addEventListener('click',()=>{const shown=document.body.classList.toggle('show-drive-controls');$('city-controls').setAttribute('aria-pressed',shown);});
  $('city-camera').addEventListener('click',()=>$('camera').click());
  $('city-hover').addEventListener('click',()=>{if(mode==='city'&&!cityLoading&&!vehicleLoading){if(paused)setPaused(false);driver.toggleAltitudeHold(sim);}});
  $('city-vectors').addEventListener('click',()=>$('vectors').click());
  setupDriveControls();
  $('vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('pause').addEventListener('click',()=>{if(landingRun||mode==='city'){driveKeys.clear();setPaused(!paused)};});
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
    if(e.metaKey||e.ctrlKey||e.altKey||e.repeat||e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if(e.code==='KeyP'&&(landingRun||mode==='city')){e.preventDefault();setPaused(!paused);}
    else if(e.code==='KeyR')$('reset').click();else if(e.code==='KeyC')$('camera').click();else if(e.code==='KeyV')$('vectors').click();
    else if(e.code==='Escape')$('left-panel').classList.remove('open');
  });
  document.addEventListener('visibilitychange',()=>{driveKeys.clear();accumulator=0;renderStates.reset(sim);lastStamp=0;});
  window.addEventListener('resize',()=>{scene.resize();if(landingRun&&matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');});
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));$('world').addEventListener('contextmenu',e=>e.preventDefault());
  scene.setHypothesesVisible(true);refreshPartCatalog();
  if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.add('open');
}
function animate(stamp){
  const frameMs=lastStamp?stamp-lastStamp:16.67,elapsed=lastStamp?Math.min((stamp-lastStamp)/1000,.1):1/60;lastStamp=stamp;
  const blocked=!!document.querySelector('dialog[open]');
  if(((landingRun&&mode==='lab')||mode==='city')&&!vehicleLoading&&!cityLoading&&!paused&&!blocked&&!document.hidden){accumulator+=elapsed;let steps=0;while(accumulator>=LANDING_STEP&&steps<50&&!paused){stepSimulation();accumulator=Math.max(0,accumulator-LANDING_STEP);steps++;}}else accumulator=0;
  if(!document.hidden)scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint:'#b51627',wing:false,cutaway:false,renderState:renderStates.sample(paused||mode==='inspect'||blocked?1:accumulator/LANDING_STEP)});
  if(stamp-lastUI>80){updateUI();lastUI=stamp;}frames++;frameTimer+=elapsed;
  if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent=cameraLabel();});
  scene.setMode('lab');scene.setCamera(camera);setupUI();sim.setObstacles([]);updateUI();requestAnimationFrame(animate);selectVehicle('roadster');
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
}catch(error){console.error(error);$('boot-message').textContent='3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';}
