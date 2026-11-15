import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';

const rotationEnergy = sim => .5 * sim.state.omega.clone().multiply(sim.inertia).dot(sim.state.omega);
const worldAngularMomentum = sim => sim.state.omega.clone().multiply(sim.inertia).applyQuaternion(sim.state.q);

for (const initialOmega of [[2, 3, 4], [10, 5, 2]]) {
  for (const dt of [.002, .001]) {
    test(`unforced asymmetric rigid body conserves energy and world angular momentum for omega=${initialOmega} dt=${dt}`, () => {
      const sim = new PhysicsSim({gravity: 0, contactEnabled: false, aeroEnabled: false});
      sim.state.pos.y = 100;
      sim.state.omega.fromArray(initialOmega);
      const initialEnergy = rotationEnergy(sim);
      const initialMomentum = worldAngularMomentum(sim);
      const initialGas = sim.state.gas;
      let maximumEnergyError = 0;
      let maximumMomentumError = 0;
      for (let step = 0; step < Math.round(5 / dt); step++) {
        sim.step(dt, {stabilize: false});
        maximumEnergyError = Math.max(maximumEnergyError, Math.abs(rotationEnergy(sim) / initialEnergy - 1));
        maximumMomentumError = Math.max(maximumMomentumError, worldAngularMomentum(sim).distanceTo(initialMomentum) / initialMomentum.length());
        assert.ok([...sim.state.omega, ...sim.state.q].every(Number.isFinite));
      }
      assert.ok(maximumEnergyError < 1e-8, `relative energy error ${maximumEnergyError}`);
      assert.ok(maximumMomentumError < 1e-8, `relative world angular momentum error ${maximumMomentumError}`);
      assert.ok(Math.abs(sim.state.q.lengthSq() - 1) < 1e-12);
      assert.equal(sim.state.gas, initialGas, 'free rotation must not consume propellant');
      assert.equal(sim.totalThrust, 0);
    });
  }
}

test('actual off-centre nozzle work accounts for the rotational energy change at every step', () => {
  const sim = new PhysicsSim({gravity: 0, contactEnabled: false, aeroEnabled: false});
  sim.state.pos.y = 100;
  sim.state.omega.set(2, 3, 4);
  const dt = .002;
  let largestResidual = 0;
  let totalTorqueWork = 0;
  const initialEnergy = rotationEnergy(sim);
  for (let step = 0; step < 250; step++) {
    const before = sim.state.omega.clone();
    const previousEnergy = rotationEnergy(sim);
    sim.step(dt, {stabilize: false, thrusterCommands: [.2, 0, 0, 0]});
    const midpointOmega = before.add(sim.state.omega).multiplyScalar(.5);
    const work = dt * sim.lastTorque.dot(midpointOmega);
    const change = rotationEnergy(sim) - previousEnergy;
    largestResidual = Math.max(largestResidual, Math.abs(change - work));
    totalTorqueWork += work;
  }
  assert.ok(sim.state.gas < sim.initialGas, 'the physical nozzle must have discharged');
  assert.ok(sim.totalThrust > 0);
  assert.ok(Math.abs(totalTorqueWork) > 1, 'the scenario must include nonzero torque work');
  assert.ok(largestResidual < 1e-5, `unaccounted per-step rotational energy ${largestResidual} J`);
  assert.ok(Math.abs(rotationEnergy(sim) - initialEnergy - totalTorqueWork) < 1e-4);
});
