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
