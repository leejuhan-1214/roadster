import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {DrivingController} from '../dist/js/driving-input.js';
import {normalizeCityExperiment,cityExperimentParams,CityBrakeTrial,brakeResultsCSV} from '../dist/js/city-experiment.js';
const source=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');
const page=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
function harness(){
 const nodes=new Map([...page.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],{value:'',checked:false,hidden:false,listeners:{},attributes:{},addEventListener(type,f){this.listeners[type]=f;},setAttribute(k,v){this.attributes[k]=v;},focus(){}}]));
 const ctx={mode:'city',cityLoading:false,vehicleLoading:false,paused:true,driver:new DrivingController(),citySettings:normalizeCityExperiment({}),sim:{params:{}},brakeTrial:{cancel(){}},normalizeCityExperiment,cityExperimentParams,clears:0,clearDriveInputs(){ctx.clears++;},setPaused(p){ctx.paused=p;},$:id=>{assert.ok(nodes.has(id),id);return nodes.get(id);}};
 const sync=source.match(/function syncCityExperimentInputs\(\)\{[\s\S]*?\n\}/)[0];
 const setup=source.match(/function setupCityExperiments\(\)\{[\s\S]*?\n\}/)[0];
 const status=source.match(/function compressorStatus\(t\)\{[\s\S]*?\n\}/)[0];
 runInNewContext(sync+'\n'+setup+'\n'+status+'\nsetupCityExperiments();',ctx);
 return {ctx,nodes};
}
test('charging button toggles actual driver request and releases driving keys only in ready city',()=>{
 const {ctx,nodes}=harness(),button=nodes.get('city-compressor');
 assert.equal(ctx.driver.compressorEnabled,false);button.listeners.click();
 assert.equal(ctx.driver.compressorEnabled,true);assert.equal(ctx.paused,false);assert.equal(ctx.clears,1);
 button.listeners.click();assert.equal(ctx.driver.compressorEnabled,false);
 ctx.mode='lab';button.listeners.click();assert.equal(ctx.driver.compressorEnabled,false);
 ctx.mode='city';ctx.vehicleLoading=true;button.listeners.click();assert.equal(ctx.driver.compressorEnabled,false);
});
test('fan checkbox updates physical controller and retained brake comparison condition',()=>{
 const {ctx,nodes}=harness(),fan=nodes.get('city-fan');assert.equal(fan.checked,true);
 fan.checked=false;fan.listeners.change({target:{type:'checkbox'}});
 assert.equal(ctx.driver.fanEnabled,false);assert.equal(ctx.citySettings.fanEnabled,false);
 nodes.get('city-settings-reset').listeners.click();assert.equal(ctx.driver.fanEnabled,true);assert.equal(ctx.driver.compressorEnabled,false);
});
test('charging status separates waiting, empty battery, full tank and actual intake',()=>{
 const {ctx}=harness();ctx.driver.compressorEnabled=true;
 assert.match(ctx.compressorStatus({compressorState:'charging'}),/흡입.*압축/);
 assert.match(ctx.compressorStatus({compressorState:'moving'}),/정차/);
 assert.match(ctx.compressorStatus({compressorState:'battery'}),/배터리/);
 assert.match(ctx.compressorStatus({compressorState:'full'}),/한도/);
 ctx.driver.compressorEnabled=false;assert.match(ctx.compressorStatus({compressorState:'charging'}),/꺼짐/);
});
test('changing fan condition invalidates active brake trial and CSV records fan state',()=>{
 const sim={state:{time:0,pos:{x:0,z:0},vel:{x:10,z:0}},contactCount:4,collisionCount:0,obstacleContacts:[],totalThrust:0};
 const trial=new CityBrakeTrial();trial.sample(sim,{braking:true,settings:{fanEnabled:true}});
 sim.state.time=.002;trial.sample(sim,{braking:true,settings:{fanEnabled:false}});
 assert.equal(trial.lastResult.reason,'settings-changed');
 const csv=brakeResultsCSV([trial.lastResult]);assert.match(csv.split('\r\n')[0],/fan_enabled/);
 assert.ok(csv.split('\r\n')[1].endsWith('"true"'));
});
