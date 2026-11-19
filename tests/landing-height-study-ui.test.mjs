import assert from 'node:assert/strict';
import test from 'node:test';
import {heightStudyCSV,heightStudyPlot,LandingHeightStudyPanel} from '../dist/js/landing-height-study-ui.js';

const conditions={config:{height:20,targetSpeed:.5,springK:75000,damperC:6000},vehicleId:'roadster',parameters:{dryMass:1900},
  hover:{durationS:1,startGasKg:375,releaseGasKg:334,releaseHeightM:20,releaseVelocityY:0,releasePressurePa:30e6,releaseTemperatureK:286}};
const row={method:'brake',brakeHeight:0,autoBrakeHeight:null,targetSpeed:.5,targetState:'no-command',entrySpeed:null,
  referenceAcceleration:null,predictedDistance:null,actualDistance:null,distanceToContact:null,supportDelay:null,touchdownSpeed:19,
  peakEquivalentGroundForceN:2e7,hoverGasKg:41,landingGasKg:0,totalGasKg:41,feasible:false,bodyStrike:true,bottomedOut:true,status:'landed'};
const safe={...row,brakeHeight:15.5,autoBrakeHeight:15.49,targetState:'reached',targetSpeed:.5,entrySpeed:11,
  referenceAcceleration:10,predictedDistance:6,actualDistance:9.9,distanceToContact:15.49,supportDelay:.135,touchdownSpeed:.49,
  peakEquivalentGroundForceN:27000,landingGasKg:120,totalGasKg:161,feasible:true,bodyStrike:false,bottomedOut:false};
const study={conditions,rows:[row,safe,{...safe,method:'eco'}]};

test('height plot keeps the zero-consumption impact and switches axes and points for an eligible-only zoom',()=>{
  const all=heightStudyPlot(study.rows,0);
  assert.match(all,/로그 눈금/);assert.match(all,/0 m · 차체 바닥 접촉 · 0 kg/);
  assert.match(all,/15\.5 m · 조건 충족/);assert.match(all,/절약 착지 · 조건 충족/);
  assert.equal([...all.matchAll(/data-height-index=/g)].length,3);
  const zoom=heightStudyPlot(study.rows,1,true);
  assert.doesNotMatch(zoom,/data-height-index="0"|NaN|Infinity/);
  assert.equal([...zoom.matchAll(/data-height-index=/g)].length,2);
});

test('the export separates no braking observation, zero landing use, both gas phases and shared release conditions',()=>{
  const [headers,miss,hit]=heightStudyCSV(study);
  const value=(cells,key)=>cells[headers.indexOf(key)];
  assert.equal(value(miss,'observed_target_distance_m'),'');assert.equal(value(miss,'target_state'),'no-command');
  assert.equal(value(miss,'support_delay_s'),'');assert.equal(value(miss,'landing_air_kg'),0);
  assert.equal(value(hit,'hover_air_kg')+value(hit,'landing_air_kg'),value(hit,'total_air_kg'));
  assert.equal(value(hit,'predicted_target_distance_m'),6);assert.equal(value(hit,'observed_target_distance_m'),9.9);
  assert.equal(value(hit,'release_air_kg'),value(miss,'release_air_kg'));assert.equal(value(hit,'support_delay_s'),.135);
});

test('a stopped run cannot replace a later result and closing cancels a pending worker',async()=>{
  const controls=new Map(),workers=[],closeEvents=[];
  function control(){return {listeners:{},hidden:false,checked:false,addEventListener(type,fn){this.listeners[type]=fn;},
    removeAttribute(){},setAttribute(){},replaceChildren(){},showModal(){this.open=true;},close(){this.open=false;closeEvents.push(()=>this.listeners.close?.());}};}
  const dialog=control();
  dialog.querySelector=id=>{if(!controls.has(id))controls.set(id,control());return controls.get(id);};
  const previous={document:globalThis.document,Worker:globalThis.Worker,Option:globalThis.Option};
  globalThis.document={createElement:()=>dialog,body:{append(){}}};
  globalThis.Option=class{};
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(){}terminate(){this.terminated=true;}};
  try{
    let selected=conditions;
    const panel=new LandingHeightStudyPanel(()=>selected,()=>{});
    panel.open();await Promise.resolve();assert.equal(workers.length,1);
    dialog.querySelector('#height-study-stop').listeners.click();assert.equal(workers[0].terminated,true);
    await panel.start(false);assert.equal(workers.length,2);
    workers[0].onmessage({data:{error:'stale'}});assert.doesNotMatch(panel.find('status').textContent,/stale/);
    workers[1].onmessage({data:{study}});assert.equal(panel.find('results').hidden,false);assert.equal(panel.find('choice').value,'1');
    await panel.start(true);assert.equal(workers.length,2,'same settings reuse completed measurements');
    await panel.start(false);assert.equal(workers.length,3);
    // A browser changes .open immediately, then dispatches close on a later task.
    dialog.close();
    selected={...conditions,config:{...conditions.config,verticalDragArea:5.1}};
    panel.open();await Promise.resolve();
    assert.equal(workers.length,4);assert.equal(workers[2].terminated,true);
    closeEvents.shift()();
    assert.equal(dialog.open,true);assert.equal(panel.worker,workers[3]);
    workers[3].onmessage({data:{progress:{phase:'coarse',done:1,total:23}}});
    assert.match(panel.find('status').textContent,/1 \/ 23/);
    dialog.close();closeEvents.shift()();
    assert.equal(workers[3].terminated,true);assert.equal(panel.worker,null);
    workers[3].onmessage({data:{error:'late'}});assert.doesNotMatch(panel.find('status').textContent,/late/);
  }finally{
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
});
