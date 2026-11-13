import test from 'node:test';
import assert from 'node:assert/strict';
import {LandingUI,landingEconomyComparison,landingResearchPlot} from '../dist/js/landing-ui.js';

const base={groupId:'economy',groupSize:4,vehicleId:'roadster',vehicleTitle:'Roadster',height:3,targetSpeed:.5,springK:75000,damperC:6000,initialMass:2275,initialGas:375,tankVolume:.9,tankPressureMPa:35.875,initialTemperature:300,status:'landed',settled:true,touchdownTime:.8,touchdownSpeed:.5,contactPeakG:2,maxCompression:.1,bodyStrike:false,bottomedOut:false,manualLiftUsed:false};
const rows=[
  {...base,id:'free',method:'free',brakeHeight:1.5,gasUsed:0,peakEquivalentGroundForceN:1700000,bodyStrike:true},
  {...base,id:'brake',method:'brake',brakeHeight:1.5,gasUsed:35,peakEquivalentGroundForceN:60000},
  {...base,id:'gentle',method:'gentle',brakeHeight:1.5,gasUsed:80,peakEquivalentGroundForceN:40000},
  {...base,id:'eco',method:'eco',brakeHeight:1.5,autoBrakeHeight:1.9,ecoCoastTime:.45,ecoProfile:'brake',ecoPlannedBrakeHeight:1.88,ecoPredictedTouchdownSpeed:.51,ecoPredictedTouchdownGas:19.5,ecoPredictedGas:19.9,ecoPlanFeasible:true,gasUsed:20,peakEquivalentGroundForceN:30000}
];
const eco=rows[3];
function resultNodes(results=rows,selectedGroup='economy'){
  const values=new Map(),querySelector=selector=>{if(!values.has(selector))values.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false});return values.get(selector);};
  LandingUI.prototype.renderResults.call({results,selectedGroup,dialog:{querySelector},renderChart(){}});
  return querySelector;
}

test('economy benefits come from measured matched baselines and retain negative reductions',()=>{
  const result=landingEconomyComparison(eco,rows);
  assert.equal(result.gentle.id,'gentle');assert.equal(result.brake.id,'brake');
  assert.equal(result.gasReductionPercent,75);assert.equal(result.forceReductionPercent,50);
  const worse={...eco,gasUsed:100,peakEquivalentGroundForceN:90000};
  const increased=landingEconomyComparison(worse,rows);
  assert.equal(increased.gasReductionPercent,-25);assert.equal(increased.forceReductionPercent,-50);
  const node=resultNodes([...rows.slice(0,3),worse]);
  assert.match(node('#landing-best').textContent,/기체 25.0% 증가/);
  assert.match(node('#landing-best').textContent,/반력 50.0% 증가/);
});

test('economy comparisons reject different batch, mass, rig, tank and target conditions',()=>{
  for(const key of ['groupId','vehicleId','height','targetSpeed','springK','damperC','initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature']){
    const value=typeof eco[key]==='string'?eco[key]+'-other':eco[key]+1;
    assert.equal(landingEconomyComparison({...eco,[key]:value},rows),null,key);
  }
  for(const key of ['initialMass','initialGas','tankVolume','tankPressureMPa','initialTemperature'])assert.equal(landingEconomyComparison({...eco,[key]:undefined},rows),null,key);
  assert.equal(landingEconomyComparison(eco,rows.filter(row=>row.method!=='brake')),null);
  assert.equal(landingEconomyComparison(eco,rows.map(row=>row.method==='gentle'?{...row,gasUsed:0}:row)),null);
});

test('unsafe economy and gentle runs cannot advertise savings; actual hard fixed-height impacts remain comparable',()=>{
  for(const patch of [{settled:false},{manualLiftUsed:true},{bodyStrike:true},{bottomedOut:true},{status:'timeout'},{gasUsed:NaN},{peakEquivalentGroundForceN:Infinity}]){
    assert.equal(landingEconomyComparison({...eco,...patch},rows),null,JSON.stringify(patch));
    assert.equal(landingEconomyComparison(eco,rows.map(row=>row.method==='gentle'?{...row,...patch}:row)),null,JSON.stringify(patch));
  }
  const hard=rows.map(row=>row.method==='brake'?{...row,bodyStrike:true,bottomedOut:true,status:'unsettled',settled:false}:row);
  assert.equal(landingEconomyComparison(eco,hard).forceReductionPercent,50);
  assert.equal(landingEconomyComparison(eco,rows.map(row=>row.method==='brake'?{...row,manualLiftUsed:true}:row)),null);
});

test('economy summary waits for the whole comparison and never mixes all-history results',()=>{
  const node=resultNodes();
  assert.match(node('#landing-best').textContent,/절약 착지: 20.00 kg · 30.00 kN/);
  assert.match(node('#landing-best').textContent,/기체 75.0% 감소/);
  assert.match(node('#landing-result-rows').innerHTML,/절약 착지/);
  assert.doesNotMatch(resultNodes(rows.slice(1))('#landing-best').textContent,/절약 착지:/);
  assert.doesNotMatch(resultNodes(rows,'__all__')('#landing-best').textContent,/절약 착지:/);
  assert.doesNotMatch(resultNodes(rows.map(row=>row.method==='eco'?{...row,vehicleId:'other'}:row))('#landing-best').textContent,/절약 착지:/);
  const plot=landingResearchPlot([eco]);
  assert.match(plot,/>절약<\/text>/);assert.match(plot,/절약 착지/);
  assert.doesNotMatch(plot,/1.5 m/,'eco point must not claim the unused manual trigger setting');
});

test('automatic trigger input remains disabled after a run while comparison preserves its fixed-height baseline',()=>{
  const method={value:'eco'},brakeHeight={value:'1.5',disabled:false,title:''},unit={textContent:''};
  const form={elements:{namedItem:name=>({method,brakeHeight})[name]},querySelectorAll:()=>[method,brakeHeight]};
  const node={hidden:false,disabled:false},ui={form,busy:false,results:[],root:{querySelector:selector=>selector==='#landing-brake-unit'?unit:node},dialog:{open:false},syncMethodInputs:LandingUI.prototype.syncMethodInputs};
  ui.syncMethodInputs();assert.equal(brakeHeight.disabled,true);assert.equal(unit.textContent,'자동');
  LandingUI.prototype.setBusy.call(ui,true);LandingUI.prototype.setBusy.call(ui,false);
  assert.equal(method.disabled,false);assert.equal(brakeHeight.disabled,true);
  method.value='brake';ui.syncMethodInputs();assert.equal(brakeHeight.disabled,false);assert.equal(unit.textContent,'m');
  method.value='eco';ui.syncMethodInputs();
  const previous=globalThis.FormData;
  globalThis.FormData=class{get(name){return {height:'3',method:'eco',brakeHeight:null,targetSpeed:'.5',springK:'75',damperC:'6'}[name];}getAll(){return ['roadster'];}};
  try{const options=LandingUI.prototype.readOptions.call(ui);assert.equal(options.method,'eco');assert.equal(options.brakeHeight,1.5);}finally{globalThis.FormData=previous;}
});

test('CSV preserves economy baselines, reductions and measured automatic trigger values',async()=>{
  const previousDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  let blob;globalThis.document={createElement(){return {click(){}};}};
  URL.createObjectURL=value=>{blob=value;return 'blob:economy';};URL.revokeObjectURL=()=>{};
  try{
    LandingUI.prototype.exportSummary.call({results:rows});
    const lines=(await blob.text()).split('\r\n'),parse=line=>line.split(',').map(cell=>cell.slice(1,-1)),header=parse(lines[1]),cells=parse(lines[5]);
    const value=name=>cells[header.indexOf(name)];
    assert.equal(value('method'),'eco');assert.equal(value('eco_gas_baseline_id'),'gentle');assert.equal(value('eco_force_baseline_id'),'brake');
    assert.equal(Number(value('eco_gas_reduction_percent_vs_gentle')),75);assert.equal(Number(value('eco_force_reduction_percent_vs_brake')),50);
    assert.equal(Number(value('autoBrakeHeight')),1.9);assert.equal(Number(value('ecoCoastTime')),.45);
    assert.equal(value('ecoProfile'),'brake');assert.equal(value('ecoPlanFeasible'),'true');
    assert.equal(Number(value('ecoPlannedBrakeHeight')),1.88);assert.equal(Number(value('ecoPredictedTouchdownSpeed')),.51);
    assert.equal(Number(value('ecoPredictedTouchdownGas')),19.5);assert.equal(Number(value('ecoPredictedGas')),19.9);
    assert.equal(Number(value('gasUsed')),20,'measured gas remains distinct from the predicted total');
    assert.equal(parse(lines[2])[header.indexOf('eco_gas_reduction_percent_vs_gentle')],'');
  }finally{globalThis.document=previousDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
