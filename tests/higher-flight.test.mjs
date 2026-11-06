import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsSim, ATMOSPHERE } from '../dist/js/physics.js';
import { FLIGHT_PROFILES, DEFAULT_FLIGHT_PROFILE, getGuidedInput, createGuidedRun, updateGuidedRun } from '../dist/js/flight-plan.js';

function fly(id, dt = .002, params = {}) {
  const sim = new PhysicsSim(params), run = createGuidedRun(id, sim.state.time);
  let peak = 0, minGas = sim.state.gas, minPressure = sim.state.pressure, maxBalanceError = 0;
  for (let i = 0; i < Math.round(8 / dt); ++i) {
    updateGuidedRun(run, sim);
    const input = run.ended ? { stabilize: true, fan: false, altHold: false } : getGuidedInput(sim.state.time - run.startTime, run.profile);
    sim.step(dt, input);
    const data = sim.telemetry();
    assert.ok([...sim.state.pos, ...sim.state.vel, sim.state.gas, sim.state.pressure].every(Number.isFinite));
    peak = Math.max(peak, data.altitude);
    minGas = Math.min(minGas, sim.state.gas);
    minPressure = Math.min(minPressure, sim.state.pressure);
    maxBalanceError = Math.max(maxBalanceError, Math.abs(data.massBalanceError));
  }
  return { sim, run, peak, minGas, minPressure, maxBalanceError };
}

for (const [id, impactLimit] of [['0.6', .55], ['2', .7], ['3', .85]]) {
  test(`${id} m shared guided trajectory lands with finite gas and bounded impact`, () => {
    const result = fly(id), p = FLIGHT_PROFILES[id];
    assert.ok(result.run.wasAirborne && result.run.landed);
    assert.equal(result.run.reason, 'landed');
    assert.ok(result.peak > .95 * p.height && result.peak < 1.08 * p.height);
    assert.ok(result.run.contactSpeed < impactLimit, `contact speed ${result.run.contactSpeed}`);
    assert.ok(result.minGas > 100 && result.sim.state.gas < result.sim.initialGas);
    assert.ok(result.minPressure > ATMOSPHERE);
    assert.ok(result.maxBalanceError < 1e-8);
    assert.ok(result.sim.contactCount === 4 && Math.abs(result.sim.state.vel.y) < .01);
  });
}

test('higher guided hop converges with smaller physics timesteps', () => {
  const a = fly(DEFAULT_FLIGHT_PROFILE, .002), b = fly(DEFAULT_FLIGHT_PROFILE, .001), c = fly(DEFAULT_FLIGHT_PROFILE, .0005);
  assert.ok(Math.abs(b.peak - c.peak) < Math.abs(a.peak - b.peak));
  assert.ok(Math.abs(b.peak - c.peak) < .015);
  assert.ok(Math.abs(b.run.contactSpeed - c.run.contactSpeed) < .04);
});

test('depleted tank cannot be hidden by the guided trajectory', () => {
  const {sim,run,peak,minGas} = fly('3', .002, {tankPressureMPa:1});
  assert.equal(run.reason, 'pressure');
  assert.ok(!run.wasAirborne && peak < .1);
  assert.equal(sim.state.gas, sim.initialGas);
  assert.ok(minGas > 0);
});
