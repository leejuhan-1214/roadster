import {VEHICLES,vehicleProfile,vehiclePhysics} from './vehicle-profiles.js?v=20261109-assessment1';
import {createLandingRun,landingRunInput,updateLandingRun,landingClearance,LANDING_STEP} from './landing-experiment.js?v=20261107-land1';
import {LandingUI} from './landing-ui.js?v=20261107-fleet1';
import {RenderStateBuffer} from './render-state.js?v=20261107-drive2';
import {PhysicsSim,DEFAULTS} from './physics.js?v=20261107-fleet1';
import {FlightScene} from './scene.js?v=20261109-assessment2';

const $=id=>document.getElementById(id), $$=selector=>[...document.querySelectorAll(selector)];
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sim=new PhysicsSim({roadRoughness:0,aeroEnabled:false});
const renderStates=new RenderStateBuffer(sim);
let scene,landingUI,selectedPartId=null,activeVehicle=vehicleProfile('roadster'),vehicleLoading=false;
let mode='lab',camera='orbit',paused=true,showVectors=false;
let landingSession=null,landingRun=null,lastResult=null,landingSerial=0;
let lastStamp=0,accumulator=0,lastUI=0,frames=0,frameTimer=0,toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800);}
function setPaused(value){
  paused=value;accumulator=0;renderStates.reset(sim);
  $('pause').textContent=paused?'▶':'Ⅱ';$('pause').disabled=!landingRun;
  $('pause').setAttribute('aria-label',paused?'실험 재생':'실험 일시정지');
  $('live-label').textContent=landingRun?(paused?'일시정지':'측정 중'):mode==='inspect'?'구조 탐색':'실험 준비';
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
  sim.setObstacles([]);sim.reset('ground');
  if(clearMeasurement)lastResult=null;
  renderStates.reset(sim);accumulator=0;setPaused(true);
}
function stopLanding(){cancelLanding();reset({cancel:false});}
async function startLanding(kind){
  if(vehicleLoading)return;
  cancelLanding();if(mode!=='lab')setMode('lab');reset();
  const settings=landingUI.readOptions();
  const jobs=kind==='vehicles'?VEHICLES.filter(v=>settings.vehicleIds.includes(v.id)).map(v=>({vehicleId:v.id,method:settings.method})):kind==='methods'?['free','brake','gentle'].map(method=>({vehicleId:activeVehicle.id,method})):[{vehicleId:activeVehicle.id,method:settings.method}];
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
    camera='orbit';scene.setCamera(camera);scene.frameStageStart(sim);$('camera-label').textContent='자유 카메라';
    renderStates.reset(sim);setPaused(false);$('vehicle-select').disabled=true;
    landingUI.setProgress((session.index+1)+' / '+session.jobs.length+' · '+activeVehicle.title+' · 착지 중');
    if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');
  }catch(error){if(landingSession===session){cancelLanding('실험 중단 · '+error.message);reset({cancel:false});}console.error(error);}
}
function stepSimulation(){
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
  const profile=vehicleProfile(id);vehicleLoading=true;setPaused(true);$('vehicle-select').disabled=true;
  $('model-status').textContent=profile.short+' 불러오는 중…';
  try{
    const vehicle=await scene.loadVehicle(profile);activeVehicle=profile;
    Object.assign(sim.params,vehiclePhysics(profile,vehicle.geometryParams,DEFAULTS),{roadRoughness:0,aeroEnabled:false});reset({cancel:false});
    selectedPartId=null;$('part-card').hidden=true;$('part-search').value='';
    $('vehicle-title').innerHTML=escape(profile.brand)+' <em>'+escape(profile.model)+'</em>';
    $('model-status').textContent=profile.reference;$('vehicle-credit').innerHTML=vehicleCredit(profile);
    $('explode').value='0';$('explode-value').textContent='0%';refreshPartCatalog();scene.frameWholeVehicle({resetView:true});
    $('vehicle-select').value=profile.id;if(!forLanding)toast(profile.title+' · 준비 완료');return true;
  }catch(error){$('vehicle-select').value=activeVehicle.id;$('model-status').textContent='차체 로드 실패 · 다시 선택해 주세요';console.error(error);return false;}
  finally{vehicleLoading=false;$('vehicle-select').disabled=!!landingSession&&landingSession.index<landingSession.jobs.length;}
}
function setMode(next){
  if(next===mode||!['lab','inspect'].includes(next))return;
  cancelLanding();reset({cancel:false});mode=next;camera='orbit';setPaused(true);
  scene.setMode(mode);scene.setCamera(camera);scene.focusPart(null);
  document.body.classList.toggle('inspect',mode==='inspect');
  $$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('inspect-panel').hidden=mode!=='inspect';$('lab-panel').hidden=mode!=='lab';$('part-card').hidden=true;selectedPartId=null;
  $('panel-toggle').textContent=mode==='inspect'?'☷ 부품 목록':'☷ 실험 설정';$('camera-label').textContent='자유 카메라';
  renderPartCatalog();scene.frameWholeVehicle({resetView:true});
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

function updateUI(){
  const t=sim.telemetry(),run=landingRun||lastResult;
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
  $('guide-content').innerHTML=tab==='sources'?'<p>실차 외형 · 공통 가상 착지 장치 · <a href="./assets/vehicles/vehicle-specifications.md" target="_blank" rel="noopener noreferrer">제원 기준</a></p>'+VEHICLES.map(p=>'<p><b>'+escape(p.title)+'</b><br>'+vehicleCredit(p)+'</p>').join(''):'<ol><li>차체와 출발 높이를 선택합니다.</li><li>자유 낙하·추력 제동·완만한 하강을 비교합니다.</li><li>제동 높이와 서스펜션을 바꿔 충격을 줄이는 조건을 찾습니다.</li><li>비교 결과의 그래프와 CSV로 측정값을 확인합니다.</li></ol><p>드래그: 시점 회전 · P: 실험 일시정지 · C: 카메라 · V: 힘 벡터 · R: 초기화</p><p>구조 탐색에서 스크롤하면 분해·조립합니다.</p>';
}
function openGuide(tab='controls'){renderGuide(tab);$('guide-modal').showModal();}
function focusApparatus(id){
  if(!scene.getPartCatalog().some(p=>p.id===id))return;
  $('show-hypotheses').checked=true;scene.setHypothesesVisible(true);$('part-search').value='';$('part-category').value='';
  refreshPartCatalog();scene.setExplode(.65,true);scene.focusPart(id);if(scene.isolatedPartId!==id)scene.isolatePart(id);selectPart(id);scene.frameSelectedPart();
}
function setupUI(){
  $('vehicle-select').innerHTML=VEHICLES.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.title)+'</option>').join('');
  landingUI=new LandingUI({vehicles:VEHICLES,onStart:()=>startLanding('single'),onCompareVehicles:()=>startLanding('vehicles'),onCompareMethods:()=>startLanding('methods'),onStop:stopLanding});
  $('vehicle-select').addEventListener('change',e=>selectVehicle(e.target.value));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  $('pause').addEventListener('click',()=>{if(landingRun)setPaused(!paused);});
  $('reset').addEventListener('click',()=>{reset();scene.setExplode(0,true);scene.restoreParts();scene.focusPart(null);scene.frameWholeVehicle({resetView:true});selectedPartId=null;$('part-card').hidden=true;renderPartCatalog();toast('초기화 · 비교 기록은 유지됩니다.');});
  $('help').addEventListener('click',()=>openGuide());$('about-link').addEventListener('click',()=>openGuide('sources'));
  $$('[data-guide]').forEach(b=>b.addEventListener('click',()=>renderGuide(b.dataset.guide)));
  $$('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('panel-toggle').addEventListener('click',()=>$('left-panel').classList.toggle('open'));
  $('vectors').addEventListener('click',()=>{showVectors=!showVectors;$('vectors').setAttribute('aria-pressed',showVectors);});
  $('camera').addEventListener('click',()=>{if(mode==='inspect'){camera='orbit';scene.frameWholeVehicle({resetView:true});}else camera=camera==='orbit'?'top':'orbit';scene.setCamera(camera);$('camera-label').textContent=camera==='top'?'상부 카메라':'자유 카메라';});
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
    if(e.code==='KeyP'&&landingRun){e.preventDefault();setPaused(!paused);}
    else if(e.code==='KeyR')$('reset').click();else if(e.code==='KeyC')$('camera').click();else if(e.code==='KeyV')$('vectors').click();
    else if(e.code==='Escape')$('left-panel').classList.remove('open');
  });
  document.addEventListener('visibilitychange',()=>{accumulator=0;renderStates.reset(sim);lastStamp=0;});
  window.addEventListener('resize',()=>{scene.resize();if(landingRun&&matchMedia('(max-width:1000px)').matches)$('left-panel').classList.remove('open');});
  $('world').addEventListener('pointerdown',()=>$('world').focus({preventScroll:true}));$('world').addEventListener('contextmenu',e=>e.preventDefault());
  scene.setHypothesesVisible(true);refreshPartCatalog();
  if(matchMedia('(max-width:1000px)').matches)$('left-panel').classList.add('open');
}
function animate(stamp){
  const frameMs=lastStamp?stamp-lastStamp:16.67,elapsed=lastStamp?Math.min((stamp-lastStamp)/1000,.1):1/60;lastStamp=stamp;
  const blocked=!!document.querySelector('dialog[open]');
  if(landingRun&&!vehicleLoading&&!paused&&mode==='lab'&&!blocked&&!document.hidden){accumulator+=elapsed;let steps=0;while(accumulator>=LANDING_STEP&&steps<50&&!paused){stepSimulation();accumulator=Math.max(0,accumulator-LANDING_STEP);steps++;}}else accumulator=0;
  if(!document.hidden)scene.observeFrame(frameMs);
  scene.update(sim,elapsed,{mode,camera,vectors:showVectors,explode:Number($('explode').value),paint:'#b51627',wing:false,cutaway:false,renderState:renderStates.sample(paused||mode==='inspect'||blocked?1:accumulator/LANDING_STEP)});
  if(stamp-lastUI>80){updateUI();lastUI=stamp;}frames++;frameTimer+=elapsed;
  if(frameTimer>.75){$('fps').textContent=Math.round(frames/frameTimer)+' FPS';frames=0;frameTimer=0;}
  requestAnimationFrame(animate);
}
try{
  scene=new FlightScene($('world'),selectPart,value=>{$('explode').value=value;$('explode-value').textContent=Math.round(value*100)+'%';},value=>{camera=value;$('camera-label').textContent=value==='top'?'상부 카메라':'자유 카메라';});
  scene.setMode('lab');scene.setCamera(camera);setupUI();sim.setObstacles([]);updateUI();requestAnimationFrame(animate);selectVehicle('roadster');
  $('boot').classList.add('ready');setTimeout(()=>$('boot').hidden=true,800);
}catch(error){console.error(error);$('boot-message').textContent='3D 화면을 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 새로고침해 주세요.';}
