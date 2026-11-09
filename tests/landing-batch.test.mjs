import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLandingJobs} from '../dist/js/landing-experiment.js';
import {retainLandingGroups,LANDING_HISTORY_LIMIT} from '../dist/js/landing-ui.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';

test('all-fleet comparison creates every car and method exactly once independent of selection',()=>{
  const jobs=createLandingJobs('fleet-methods',VEHICLES,{vehicleIds:[VEHICLES[0].id],method:'gentle',height:2000},VEHICLES[0].id);
  assert.equal(jobs.length,39);
  assert.equal(new Set(jobs.map(job=>job.vehicleId+'/'+job.method)).size,39);
  for(const vehicle of VEHICLES)assert.deepEqual(jobs.filter(job=>job.vehicleId===vehicle.id).map(job=>job.method),['free','brake','gentle']);
  assert.deepEqual(createLandingJobs('vehicles',VEHICLES,{vehicleIds:[VEHICLES[2].id,VEHICLES[0].id],method:'gentle'},VEHICLES[1].id),[
    {vehicleId:VEHICLES[0].id,method:'gentle'},{vehicleId:VEHICLES[2].id,method:'gentle'},
  ]);
  assert.deepEqual(createLandingJobs('methods',VEHICLES,{},VEHICLES[1].id).map(job=>job.vehicleId),Array(3).fill(VEHICLES[1].id));
  assert.deepEqual(createLandingJobs('fleet-methods',[],{},'missing'),[]);
});

test('result retention keeps a whole 39-run batch and evicts old comparisons as whole groups',()=>{
  const results=[];
  for(const groupId of ['height3','height10'])for(let n=0;n<39;n++){
    results.push({groupId,id:groupId+'-'+n});retainLandingGroups(results,groupId);
  }
  assert.equal(results.length,78);assert.equal(LANDING_HISTORY_LIMIT,78);
  for(let n=0;n<39;n++){
    results.push({groupId:'height100',id:'height100-'+n});retainLandingGroups(results,'height100');
    assert.equal(results.filter(result=>result.groupId==='height100').length,n+1);
  }
  assert.equal(results.length,78);
  assert.equal(results.filter(result=>result.groupId==='height3').length,0);
  assert.equal(results.filter(result=>result.groupId==='height10').length,39);
  assert.equal(results.filter(result=>result.groupId==='height100').length,39);
});

test('release and brake inputs have no upper-bound attributes and accept fractional heights',async()=>{
  const source=await readFile(new URL('../dist/js/landing-ui.js',import.meta.url),'utf8');
  for(const id of ['landing-height','landing-brake-height']){
    const tag=source.match(new RegExp('<input id="'+id+'"[^>]+>'))?.[0];
    assert.ok(tag);assert.ok(!/\bmax=/.test(tag));assert.match(tag,/step="any"/);
  }
  assert.match(source,/landing-fleet-methods/);
});
