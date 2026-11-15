import test from 'node:test';
import assert from 'node:assert/strict';
import {nozzle,ATMOSPHERE,PhysicsSim} from '../dist/js/physics.js';

const finiteNozzle = value => {
  for (const key of ['mdot','force','ve','pe','effectiveVelocity']) {
    assert.ok(Number.isFinite(value[key]), `${key} must remain finite at the check-valve boundary`);
    assert.ok(value[key] >= 0, `${key} cannot become negative at the check-valve boundary`);
  }
};

test('near-ambient pressure cannot turn a zero-flow nozzle into a NaN exhaust velocity', () => {
  // This representable pressure difference is small enough that the expansion
  // temperature rounds to the inlet temperature, leaving both force and flow 0.
  for (const offset of [-1,0,1e-11,1e-8,1e-5,.001,1]) {
    const result = nozzle(ATMOSPHERE + offset,300,.0005);
    finiteNozzle(result);
    if (result.mdot === 0) assert.equal(result.effectiveVelocity,0);
    else assert.ok(Math.abs(result.effectiveVelocity*result.mdot-result.force)<1e-9);
  }
});

test('convergent-nozzle flow and thrust are continuous across the choking transition', () => {
  const gamma=1.4,criticalRatio=(2/(gamma+1))**(gamma/(gamma-1));
  const threshold=ATMOSPHERE/criticalRatio;
  const below=nozzle(threshold*(1-1e-7),300,.0005);
  const above=nozzle(threshold*(1+1e-7),300,.0005);
  finiteNozzle(below);finiteNozzle(above);
  assert.equal(below.regime,'subsonic');assert.equal(above.regime,'choked');
  for(const key of ['mdot','force','ve','effectiveVelocity']) {
    assert.ok(Math.abs(above[key]/below[key]-1)<1e-5, `${key} must not jump at choking`);
  }
});

test('a tank at ambient pressure cannot consume its residual gas or accelerate a free vehicle', () => {
  const sim=new PhysicsSim({contactEnabled:false,aeroEnabled:false,gravity:0});
  const state=sim.state;
  state.pressure=ATMOSPHERE;
  state.temp=300;
  state.gas=ATMOSPHERE*sim.params.tankVolume/(287*state.temp);
  const gas=state.gas,used=state.gasUsed;
  for(let i=0;i<100;i++) sim.step(.002,{boost:true,stabilize:false});
  assert.equal(state.gas,gas);assert.equal(state.gasUsed,used);
  assert.equal(sim.massFlowKgS,0);assert.equal(sim.totalThrust,0);
  assert.equal(state.vel.length(),0);
  for(const thruster of sim.thrusters) {
    assert.equal(thruster.mdot,0);assert.equal(thruster.force,0);
  }
});
