import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {airState,airDensity,airTemperature} from '../dist/js/air-eos.js';
const refs=JSON.parse(fs.readFileSync(new URL('./air-eos-reference.json',import.meta.url),'utf8')).states;
test('Lemmon air EOS matches independent CoolProp7.2.0 HEOS reference states',()=>{
 for(const r of refs){const rho=airDensity(r.pressure,r.temp),s={...airState(rho,r.temp),rho};
  for(const k of ['rho','u','h','cv','cp'])assert.ok(Math.abs(s[k]/r[k]-1)<1e-7,k+' at '+r.pressure+'Pa/'+r.temp+'K');
  assert.ok(Math.abs(airTemperature(rho,r.u)/r.temp-1)<1e-7);
 }
});
test('real-air density corrects ideal high-pressure capacity without an arbitrary Z multiplier',()=>{
 const density=airDensity(30.101325e6,293.15),s=airState(density,293.15);
 assert.ok(density>323&&density<324);assert.ok(s.z>1.1&&s.z<1.11);
 assert.throws(()=>airState(10,100),RangeError);
});
