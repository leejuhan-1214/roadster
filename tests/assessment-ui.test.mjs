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
  for(const key of ['KeyW','KeyA','KeyS','KeyD','KeyB','Space','ShiftLeft','KeyQ','KeyE'])assert.ok(page.includes('data-drive="'+key+'"'),'restored city control '+key);
  assert.ok(page.includes('id="city-hover"'),'altitude hold has an on-screen control');
  for(const source of ['controls.js','flight-plan.js','friction-experiment.js','stage.js'])assert.ok(!main.includes("from './"+source),'retired controllers are not loaded by the entry');
  assert.match(main,/landingRun&&mode==='lab'/,'a landing trial stays scoped to the lab');
  assert.match(main,/sim\.step\(LANDING_STEP,landingRunInput\(landingRun,sim\)\)/,'landing trials retain controlled inputs');
  assert.match(main,/createLandingJobs\(kind,VEHICLES,settings,activeVehicle\.id\)/);
  assert.match(main,/onCompareFleetMethods:\(\)=>startLanding\('fleet-methods'\)/,'the all-fleet button reaches the 39-run job builder');
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
    document:{querySelector(){return context.dialogOpen?{}:null;}},
    setPaused(value){context.paused=value;},$(){return null;},$$(selector){assert.equal(selector,'[data-drive]');return [button];},dialogOpen:false};
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
