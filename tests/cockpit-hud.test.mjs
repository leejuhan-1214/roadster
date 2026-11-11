import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function syncCockpitHUD(){'),source.indexOf('function updateUI(){'));
function harness(){
 const classes=new Set(),nodes={},calls={clear:0,focus:0,experiments:[]};
 const context={mode:'city',camera:'chase',cockpitPanelsOpen:false,lastCockpitView:false,
  document:{body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)},contains:name=>classes.has(name)}}},
  $:id=>nodes[id]??={hidden:false,textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},focus(){calls.focus++}},
  clearDriveInputs(){calls.clear++},showCityExperiments(open){calls.experiments.push(open)}};
 runInNewContext(helpers,context);return {context,classes,nodes,calls};
}
test('entering cockpit exposes compact controls and full panels are an explicit reversible choice',()=>{
 const {context:c,classes,nodes,calls}=harness();c.syncCockpitHUD();assert.equal(nodes['cockpit-tools'].hidden,true);
 c.camera='hood';c.syncCockpitHUD();assert.equal(nodes['cockpit-tools'].hidden,false);assert.ok(classes.has('cockpit-view'));assert.equal(classes.has('cockpit-panels-open'),false);
 c.toggleCockpitPanels();assert.ok(classes.has('cockpit-panels-open'));assert.equal(nodes['cockpit-toggle'].attributes['aria-expanded'],'true');assert.equal(calls.clear,1);
 c.syncCockpitHUD();assert.ok(classes.has('cockpit-panels-open'),'regular HUD refresh does not close chosen panels');
 c.toggleCockpitPanels(false);assert.equal(classes.has('cockpit-panels-open'),false);assert.equal(calls.clear,2);assert.equal(calls.focus,1);assert.deepEqual(calls.experiments,[false]);
});
test('leaving cockpit restores the existing HUD and next entry starts with an unobstructed windshield',()=>{
 const {context:c,classes,nodes}=harness();c.camera='hood';c.syncCockpitHUD();c.toggleCockpitPanels(true);
 c.camera='orbit';c.syncCockpitHUD();assert.equal(classes.has('cockpit-view'),false);assert.equal(classes.has('cockpit-panels-open'),false);assert.equal(nodes['cockpit-tools'].hidden,true);
 c.camera='hood';c.syncCockpitHUD();assert.equal(c.cockpitPanelsOpen,false);assert.equal(nodes['cockpit-toggle'].attributes['aria-expanded'],'false');
 c.mode='lab';c.syncCockpitHUD();assert.equal(classes.has('cockpit-view'),false);assert.equal(nodes['cockpit-tools'].hidden,true);
});
