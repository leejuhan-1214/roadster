import fs from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=await fs.readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');
const modeSource=source.slice(source.indexOf('async function setMode(next)'),source.indexOf('\nfunction updatePartActions'));
const startSource=source.slice(source.indexOf('async function startLanding(kind)'),source.indexOf('\nasync function nextLanding'));
function context(){
  const nodes={},calls={resets:0,toasts:[],selected:[],labFrames:0,wholeFrames:0};
  const ctx={mode:'city',modeEpoch:0,camera:'hood',cityLoading:false,vehicleLoading:false,vehicleLoadTask:null,selectedPartId:null,
    activeVehicle:{id:'city-only'},experimentIds:new Set(['roadster']),lastLabVehicleId:'roadster',driver:{reset(){}},
    scene:{city:{},setMode(){},setCamera(){},focusPart(){},async loadCity(){return this.city},frameWholeVehicle(){calls.wholeFrames++;}},
    document:{body:{classList:{toggle(){}}}},
    $:id=>nodes[id]??={hidden:false,textContent:'',setAttribute(){},focus(){}},$$:()=>[],
    cancelLanding(){},clearDriveInputs(){},setPaused(){},reset(){calls.resets++},restoreLabView(){calls.labFrames++;},renderPartCatalog(){},refreshVehiclePicker(){},cameraLabel:()=>'',
    toast:message=>calls.toasts.push(message),selectVehicle:async id=>{calls.selected.push(id);return false},console:{error(){}},
    createLandingJobs(){throw Error('non-cohort reached job creation')},landingUI:{readOptions(){throw Error('non-cohort reached settings')}},calls};
  vm.createContext(ctx);vm.runInContext(modeSource+'\n'+startSource,ctx);return ctx;
}
test('failed and superseded model changes cannot leave city-only vehicles measuring or retry failed worlds',async()=>{
const failed=context();await failed.setMode('lab');
assert.equal(failed.mode,'city');assert.equal(failed.calls.toasts.length,1);assert.deepEqual(failed.calls.selected,['roadster']);

const stale=context();let complete;
stale.selectVehicle=()=>new Promise(resolve=>complete=resolve);
const pending=stale.setMode('lab');await stale.setMode('inspect');complete(false);await pending;
assert.equal(stale.mode,'inspect');assert.equal(stale.calls.toasts.length,0);

const blocked=context();blocked.mode='lab';await blocked.startLanding('single');
assert.equal(blocked.calls.resets,0);assert.equal(blocked.calls.toasts.length,1);

const compound=context();compound.mode='inspect';compound.scene.city=null;let attempts=0;
compound.scene.loadCity=async()=>{assert.equal(++attempts,1,'must not retry city after both downloads failed');throw Error('network unavailable')};
await compound.setMode('city');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(compound.mode,'inspect');assert.equal(attempts,1);assert.equal(compound.calls.toasts.length,2);
});

test('returning from city to an existing experiment car uses the lab framing path',async()=>{
  const c=context();c.activeVehicle={id:'roadster'};await c.setMode('lab');
  assert.equal(c.mode,'lab');assert.equal(c.camera,'orbit');
  assert.equal(c.calls.labFrames,1);assert.equal(c.calls.wholeFrames,0);
  assert.deepEqual(c.calls.selected,[],'an already loaded cohort car need not load again');
});
