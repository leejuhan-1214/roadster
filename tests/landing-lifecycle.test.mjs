import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {CITY_DRIVE_PARAMS} from '../dist/js/driving-input.js';
import {FACILITY_SOLIDS} from '../dist/js/world-obstacles.js';
import {vehicleProfile,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {createLandingRun,landingClearance} from '../dist/js/landing-experiment.js';

const main=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');
const section=(from,to)=>{
  const start=main.indexOf(from),end=main.indexOf(to,start);
  assert.ok(start>=0&&end>start,'entry lifecycle section exists');return main.slice(start,end);
};
const helpers=section('function restoreLandingParams(session)','async function startLanding(kind)');
const next=section('async function nextLanding(session)','function stepSimulation()');
const select=section('async function selectVehicle(id,','async function setMode(next)');
const panel=section('function setSettingsPanel(open)','function setupUI()');
test('initial loading keeps the bootstrap chassis off screen until the real vehicle is ready', async()=>{
  const startup=section("  $('boot-message').textContent='로드스터 차체를 불러오는 중", '  // ?debug');
  for(const success of [false,true]){
    let resolveLoad,frames=0;
    const load=new Promise(resolve=>{resolveLoad=resolve;});
    const elements={'boot-message':{},'boot-retry':{hidden:true},boot:{hidden:false,classList:{add(){}}}};
    const completion=vm.runInNewContext(startup,{
      $:id=>elements[id],selectVehicle:()=>load,requestAnimationFrame:()=>{frames++;},
      animate(){},setTimeout:callback=>callback(),URLSearchParams,location:{search:''},
      modeEpoch:0,mode:'lab',landingPlanner:{warm(){}}
    });
    assert.equal(frames,0);assert.equal(elements.boot.hidden,false);
    resolveLoad(success);await completion;
    assert.equal(frames,success?1:0);assert.equal(elements.boot.hidden,success);
    assert.equal(elements['boot-retry'].hidden,success);
  }
});
test('a city driver link loads the requested car before switching to its driving seat',async()=>{
  const startup=section("  $('boot-message').textContent='로드스터 차체를 불러오는 중", '  // ?debug');
  const order=[];
  const elements={'boot-message':{},boot:{classList:{add(){}}},'camera-label':{}};
  const context={
    $:id=>elements[id],animate(){},requestAnimationFrame(){},setTimeout:fn=>fn(),URLSearchParams,
    location:{search:'?mode=city&camera=driver&vehicle=aston-martin-db11'},
    mode:'lab',modeEpoch:0,cityPoseReady:false,camera:'chase',cameraLabel:()=>'운전석',
    activeVehicle:{id:'roadster'},VEHICLES:[{id:'roadster'},{id:'aston-martin-db11'}],
    async selectVehicle(id){order.push(id);return true;},
    async setMode(mode){context.mode=mode;context.modeEpoch++;context.cityPoseReady=true;},
    scene:{setCamera(camera){order.push(camera);}}
  };
  await vm.runInNewContext(startup,context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(order,['roadster','aston-martin-db11','hood']);
  assert.equal(elements['camera-label'].textContent,'운전석');
});
const clickBinding=id=>{
  const line=main.split('\n').find(line=>line.includes("$('"+id+"').addEventListener('click',"));
  assert.ok(line,id+' click binding exists');return line;
};

// Execute the entry's real lifecycle and button handlers. Only rendering/model
// loading and DOM are faked; release height and reset state use the real solver.
function harness(){
  const calls=[],nodes=new Map(),open=new Set(['open']);
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',value:id==='lab-surface'?'1.15':'',disabled:false,hidden:false,
      listeners:new Map(),attributes:{},setAttribute(name,value){this.attributes[name]=value;},focus(){},addEventListener(type,fn){this.listeners.set(type,fn);},
      classList:{toggle(value,enabled){if(id==='left-panel'){if(enabled)open.add(value);else open.delete(value);calls.push({type:'panel',enabled});}},
        remove(value){if(id==='left-panel'){open.delete(value);calls.push({type:'close-panel'});}}}});
    return nodes.get(id);
  };
  const sim=new PhysicsSim(),profile=vehicleProfile('roadster');
  const scene={vehicle:{geometryParams:{}},city:null,
    async loadVehicle(p){calls.push({type:'load',id:p.id});return this.vehicle;},
    setCamera(name){calls.push({type:'camera',name});},
    frameLabVehicle(s,options){calls.push({type:'vehicle-frame',options:{...options},position:s.state.pos.clone()});},
    frameLandingStart(s,options){calls.push({type:'landing-frame',options:{...options},position:s.state.pos.clone(),panelOpen:open.has('open')});},
    frameWholeVehicle(){calls.push({type:'whole-frame'});},frameCityStart(){calls.push({type:'city-frame'});},
    inspectionViewport(){calls.push({type:'viewport',panelOpen:open.has('open')});},
    setLandingExperiment(config){calls.push({type:'experiment',config});},
    setExplode(){},restoreParts(){},focusPart(){},
  };
  const c={race:null,mode:'lab',camera:'top',paused:false,cityLoading:false,vehicleLoading:false,vehicleLoadTask:null,
    activeVehicle:profile,lastLabVehicleId:'roadster',landingSession:null,landingRun:null,lastResult:null,
    selectedPartId:null,driveInput:{throttle:1},cityDistance:40,accumulator:.04,
    scene,sim,DEFAULTS,CITY_DRIVE_PARAMS,FACILITY_SOLIDS,vehicleProfile,vehiclePhysics,createLandingRun,
    $:node,escape:String,vehicleCredit:()=>'',cameraLabel:()=>c.camera,
    freeDriving:()=>c.mode==='city'||(c.mode==='lab'&&!c.landingSession),
    experimentIds:new Set(['roadster']),driver:{reset(){calls.push({type:'driver-reset'});}},
    brakeTrial:{reset(){},cancel(){}},renderStates:{reset(){}},clearDriveInputs(){calls.push({type:'clear-input'});},
    setPaused(value){c.paused=value;calls.push({type:'pause',value});},
    refreshPartCatalog(){},refreshVehiclePicker(){},renderCityVehicleOptions(){},renderPartCatalog(){},toast(){},
    landingUI:{setBusy(){},setProgress(){},showResults(){calls.push({type:'results'});}},
    matchMedia:()=>({matches:true}),console:{error(error){throw error;}},
  };
  vm.createContext(c);vm.runInContext(helpers+'\n'+select+'\n'+panel+'\n'+next+'\n'+clickBinding('reset')+'\n'+clickBinding('camera'),c);
  return {c,calls,node,open,click:id=>node(id).listeners.get('click')()};
}
function session(c){
  return {index:0,kind:'methods',groupId:'test',settings:{height:3,method:'free',brakeHeight:1.5,targetSpeed:.5,springK:75000,damperC:6000},
    jobs:[{vehicleId:'roadster',method:'free'},{vehicleId:'roadster',method:'brake'}],
    originalParams:{...c.sim.params},originalVehicle:'roadster'};
}

test('reset leaves a former top view in the parked lab view; C only reframes an active trial',()=>{
  const {c,calls,node,click}=harness();c.landingSession=session(c);
  c.landingRun=createLandingRun(c.sim,{height:30});c.lastResult={id:'saved'};
  click('reset');
  assert.equal(c.camera,'orbit');assert.equal(node('camera-label').textContent,'orbit');
  assert.equal(c.landingRun,null);assert.equal(c.lastResult,null);assert.equal(c.landingSession,null);
  assert.equal(calls.filter(call=>call.type==='vehicle-frame').length,1);
  assert.equal(calls.filter(call=>call.type==='whole-frame').length,0);
  assert.ok(landingClearance(c.sim)<.001,'reset returns physics to ground as well as changing the view');
  calls.length=0;c.landingRun=createLandingRun(c.sim,{height:3});c.camera='top';
  const position=c.sim.state.pos.clone(),gas=c.sim.state.gas;
  click('camera');
  assert.equal(c.camera,'orbit');assert.equal(calls.filter(call=>call.type==='landing-frame').length,1);
  assert.ok(c.sim.state.pos.equals(position),'camera control must not restart the fall');assert.equal(c.sim.state.gas,gas);
  assert.equal(calls.some(call=>call.type==='driver-reset'),false);
});

test('batch releases frame only once at the release pose and preserve the chosen direction after the first trial',async()=>{
  const {c,calls,open}=harness(),batch=session(c);c.landingSession=batch;
  c.sim.state.pos.set(50,20,-30);
  await c.nextLanding(batch);
  const frames=calls.filter(call=>call.type.endsWith('-frame'));
  assert.equal(frames.length,1,'cached model selection must not insert an intermediate parked/whole-vehicle frame');
  assert.equal(frames[0].type,'landing-frame');assert.equal(frames[0].options.resetView,true);
  assert.equal(frames[0].panelOpen,false,'close the settings drawer before measuring available canvas');
  assert.equal(frames[0].position.x,0);assert.equal(frames[0].position.z,0);assert.ok(Math.abs(landingClearance(c.sim)-3)<1e-10);
  assert.equal(c.paused,false);assert.equal(c.landingRun.method,'free');
  calls.length=0;open.add('open');batch.index=1;batch.singleStepping=true;
  await c.nextLanding(batch);
  const second=calls.filter(call=>call.type.endsWith('-frame'));
  assert.equal(second.length,1);assert.equal(second[0].options.resetView,false,'subsequent trials retain the user orbit direction');
  assert.equal(second[0].panelOpen,false);assert.equal(c.landingRun.method,'brake');
  assert.equal(c.paused,true,'a single-step session must stay paused across the trial boundary');
});

test('ordinary lab vehicle selection and Stop restore the lab view without inheriting an old completed trial',async()=>{
  const {c,calls,node}=harness();c.landingSession=session(c);c.landingRun=createLandingRun(c.sim,{height:30});c.lastResult={id:'old'};
  assert.equal(await c.selectVehicle('roadster'),true);
  assert.equal(c.landingSession,null);assert.equal(c.landingRun,null);assert.equal(c.lastResult,null);
  assert.equal(c.camera,'orbit');assert.equal(node('model-status').hidden,true);
  assert.equal(calls.filter(call=>call.type==='vehicle-frame').length,1);
  assert.equal(calls.some(call=>call.type==='landing-frame'||call.type==='whole-frame'),false);
  calls.length=0;c.landingSession=session(c);c.landingRun=createLandingRun(c.sim,{height:3});c.camera='top';
  c.stopLanding();
  assert.equal(c.landingSession,null);assert.equal(c.camera,'orbit');assert.equal(c.freeDriving(),true);
  assert.equal(calls.filter(call=>call.type==='vehicle-frame').length,1);
});

test('a cancelled asynchronous model load cannot start or reframe its obsolete landing batch',async()=>{
  const {c,calls}=harness(),batch=session(c);c.landingSession=batch;
  let finishLoad;c.scene.loadVehicle=()=>new Promise(resolve=>{finishLoad=resolve;});
  const pending=c.nextLanding(batch);c.cancelLanding();finishLoad(c.scene.vehicle);await pending;
  assert.equal(c.landingSession,null);assert.equal(c.landingRun,null);
  assert.equal(calls.some(call=>call.type==='landing-frame'),false);
});

test('a late economy forecast cannot revive a trial after Stop',async()=>{
  const {c,calls}=harness(),batch=session(c);
  c.scene.vehicle.profileId='roadster';batch.jobs[0].method='eco';c.landingSession=batch;
  c.AbortController=AbortController;
  let answer,signal;
  c.landingPlanner={prepare(sim,settings,requested){
    signal=requested;
    return new Promise(resolve=>answer=resolve);
  }};
  const pending=c.nextLanding(batch);
  c.stopLanding();
  assert.equal(signal.aborted,true);
  answer({method:'eco'});await pending;
  assert.equal(c.landingRun,null);
  assert.equal(calls.some(call=>call.type==='landing-frame'),false);
});

test('a consecutive trial with the displayed assembly reuses the model and starts back at release height',async()=>{
  const {c,calls}=harness(),batch=session(c);
  c.scene.vehicle.profileId='roadster';batch.index=1;c.landingSession=batch;
  c.sim.state.pos.set(8,0,10);c.sim.state.vel.set(1,-4,2);c.sim.state.gas=3;
  await c.nextLanding(batch);
  assert.equal(calls.some(call=>call.type==='load'),false);
  assert.ok(Math.abs(landingClearance(c.sim)-3)<1e-10);
  assert.equal(c.sim.state.vel.length(),0);assert.equal(c.sim.state.gas,c.sim.initialGas);
  assert.equal(c.landingRun.method,'brake');
});

test('returning to settings updates the available camera viewport and returns the form to its beginning',()=>{
  const {c,calls,node,open}=harness();node('left-panel').scrollTop=500;
  c.setSettingsPanel(false);
  assert.equal(open.has('open'),false);assert.equal(node('panel-toggle').attributes['aria-expanded'],'false');
  c.setSettingsPanel(true);
  assert.equal(open.has('open'),true);assert.equal(node('panel-toggle').attributes['aria-expanded'],'true');
  assert.equal(node('left-panel').scrollTop,0);
  assert.deepEqual(calls.filter(call=>call.type==='viewport').map(call=>call.panelOpen),[false,true]);
});
