import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim, nozzle} from '../dist/js/physics.js';

test('one valve opening and closure integrate the analytical exponential impulse and expelled mass', () => {
  const sim = new PhysicsSim({valveTau:.001, gravity:0, aeroEnabled:false, contactEnabled:false, feedLossCoefficient:0});
  const duration = .002;
  for (const command of [1,0]) {
    const valve = sim.thrusters[0], previousOpening = valve.opening, previousGas = sim.state.gas;
    const full = nozzle(sim.state.pressure, sim.state.temp, valve.area);
    const openSeconds = command * duration
      + (previousOpening - command) * sim.params.valveTau * (1 - Math.exp(-duration/sim.params.valveTau));
    sim.step(duration, {stabilize:false, thrusterCommands:[command]});
    assert.ok(Math.abs(valve.force * duration - full.force * openSeconds) < 1e-9);
    assert.ok(Math.abs(previousGas - sim.state.gas - full.mdot * openSeconds) < 1e-10);
  }
});
