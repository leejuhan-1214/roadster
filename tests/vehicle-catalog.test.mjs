import test from 'node:test';
import assert from 'node:assert/strict';
import {searchCityVehicles,vehicleOptionsForMode} from '../dist/js/vehicle-catalog.js';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {experimentVehicles} from '../dist/js/experiment-vehicles.js';
test('driving search supports brands and multiple terms while preserving input data',()=>{
 const all=[...VEHICLES],search=searchCityVehicles(all,'  TESLA   ');assert.ok(search.length>=2);assert.ok(search.every(v=>v.brand==='Tesla'));
 assert.deepEqual(searchCityVehicles(all,'bmw e30').map(v=>v.id),['bmw']);assert.equal(searchCityVehicles(all,'not-a-car-name').length,0);assert.deepEqual(all,VEHICLES);assert.equal(searchCityVehicles(all,'').length,all.length);
});
test('landing exposes only the five mass representatives while driving and structure keep the complete catalog',()=>{
 const cohort=experimentVehicles(VEHICLES);assert.equal(vehicleOptionsForMode('lab',VEHICLES,cohort).length,5);
 assert.equal(vehicleOptionsForMode('city',VEHICLES,cohort),VEHICLES);assert.equal(vehicleOptionsForMode('inspect',VEHICLES,cohort),VEHICLES);
 for(const car of VEHICLES.filter(v=>!cohort.includes(v)))assert.ok(!vehicleOptionsForMode('lab',VEHICLES,cohort).includes(car));
});

test('new city models are individually selectable using the Korean garage search',()=>{
 const release=searchCityVehicles(VEHICLES,'신규');
 assert.equal(release.length,50);
 assert.equal(new Set(release.map(p=>p.url)).size,50);
 assert.ok(release.every(p=>p.cityOnly));
 assert.deepEqual(searchCityVehicles(VEHICLES,'신규 포드').map(p=>p.id).sort(),
   ['sd-rs1-fmc-centre04','sd-sc-fmc-gt4']);
});
