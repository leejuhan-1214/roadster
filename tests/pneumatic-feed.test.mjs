import test from 'node:test';
import assert from 'node:assert/strict';
import {valveMassFlow,meteredNozzle} from '../dist/js/pneumatic-feed.js';
import {nozzle} from '../dist/js/physics.js';

const atmosphere=101325,pressure=250e5+atmosphere,temperature=293.15;
const area=Math.PI*.012**2/4,params={valveKv:2.2,maxPressureMPa:pressure/1e6};
const close=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} vs ${expected}`);

test('manufacturer Kv correlation has correct standard-volume units and choked plateau',()=>{
  const rho=1.293;
  const expected=257*2.2*(pressure/1e5)/Math.sqrt(rho*temperature)*rho/3600;
  close(valveMassFlow(pressure,atmosphere,temperature,2.2,rho),expected,1e-12);
  close(valveMassFlow(pressure,pressure*.5,temperature,2.2,rho),expected,1e-12);
  close(valveMassFlow(pressure,pressure*.75,temperature,2.2,rho),expected*Math.sqrt(.75),1e-12);
  assert.equal(valveMassFlow(pressure,pressure,temperature,2.2,rho),0);
});

test('serial valve and nozzle agree on flow and cannot retain tank-pressure thrust',()=>{
  const result=meteredNozzle(pressure,temperature,area,atmosphere,params,nozzle);
  close(result.mdot,result.valveMassFlow,1e-9);
  assert.ok(result.nozzlePressure<pressure*.5);
  assert.ok(result.mdot<2.63&&result.mdot>2.60);
  assert.ok(result.force>1380&&result.force<1410);
  assert.ok(result.force<nozzle(pressure,temperature,area,atmosphere).force*.42);
  // Four reference outlets cannot support even the lightest ~1,000 kg car.
  assert.ok(result.force*4<1000*9.80665);
});

test('pressure matching also solves subcritical valves, low pressure and small throats',()=>{
  for(const inlet of [atmosphere*1.001,atmosphere*1.2,atmosphere*3,1e6,pressure]){
    for(const d of [.002,.006,.008,.012,.020]){
      const r=meteredNozzle(inlet,temperature,Math.PI*d*d/4,atmosphere,params,nozzle);
      assert.ok(Number.isFinite(r.force)&&r.force>=0);
      assert.ok(r.nozzlePressure>=atmosphere&&r.nozzlePressure<=inlet);
      close(r.mdot,r.valveMassFlow,Math.max(1e-7,r.mdot*1e-5));
      assert.ok(r.mdot<=valveMassFlow(inlet,atmosphere,temperature,params.valveKv)*(1+1e-5));
    }
  }
});

test('thrust grows with supply pressure and valve capacity, and stays finite as flow stops',()=>{
  let previous=0;
  for(const inlet of [atmosphere,2e5,1e6,5e6,15e6,pressure]){
    const r=meteredNozzle(inlet,temperature,area,atmosphere,params,nozzle);
    assert.ok(r.force>=previous);previous=r.force;
  }
  let last=0;
  for(const kv of [.1,.6,1.2,2.2,10,100]){
    const r=meteredNozzle(pressure,temperature,area,atmosphere,{...params,valveKv:kv},nozzle);
    assert.ok(r.force>=last);last=r.force;
    assert.ok(r.force<=nozzle(pressure,temperature,area,atmosphere).force);
  }
  assert.equal(meteredNozzle(pressure,temperature,area,atmosphere,{...params,valveKv:0},nozzle).force,0);
});

test('over-rated supply is rejected rather than silently transformed into regulated supply',()=>{
  const r=meteredNozzle(pressure*1.1,temperature,area,atmosphere,params,nozzle);
  assert.equal(r.regime,'pressure-limit');assert.equal(r.mdot,0);assert.equal(r.force,0);
  assert.equal(meteredNozzle(pressure,temperature,0,atmosphere,params,nozzle).force,0);
  assert.equal(meteredNozzle(pressure,temperature,area,atmosphere,{...params,nozzleDischargeCoefficient:0},nozzle).force,0);
  assert.equal(meteredNozzle(pressure,temperature,Infinity,atmosphere,params,nozzle).force,0);
});
