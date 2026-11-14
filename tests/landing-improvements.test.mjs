import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingJobs,createLandingRun,landingRunInput,updateLandingRun,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {LandingUI,landingBaselineComparison} from '../dist/js/landing-ui.js';

const fleet=[{id:'roadster'},{id:'other'}];
function sweep(height=3){
  const settings={height,method:'gentle',brakeHeight:.001,targetSpeed:.5,springK:75000,damperC:6000};
  return createLandingJobs('brake-heights',fleet,settings,'roadster').map((job,index)=>{
    const sim=new PhysicsSim(),run=createLandingRun(sim,{...settings,...job});
    let steps=0;
    while(!run.done&&steps++<30000){sim.step(LANDING_STEP,landingRunInput(run,sim));updateLandingRun(run,sim);}
    assert.ok(run.done,'finite 3 m sweep finishes');
    return {...run.result,id:'sweep-'+index,groupId:'sweep',groupKind:'brake-heights',groupSize:6,vehicleId:job.vehicleId};
  });
}
const results=sweep();

test('brake-height sweep varies just trigger height and includes a reset free-fall baseline',()=>{
  assert.equal(results.length,6);
  assert.equal(results[0].method,'free');
  results.slice(1).forEach((result,index)=>assert.ok(Math.abs(result.brakeHeight-[.3,.75,1.5,2.25,3][index])<1e-12));
  for(const result of results){
    assert.equal(result.vehicleId,'roadster');assert.equal(result.height,3);
    assert.equal(result.initialGas,375);assert.equal(result.initialMass,2275);
    assert.equal(result.springK,75000);assert.equal(result.damperC,6000);
    assert.equal(result.targetSpeed,.5);assert.notEqual(result.status,'timeout');
    assert.ok(result.contactDuration>0&&result.contactDuration<1,'first stop excludes the settled observation window');
    assert.ok(result.totalGroundImpulseNs>result.groundImpulseNs,'first compression impulse excludes later static support');
  }
  assert.ok(results[1].touchdownSpeed>results[4].touchdownSpeed+1,'late braking cannot erase descent speed');
  assert.ok(results[1].peakEquivalentGroundForceN>results[4].peakEquivalentGroundForceN,'trigger sweep has a measurable load tradeoff');
  assert.equal(results[0].gasUsed,0);assert.ok(results[4].gasUsed>0);
});

test('zero-height sweep does not repeat five identical trials and large heights remain unbounded',()=>{
  const zero=createLandingJobs('brake-heights',fleet,{height:0},'roadster');
  assert.deepEqual(zero,[{vehicleId:'roadster',method:'free'},{vehicleId:'roadster',method:'brake',brakeHeight:0}]);
  const high=createLandingJobs('brake-heights',fleet,{height:1e8},'other');
  assert.equal(high.length,6);assert.equal(high.at(-1).brakeHeight,1e8);
  assert.ok(high.every(job=>job.vehicleId==='other'));
});

test('baseline changes use the same vehicle and conditions even when free fall strikes the chassis',()=>{
  const baseline=results[0],gentler=results[4];
  assert.ok(baseline.bodyStrike,'3 m untreated baseline has an explicitly unsafe result');
  const comparison=landingBaselineComparison(gentler,results);
  assert.equal(comparison.baseline,baseline);assert.ok(comparison.reductionPercent>50);
  assert.equal(landingBaselineComparison(baseline,results).reductionPercent,0);
  for(const [key,value]of [['groupId','other-batch'],['vehicleId','other'],['height',4],['initialGas',350],['springK',50000],['tankPressureMPa',30]]){
    assert.equal(landingBaselineComparison({...gentler,[key]:value},[baseline]),null,key+' cannot silently mix conditions');
  }
  assert.equal(landingBaselineComparison({...gentler,status:'timeout'},results),null);
  assert.equal(landingBaselineComparison({...gentler,initialTemperature:undefined},results),null);
  const worse={...gentler,peakEquivalentGroundForceN:baseline.peakEquivalentGroundForceN*1.2};
  assert.ok(Math.abs(landingBaselineComparison(worse,results).reductionPercent+20)<1e-9,'worse loads are not mislabeled as reductions');
});

test('results show distinct trigger labels and exclude chassis impacts from the best candidate',()=>{
  const elements=new Map(),element=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:''});return elements.get(selector);
  };
  const ui={results,selectedGroup:'sweep',dialog:{querySelector:element},renderChart(){}};
  LandingUI.prototype.renderResults.call(ui);
  assert.match(element('#landing-best').textContent,/추력 제동 · [\d.]+ m/);
  assert.match(element('#landing-best').textContent,/자유 낙하보다 .*% 감소/);
  assert.match(element('#landing-best').textContent,/최소값 후보에서 제외/);
  assert.match(element('#landing-group-conditions').textContent,/제동 시작 높이만 변경/);
  assert.match(element('#landing-result-rows').innerHTML,/기준/);
  assert.match(element('#landing-metric-rows').innerHTML,/0\.75 m/);
  assert.equal((element('#landing-metric-rows').innerHTML.match(/<tr>/g)||[]).length,6);
  const firstRow=element('#landing-result-rows').innerHTML.split('</tr>')[0];
  assert.ok(!firstRow.includes('landing-best-row'),'unsafe baseline never wins a stable landing comparison');
});

test('CSV records matched baseline ID and numeric reduction alongside contact metrics',async()=>{
  const previousDocument=globalThis.document,create=URL.createObjectURL,revoke=URL.revokeObjectURL;
  let blob,downloadName;
  globalThis.document={createElement(){return {set href(value){},set download(value){downloadName=value;},click(){}};}};
  URL.createObjectURL=value=>{blob=value;return 'blob:landing-test';};URL.revokeObjectURL=()=>{};
  try{
    LandingUI.prototype.exportSummary.call({results});
    const csv=await blob.text(),lines=csv.split('\r\n');
    assert.equal(downloadName,'landing-results.csv');
    assert.match(lines[1],/"contactDuration"/);assert.match(lines[1],/"groundImpulseNs"/);
    assert.match(lines[1],/"free_baseline_id","peak_force_reduction_percent"/);
    assert.match(lines[2],/"sweep-0","0",/);
    assert.ok(lines.slice(3).every(line=>line.includes('"sweep-0",')));
  }finally{globalThis.document=previousDocument;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
