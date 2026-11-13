import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLES,vehiclePhysics} from '../dist/js/vehicle-profiles.js';
import {PhysicsSim,DEFAULTS} from '../dist/js/physics.js';
import {createLandingJobs,createLandingRun} from '../dist/js/landing-experiment.js';
import {EXPERIMENT_VEHICLE_IDS,EXPERIMENT_DEFAULT_ID,experimentVehicles,experimentMass,experimentMassLabel,isExperimentVehicle} from '../dist/js/experiment-vehicles.js';

test('landing cohort stays at five mass-spaced vehicles when the city garage grows',()=>{
  const extra={id:'city-only-vehicle',dryMass:2000};
  const fleet=experimentVehicles([...VEHICLES,extra]);
  assert.equal(fleet.length,5);assert.equal(new Set(fleet.map(v=>v.id)).size,5);
  assert.deepEqual(fleet.map(v=>v.id),EXPERIMENT_VEHICLE_IDS);
  assert.ok(fleet.some(v=>v.id===EXPERIMENT_DEFAULT_ID));
  const masses=fleet.map(v=>experimentMass(v).total);
  assert.deepEqual(masses,[1465,1725,2015,2275,3525]);
  for(let i=1;i<masses.length;i++)assert.ok(masses[i]-masses[i-1]>=250);
  assert.equal(isExperimentVehicle(extra.id),false);
  assert.equal(isExperimentVehicle(EXPERIMENT_DEFAULT_ID),true);
  assert.equal(createLandingJobs('fleet-methods',fleet,{height:3},EXPERIMENT_DEFAULT_ID).length,20);
  assert.throws(()=>experimentVehicles(fleet.filter(v=>v.id!=='bmw')),/bmw/);
});

test('displayed initial totals equal actual reset physics and landing run masses',()=>{
  for(const profile of experimentVehicles(VEHICLES)){
    const before=JSON.stringify(profile),sim=new PhysicsSim(vehiclePhysics(profile,{},DEFAULTS));
    const run=createLandingRun(sim,{height:3,vehicleId:profile.id});
    const mass=experimentMass(profile,run.initialGas);
    assert.ok(Math.abs(mass.total-sim.mass)<1e-9,profile.id+' total matches the solver');
    assert.ok(Math.abs(mass.total-run.initialMass)<1e-9);
    assert.ok(Math.abs(mass.gas-375)<1e-9);
    assert.equal(JSON.stringify(profile),before,'the display helper never changes physical mass');
    assert.equal(experimentMass(profile,100).total,mass.dry+100,'remaining gas changes current total');
  }
});

test('concept assumptions remain visible without double-counting the Roadster rig',()=>{
  const get=id=>VEHICLES.find(v=>v.id===id);
  const roadster=experimentMass(get('roadster'));
  assert.equal(roadster.body,null);assert.equal(roadster.rig,null);
  assert.equal(roadster.dry,1900);assert.equal(roadster.total,2275);assert.equal(roadster.assumed,true);
  const cyber=experimentMass(get('tesla-cybertruck'));
  assert.equal(cyber.body,3000);assert.equal(cyber.rig,150);assert.equal(cyber.assumed,true);
  const bmw=experimentMass(get('bmw'));
  assert.equal(bmw.body+bmw.rig,bmw.dry);assert.equal(bmw.assumed,false);
  assert.match(experimentMassLabel(get('roadster')),/2,275 kg.*가정/);
  assert.doesNotMatch(experimentMassLabel(get('bmw')),/가정/);
  assert.throws(()=>experimentMass(get('bmw'),-1),TypeError);
  assert.throws(()=>experimentMass({dryMass:NaN}),TypeError);
});
