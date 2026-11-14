import test from 'node:test';import assert from 'node:assert/strict';
import {AIR_SYSTEM_DEFAULTS,nominalAirMass,gasProperties} from '../dist/js/air-systems.js';
import {advanceAirDischarge} from '../dist/js/air-blowdown.js';
const p={...AIR_SYSTEM_DEFAULTS,calibratedHardware:true,tankVolume:.108,tankPressureMPa:25.101325,initialTemperature:293.15,minimumGasTemperatureK:263.15};
const initial=()=>{const gas=nominalAirMass(p);return {gas,temp:293.15,pressure:25.101325e6,tankWallTemp:293.15};};
const U=s=>s.gas*gasProperties(s.gas,p.tankVolume,s.temp,p).u;
test('discharge gas/enthalpy/wall balances remain conserved through thermal shutoff',()=>{
 let s=initial(),out=0,mass=0,gasHeat=0,ambient=0,limited=false;const first={...s};
 for(let i=0;i<2000;i++){const r=advanceAirDischarge(s,p,4*.002,.002);out+=r.expelledEnthalpyJ;mass+=r.removedKg;gasHeat+=r.tankHeatOutJ;ambient+=r.ambientHeatOutJ;
  if(r.thermalLimited)limited=true;assert.ok(r.temp>=p.minimumGasTemperatureK-1e-7);assert.ok(r.removedKg<=.008+1e-12);s={...s,...r};}
 assert.ok(limited);assert.ok(s.gas>15,'valve thermal limit does not fake an empty tank');
 assert.ok(Math.abs(first.gas-s.gas-mass)<1e-10);
 assert.ok(Math.abs(U(s)+out+gasHeat-U(first))<1e-4);
 const wallDelta=p.tankWallHeatCapacityJK*(s.tankWallTemp-first.tankWallTemp);
 assert.ok(Math.abs(U(s)+out+wallDelta+ambient-U(first))<1e-4);
});
test('midpoint outflow converges on half timestep without injecting temperature',()=>{
 const run=dt=>{let s=initial();for(let t=0;t<1-1e-10;t+=dt)s={...s,...advanceAirDischarge(s,p,2*dt,dt)};return s;};
 const coarse=run(.002),fine=run(.001);assert.ok(Math.abs(coarse.temp-fine.temp)<.002);assert.ok(Math.abs(coarse.pressure/fine.pressure-1)<.00002);
});
test('legacy ideal diagnostic branch retains exact closed adiabatic relation',()=>{
 const state={gas:10,temp:300,pressure:10*287*300/.1};
 const r=advanceAirDischarge(state,{realGas:false,tankVolume:.1},1,.1);
 assert.ok(Math.abs(r.temp-300*.9**.4)<1e-10);assert.equal(r.tankHeatOutJ,0);
});

test('thermal interlock stays latched until2K recovery even with no demanded flow',()=>{
 const s=initial();s.temp=263.15;s.pressure=gasProperties(s.gas,p.tankVolume,s.temp,p).pressure;s.thermalLimited=true;
 const held=advanceAirDischarge(s,p,0,.002,{heat:false});assert.equal(held.thermalLimited,true);assert.equal(held.removedKg,0);
 s.temp=264.15;const still=advanceAirDischarge(s,p,.001,.002,{heat:false});assert.equal(still.thermalLimited,true);assert.equal(still.removedKg,0);
 s.temp=265.2;const cleared=advanceAirDischarge(s,p,.001,.002,{heat:false});assert.equal(cleared.thermalLimited,false);assert.ok(cleared.removedKg>0);
});
