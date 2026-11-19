import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {LANDING_STEP,createLandingRun,landingClearance,landingRunInput,updateLandingRun} from '../dist/js/landing-experiment.js';
import {LandingUI,landingResearchCards,landingResearchPlot} from '../dist/js/landing-ui.js';
import {landingTradeoff} from '../dist/js/landing-analysis.js';

function experiment(method='free',brakeHeight=2.25){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,method,brakeHeight});
  for(let step=0;!run.done&&step<20000;step++){
    sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);
  }
  assert.ok(run.done);
  return {...run.result,id:method,groupId:'research',groupSize:3,vehicleId:'roadster',vehicleTitle:'Roadster'};
}
const free=experiment(),brake=experiment('brake'),gentle=experiment('gentle'),rows=[free,brake,gentle];
function elements(){
  const map=new Map(),element=selector=>{
    if(!map.has(selector))map.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false});return map.get(selector);
  };
  return {element,map};
}

test('research cards show measured analytic verification and contact energy, never powered-run freefall error',()=>{
  const cards=landingResearchCards(rows);
  assert.match(cards,/7\.660/);assert.match(cards,/상대 오차/);assert.match(cards,/전체 [\d.]+ s/);
  assert.match(cards,/접촉 직전 질량과 수직 속도/);
  assert.doesNotMatch(cards,/NaN|undefined|Infinity/);
  const powered=landingResearchCards([brake,gentle]);
  assert.match(powered,/기준 실험 필요/);assert.doesNotMatch(powered,/상대 오차/);
});

test('plots retain unsafe baseline measurements, identify stable tradeoff candidates, and escape labels',()=>{
  const tradeoff=landingTradeoff(rows),plot=landingResearchPlot(rows,{kind:'gas',candidates:tradeoff.candidates});
  assert.ok(free.bodyStrike);assert.match(plot,/차체 접촉/);assert.match(plot,/<path d="M /);
  assert.match(plot,/<circle/);assert.match(plot,/기체 사용량 · kg/);
  assert.match(plot,/tabindex="0" role="img" aria-label=/);
  const heightPlot=landingResearchPlot(rows,{kind:'height',baseline:free,candidates:tradeoff.candidates});
  assert.match(heightPlot,/자유낙하 기준/);assert.match(heightPlot,/자동 제동 명령 높이 · m/);
  assert.equal((heightPlot.match(/class="landing-research-point"/g)||[]).length,1,'free and gentle are not fabricated trigger-height measurements');
  const malicious={...brake,method:'<script>alert(1)</script>'};
  const escaped=landingResearchPlot([malicious]);
  assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&lt;script&gt;/);
  assert.doesNotMatch(landingResearchPlot([{...brake,gasUsed:NaN}]),/<svg/);
});

test('research analysis isolates one vehicle and clears old plots when viewing unlike history',()=>{
  const {element}=elements(),other=rows.map(row=>({...row,vehicleId:'other',vehicleTitle:'Other',initialMass:1800}));
  const ui={dialog:{querySelector:element},researchVehicle:'roadster'};
  LandingUI.prototype.renderResearch.call(ui,[...rows,...other]);
  assert.equal(element('#landing-research-vehicle-label').hidden,false);
  assert.match(element('#landing-research-scope').textContent,/Roadster · .* 3회/);
  assert.equal((element('#landing-gas-chart').innerHTML.match(/class="landing-research-point"/g)||[]).length,3);
  ui.stableZoom=true;LandingUI.prototype.renderResearch.call(ui,[...rows,...other]);
  assert.match(element('#landing-zoom-note').textContent,/조건 미충족 1회는 그래프에서 제외/);
  assert.equal((element('#landing-gas-chart').innerHTML.match(/class="landing-research-point"/g)||[]).length,2);
  assert.doesNotMatch(element('#landing-height-chart').innerHTML,/자유낙하 기준/,'unsafe baseline must not keep stretching the zoomed y axis');
  assert.match(element('#landing-research-cards').innerHTML,/7\.660/,'theory verification remains visible when the unsafe baseline point is hidden');
  ui.researchVehicle='other';LandingUI.prototype.renderResearch.call(ui,[...rows,...other]);
  assert.match(element('#landing-research-scope').textContent,/Other · .* 3회/);
  LandingUI.prototype.renderResearch.call(ui,[...rows,...other],true);
  assert.equal(element('#landing-research-plots').hidden,true);
  assert.equal(element('#landing-gas-chart').innerHTML,'','export must not include stale per-batch graphs under all-history mode');
  assert.equal(element('#landing-height-chart').innerHTML,'');
});

test('different vehicle masses never receive a global raw-force winner',()=>{
  const {element}=elements();
  const mixed=[{...brake,groupSize:2},{...gentle,groupSize:2,vehicleId:'lighter',initialMass:1400,peakEquivalentGroundForceN:1}];
  LandingUI.prototype.renderResults.call({results:mixed,selectedGroup:'research',dialog:{querySelector:element},renderChart(){}});
  assert.match(element('#landing-best').textContent,/차종마다 질량/);
  assert.doesNotMatch(element('#landing-result-rows').innerHTML,/landing-best-row/);
});

test('fixed-brake observation records the first control command under immediate, delayed and missing activation',()=>{
  for(const {height,threshold,manualSteps} of [
    {height:3,threshold:10,manualSteps:0},
    {height:20,threshold:1.5,manualSteps:0},
    {height:3,threshold:0,manualSteps:0},
    {height:3,threshold:10,manualSteps:20}
  ]){
    const sim=new PhysicsSim(),run=createLandingRun(sim,{height,method:'brake',brakeHeight:threshold});
    let firstCommand=null;
    for(let step=0;!run.done&&step<30000;step++){
      const input=landingRunInput(run,sim,step<manualSteps);
      if(firstCommand===null&&Number.isFinite(input.verticalAcceleration)){
        firstCommand={height:landingClearance(sim),time:run.elapsed};
      }
      sim.step(LANDING_STEP,input);updateLandingRun(run,sim);
    }
    assert.ok(run.done);
    assert.equal(run.result.brakeHeight,threshold);
    assert.equal(run.result.autoBrakeHeight,firstCommand?.height??null);
    assert.equal(run.result.autoBrakeTime,firstCommand?.time??null);
    if(manualSteps)assert.ok(firstCommand.time>=manualSteps*LANDING_STEP-1e-10);
    else if(threshold===0)assert.equal(firstCommand,null);
    else if(threshold>height)assert.deepEqual(firstCommand,{height,time:0});
    else assert.ok(firstCommand.height<threshold&&firstCommand.time>0);
  }
});

test('height graph uses measured commands, supports legacy settings, and omits trials with no command',()=>{
  const immediate=experiment('brake',10),unarmed=experiment('brake',0);
  const old={...immediate,autoBrakeHeight:null};
  delete old.autoBrakeTime;
  const plot=landingResearchPlot([immediate,unarmed,old],{kind:'height'});
  assert.match(plot,/10 m 설정 · 3 m 명령/);
  assert.match(plot,/자동 제동 명령 높이 3 m/);
  assert.equal((plot.match(/class="landing-research-point"/g)||[]).length,1);
  const legacy=landingResearchPlot([old],{kind:'height'});
  assert.match(legacy,/제동 설정 높이 10 m/);
  assert.doesNotMatch(legacy,/자동 제동 명령 높이/);
  assert.doesNotMatch(landingResearchPlot([unarmed],{kind:'height'}),/<svg/);
});

test('reopening an incomplete batch reports the completed measurement count',()=>{
  for(const count of [1,2]){
    const {element}=elements();
    const partial=rows.slice(0,count).map(row=>({...row,groupSize:4}));
    const ui={results:partial,selectedGroup:'research',dialog:{querySelector:element},renderChart(){}};
    LandingUI.prototype.renderResults.call(ui);
    assert.equal(element('#landing-best').hidden,false);
    assert.equal(element('#landing-best').textContent,'부분 기록 · 예정 4회 중 '+count+'회 측정 완료');
    assert.doesNotMatch(element('#landing-result-rows').innerHTML,/landing-best-row/);
  }
});

test('CSV exports separate constant-mass audit from powered contact energy and preserve trace caveats',async()=>{
  const previousDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  let blob;
  globalThis.document={createElement(){return {click(){}};}};
  URL.createObjectURL=value=>{blob=value;return 'blob:research';};URL.revokeObjectURL=()=>{};
  try{
    LandingUI.prototype.exportSummary.call({results:rows});
    const csv=await blob.text(),lines=csv.split('\r\n'),header=lines[1].split(',').map(cell=>cell.slice(1,-1));
    assert.ok(header.includes('touchdownMass'));assert.ok(header.includes('touchdownKineticEnergyJ'));
    assert.ok(header.includes('contactEndTime'));assert.ok(header.includes('contactEndVelocityY'));
    assert.ok(header.includes('impulse_audit_duration_s'));assert.ok(header.includes('pareto_candidate_in_same_conditions'));
    assert.ok(header.includes('modelVersion'));assert.ok(header.includes('target_speed_met'));
    const parsePrefix=line=>line.split(',').map(cell=>cell.slice(1,-1));
    const freeCells=parsePrefix(lines[2]),brakeCells=parsePrefix(lines[3]);
    assert.equal(freeCells[header.indexOf('autoBrakeHeight')],'');
    assert.equal(freeCells[header.indexOf('autoBrakeTime')],'');
    assert.equal(Number(brakeCells[header.indexOf('brakeHeight')]),brake.brakeHeight);
    assert.equal(Number(brakeCells[header.indexOf('autoBrakeHeight')]),brake.autoBrakeHeight);
    assert.equal(Number(brakeCells[header.indexOf('autoBrakeTime')]),brake.autoBrakeTime);
    assert.equal(freeCells[header.indexOf('modelVersion')],free.modelVersion);
    assert.ok(Number(freeCells[header.indexOf('theory_expected_speed_m_s')])>7);
    assert.equal(Number(freeCells[header.indexOf('contactEndTime')]),free.contactEndTime);
    assert.equal(Number(freeCells[header.indexOf('contactEndVelocityY')]),free.contactEndVelocityY);
    assert.equal(brakeCells[header.indexOf('theory_expected_speed_m_s')],'');
    assert.equal(brakeCells[header.indexOf('impulse_audit_net_N_s')],'');
    assert.ok(Number(brakeCells[header.indexOf('touchdownMass')])<brake.initialMass);
    LandingUI.prototype.exportTraces.call({results:rows});
    const trace=await blob.text();assert.match(trace,/must not be integrated for impulse/);
    assert.match(trace,/"compression","stateCompression"/);assert.match(trace,/compression is the pre-integration force-evaluation value/);
    assert.match(trace,/"massKg","kineticEnergyJ","potentialEnergyJ","springEnergyJ"/);
    const traceLines=trace.split('\r\n'),traceKeys=parsePrefix(traceLines[1]),first=parsePrefix(traceLines[2]);
    const peakTime=free.samples[0].equivalentGroundForcePeakTime;
    assert.equal(Number(first[traceKeys.indexOf('equivalentGroundForcePeakTime')]),peakTime);
    assert.equal(Number(first[traceKeys.indexOf('equivalent_force_peak_time_from_touchdown_s')]),peakTime-free.touchdownTime);
    LandingUI.prototype.exportTraces.call({results:[{...free,samples:[{time:free.touchdownTime,equivalentGroundForceN:100}]}]});
    const old=parsePrefix((await blob.text()).split('\r\n')[2]);
    assert.equal(old[traceKeys.indexOf('equivalentGroundForcePeakTime')],'');
    assert.equal(old[traceKeys.indexOf('equivalent_force_peak_time_from_touchdown_s')],'');
  }finally{globalThis.document=previousDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

test('saved SVG embeds readable styles, selected vehicle and stable-zoom exclusions',async()=>{
  const previousDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  let blob,name;
  globalThis.document={createElement(){return {set download(value){name=value;},click(){}};}};
  URL.createObjectURL=value=>{blob=value;return 'blob:research-svg';};URL.revokeObjectURL=()=>{};
  const plot=landingResearchPlot([brake],{kind:'height'});
  const svg={getAttribute(){return '0 0 600 285';},innerHTML:plot.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')};
  const nodes={'#landing-height-chart svg':svg,'#landing-research-vehicle':{selectedOptions:[{textContent:'Roadster <test>'}]},'#landing-zoom-note':{textContent:'확대: 안정 2회 · 조건 미충족 4회는 그래프에서 제외.'},'#landing-group-conditions':{textContent:'동일 높이 3 m'}};
  try{
    LandingUI.prototype.exportGraphs.call({dialog:{querySelector:selector=>nodes[selector]||null,querySelectorAll:()=>[]}});
    const saved=await blob.text();
    assert.equal(name,'landing-graphs.svg');assert.equal(blob.type,'image/svg+xml;charset=utf-8');
    assert.match(saved,/<style>/);assert.match(saved,/조건 미충족 4회는 그래프에서 제외/);
    assert.match(saved,/Roadster &lt;test&gt;/);assert.doesNotMatch(saved,/<test>/);
    assert.match(saved,/viewBox="0 0 600 285"/);
    assert.doesNotMatch(saved,/undefined|NaN|Infinity/);
  }finally{globalThis.document=previousDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
