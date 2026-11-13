import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const page=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const main=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');

test('entry exposes landing, structure and a separate city without retired demonstrations',()=>{
  assert.deepEqual([...page.matchAll(/data-mode="([^"]+)"/g)].map(m=>m[1]),['lab','inspect','city']);
  for(const id of ['level-demo','collision-demo','stage-start','coast-test','brake-test','model-file','params-open','drive-panel'])assert.ok(!page.includes('id="'+id+'"'),id+' must not remain an interactive feature');
  assert.ok(!page.includes('data-key='),'obsolete duplicate controls stay removed');
  for(const key of ['KeyW','KeyA','KeyS','KeyD','KeyB','Space','KeyF','ShiftLeft','KeyQ','KeyE'])assert.ok(page.includes('data-drive="'+key+'"'),'restored city control '+key);
  assert.ok(page.includes('id="city-hover"'),'altitude hold has an on-screen control');
  for(const source of ['controls.js','flight-plan.js','friction-experiment.js','stage.js'])assert.ok(!main.includes("from './"+source),'retired controllers are not loaded by the entry');
  assert.match(main,/landingRun&&mode==='lab'/,'a landing trial stays scoped to the lab');
  assert.match(main,/sim\.step\(LANDING_STEP,landingRunInput\(landingRun,sim,landingLiftHeld\)\)/,'landing trials retain controlled inputs');
  assert.match(main,/createLandingJobs\(kind,EXPERIMENT_VEHICLES,settings,activeVehicle\.id\)/);
  assert.match(main,/onCompareMethods:\(\)=>startLanding\('methods'\)/,'the single four-method button reaches the common method comparison builder');
  assert.match(main,/onCompareFleetMethods:\(\)=>startLanding\('fleet-methods'\)/,'the all-fleet button reaches the 20-run experiment cohort builder');
});

test('retained static controls have unique IDs and entry bindings resolve',()=>{
  const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const bindings=[...main.matchAll(/(?<!\$)\$\('([\w-]+)'\)/g)].map(m=>m[1]);
  for(const id of bindings)assert.ok(ids.includes(id),'missing element '+id);
  for(const id of ['landing-lab','vehicle-select','explode','part-buttons','ground-force','peak-force','touchdown-speed','city-hud','city-speed','city-map','city-vehicle-select'])assert.ok(ids.includes(id));
});

test('city keyboard and touch controls ignore experiments and text fields and release held input',()=>{
  const source=main.match(/function setupDriveControls\(\)\{[\s\S]*?\n\}\n(?=function drawCityMap)/)?.[0];
  assert.ok(source,'drive control setup is available for independent interaction testing');
  const listeners={},touchListeners={};
  const button={dataset:{drive:'KeyW'},classList:{add(){},remove(){}},setPointerCapture(){},addEventListener(type,callback){touchListeners[type]=callback;}};
  const context={mode:'lab',paused:false,cityLoading:false,vehicleLoading:false,driveKeys:new Set(),DRIVE_KEYS:new Set(['KeyW','KeyS','Space']),
    window:{addEventListener(type,callback){listeners[type]=callback;}},
    document:{querySelector(){return context.dialogOpen?{}:null;},addEventListener(){}},
    setPaused(value){context.paused=value;},$(){return {focus(){}};},$$(selector){assert.equal(selector,'[data-drive]');return [button];},dialogOpen:false};
  context.landingSession={};context.freeDriving=()=>context.mode==='city'||(context.mode==='lab'&&!context.landingSession);
  runInNewContext(source+'\nsetupDriveControls();',context);
  const event=(code,editing=false)=>({code,target:{matches(){return editing;}},preventDefault(){this.prevented=true;}});
  listeners.keydown(event('KeyW'));assert.equal(context.driveKeys.size,0,'lab cannot throttle');
  context.mode='inspect';listeners.keydown(event('KeyW'));assert.equal(context.driveKeys.size,0,'inspection cannot throttle');
  context.mode='city';listeners.keydown(event('KeyW',true));assert.equal(context.driveKeys.size,0,'typing stays editable');
  context.dialogOpen=true;listeners.keydown(event('KeyW'));assert.equal(context.driveKeys.size,0,'dialogs block steering');
  context.dialogOpen=false;listeners.keydown(event('KeyW'));assert.ok(context.driveKeys.has('KeyW'));
  listeners.keyup(event('KeyW'));assert.equal(context.driveKeys.size,0);
  listeners.keydown(event('KeyW'));listeners.blur();assert.equal(context.driveKeys.size,0,'losing focus releases throttle');
  context.mode='lab';touchListeners.pointerdown({...event('KeyW'),pointerId:1});assert.equal(context.driveKeys.size,0);
  context.mode='city';touchListeners.pointerdown({...event('KeyW'),pointerId:1});assert.ok(context.driveKeys.has('KeyW'));
  touchListeners.pointercancel();assert.equal(context.driveKeys.size,0);
  context.paused=true;listeners.keydown(event('KeyW'));assert.equal(context.paused,false);assert.ok(context.driveKeys.has('KeyW'),'a city drive key resumes paused free driving');
  listeners.keyup(event('KeyW'));context.paused=true;touchListeners.pointerdown({...event('KeyW'),pointerId:1});assert.equal(context.paused,false);assert.ok(context.driveKeys.has('KeyW'));touchListeners.pointercancel();
  context.cityLoading=true;context.paused=true;listeners.keydown(event('KeyW'));assert.equal(context.paused,true);assert.equal(context.driveKeys.size,0);context.cityLoading=false;
  context.vehicleLoading=true;touchListeners.pointerdown({...event('KeyW'),pointerId:1});assert.equal(context.driveKeys.size,0);
});

function driveHarness(){
  const source=main.match(/function setupDriveControls\(\)\{[\s\S]*?\n\}\n(?=function drawCityMap)/)[0];
  const keyboard={},documentListeners={},buttons=new Map();
  for(const code of ['KeyW','KeyA','KeyD']){
    const held=new Set(),listeners={};
    buttons.set(code,{dataset:{drive:code},held,listeners,classList:{add(c){held.add(c);},remove(c){held.delete(c);}},
      setPointerCapture(){},addEventListener(type,callback){listeners[type]=callback;}});
  }
  const context={mode:'city',paused:false,cityLoading:false,vehicleLoading:false,driveKeys:new Set(),
    DRIVE_KEYS:new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowRight','Space','KeyB']),
    dialogOpen:false,focusCount:0,window:{addEventListener(type,callback){keyboard[type]=callback;}},
    document:{querySelector(){return context.dialogOpen?{}:null;},addEventListener(type,callback){documentListeners[type]=callback;}},
    setPaused(value){context.paused=value;},$(id){assert.equal(id,'world');return {focus(){context.focusCount++;}};},
    $$(selector){assert.equal(selector,'[data-drive]');return [...buttons.values()];}};
  context.landingSession={};context.freeDriving=()=>context.mode==='city'||(context.mode==='lab'&&!context.landingSession);
  runInNewContext(source+'\nsetupDriveControls();',context);
  const event=(code,type='canvas',pointerId=1)=>({code,pointerId,target:{
    matches(selector){return selector==='input[type="number"]'?type==='number':['number','text','select','checkbox'].includes(type);}},
    preventDefault(){this.prevented=true;}});
  return {context,keyboard,documentListeners,buttons,event};
}

test('entering city number settings releases held acceleration and steering, then Enter returns driving focus',()=>{
  const {context:c,keyboard:k,documentListeners:d,buttons,event:e}=driveHarness();
  k.keydown(e('KeyW'));k.keydown(e('KeyA'));
  assert.deepEqual([...c.driveKeys],['KeyW','KeyA']);assert.ok(buttons.get('KeyA').held.has('held'));
  d.focusin(e('', 'number'));
  assert.equal(c.driveKeys.size,0,'editing must not preserve W while swallowing later A/D');
  assert.ok([...buttons.values()].every(b=>!b.held.has('held')));
  k.keydown(e('KeyD','number'));assert.equal(c.driveKeys.size,0,'numeric editing is not driving');
  c.paused=true;k.keydown(e('Enter','number'));assert.equal(c.focusCount,1);
  assert.equal(c.paused,true,'committing a value does not start the simulation');
  k.keydown(e('KeyD'));assert.equal(c.paused,false);assert.ok(c.driveKeys.has('KeyD'));
  d.focusin(e('','select'));assert.equal(c.driveKeys.size,0);
  c.dialogOpen=true;k.keydown(e('Enter','number'));assert.equal(c.focusCount,1,'dialog retains keyboard control');
});

test('keyboard steering and screen steering have independent lifetimes and matching held visuals',()=>{
  const {context:c,keyboard:k,buttons,event:e}=driveHarness(),a=buttons.get('KeyA');
  k.keydown(e('KeyW'));k.keydown(e('KeyA'));a.listeners.pointerdown(e('', 'canvas',1));
  a.listeners.pointerup(e('', 'canvas',1));
  assert.ok(c.driveKeys.has('KeyA'),'screen release cannot erase a physically held keyboard key');
  assert.ok(a.held.has('held'));assert.ok(c.driveKeys.has('KeyW'));
  a.listeners.pointerdown(e('', 'canvas',2));k.keyup(e('KeyA'));
  assert.ok(c.driveKeys.has('KeyA'),'keyboard release cannot erase a held screen button');
  a.listeners.pointerdown(e('', 'canvas',3));a.listeners.pointerup(e('', 'canvas',2));
  assert.ok(c.driveKeys.has('KeyA'),'one pointer cannot release a second pointer');
  a.listeners.pointercancel(e('', 'canvas',3));assert.equal(c.driveKeys.has('KeyA'),false);
  assert.equal(a.held.has('held'),false);assert.ok(c.driveKeys.has('KeyW'));
  assert.equal(c.focusCount,3,'screen driving returns focus from a settings field');
});

test('reset, pause and focus clear all input sources without stale key resurrection',()=>{
  const {context:c,keyboard:k,buttons,event:e}=driveHarness(),a=buttons.get('KeyA'),d=buttons.get('KeyD');
  k.keydown(e('KeyW'));k.keydown(e('KeyA'));d.listeners.pointerdown(e('', 'canvas',4));
  c.clearDriveInputs();assert.equal(c.driveKeys.size,0);
  assert.ok([...buttons.values()].every(b=>!b.held.has('held')));
  d.listeners.lostpointercapture(e('', 'canvas',4));k.keyup(e('KeyW'));assert.equal(c.driveKeys.size,0);
  a.listeners.pointerdown(e('', 'canvas',5));assert.deepEqual([...c.driveKeys],['KeyA']);
  k.blur();assert.equal(c.driveKeys.size,0);assert.equal(a.held.has('held'),false);
  k.keydown(e('KeyD'));assert.deepEqual([...c.driveKeys],['KeyD'],'fresh input does not revive W or A');
  assert.match(main,/let clearDriveInputs=\(\)=>driveKeys\.clear\(\);/);
  assert.equal((main.match(/driveKeys\.clear\(\)/g)||[]).length,1,'every runtime clear uses the source-aware helper');
});

test('lab free driving is enabled before a trial and blocked when a controlled session starts',()=>{
 const {context:c,keyboard:k,event:e}=driveHarness();c.mode='lab';c.landingSession=null;k.keydown(e('KeyW'));assert.ok(c.driveKeys.has('KeyW'));c.clearDriveInputs();c.landingSession={};k.keydown(e('KeyW'));assert.equal(c.driveKeys.size,0);
});
