import test from 'node:test';
import assert from 'node:assert/strict';
import { ELECTRIC_DRIVE_DEFAULTS as DEFAULTS, evaluateElectricDrive, accountDriveWork } from '../dist/js/electric-drive.js';

const capacity = DEFAULTS.batteryKWh * 3.6e6;
const evaluate = (input = {}, params = {}) => evaluateElectricDrive({
  wheelOmega: [20, 20, 20, 20], throttle: 0, brake: 0,
  batteryEnergyJ: capacity / 2, dt: .002, ...input,
}, params);
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('three rated motors drive one front differential and independent rear wheels', () => {
  const drive = evaluate({ wheelOmega: [8, 12, 20, 100], throttle: 1 });
  assert.deepEqual(drive.motors.map(m => m.id), ['front', 'rear-left', 'rear-right']);
  assert.deepEqual(drive.motors.map(m => m.wheelIndices), [[0, 1], [2], [3]]);
  near(drive.motors[0].shaftOmega, 10 * 9);
  near(drive.motors[0].rpm, 10 * 9 * 60 / (2 * Math.PI));
  near(drive.wheelDriveTorqueNm[0], 300 * 9 * .94 / 2);
  near(drive.wheelDriveTorqueNm[1], drive.wheelDriveTorqueNm[0]);
  near(drive.wheelDriveTorqueNm[2], 300 * 9 * .94);
  assert.ok(drive.motors[2].torqueNm < drive.motors[1].torqueNm);
});

test('torque and shaft power envelopes retain the configured aggregate ratings', () => {
  for (const omega of [0, 1, 20, 100, 180]) {
    const drive = evaluate({ wheelOmega: [omega, omega, omega, omega], throttle: 1 });
    assert.ok(drive.shaftPowerW <= 650000 + 1e-7);
    for (const motor of drive.motors) {
      assert.ok(motor.torqueNm <= 300 + 1e-9);
      assert.ok(motor.shaftPowerW <= 650000 / 3 + 1e-7);
      near(motor.shaftPowerW, motor.torqueNm * motor.shaftOmega);
    }
  }
  assert.ok(evaluate({ wheelOmega: [100, 100, 100, 100], throttle: 1 }).shaftPowerW > 640000);
});

test('motor RPM cutoff prevents powered overspeed but permits braking', () => {
  const omega = DEFAULTS.maxMotorRPM * 2 * Math.PI / 60 / DEFAULTS.gearRatio * 1.01;
  const input = { wheelOmega: [omega, omega, omega, omega] };
  assert.ok(evaluate({ ...input, throttle: 1 }).wheelTorqueNm.every(t => t === 0));
  assert.ok(evaluate({ ...input, brake: 1 }).wheelRegenTorqueNm.every(t => t < 0));
});

test('coasting has no drive torque, hidden regen, or electrical draw', () => {
  for (const omega of [-50, 0, 50]) {
    const drive = evaluate({ wheelOmega: [omega, omega, omega, omega] });
    assert.deepEqual(drive.wheelTorqueNm, [0, 0, 0, 0]);
    assert.equal(drive.electricalPowerW, 0);
    assert.equal(drive.lossesW, 0);
  }
});

test('reverse propulsion consumes energy; opposing throttle brakes into heat without charging', () => {
  const reverse = evaluate({ wheelOmega: [-20, -20, -20, -20], throttle: -1 });
  assert.ok(reverse.wheelDriveTorqueNm.every(t => t < 0));
  assert.ok(reverse.electricalPowerW > 0);
  const plug = evaluate({ throttle: -1 });
  assert.ok(plug.wheelDriveTorqueNm.every(t => t < 0));
  assert.deepEqual(plug.wheelRegenTorqueNm, [0, 0, 0, 0]);
  assert.equal(plug.electricalPowerW, 0);
  assert.equal(plug.batteryEnergyDeltaJ, 0);
  near(plug.lossesW, -plug.wheelPowerW);
});

test('brake request overrides throttle and enables only dissipative regen torque', () => {
  for (const sign of [-1, 1]) {
    const drive = evaluate({ wheelOmega: [20, 20, 20, 20].map(v => v * sign), throttle: sign, brake: 1 });
    assert.deepEqual(drive.wheelDriveTorqueNm, [0, 0, 0, 0]);
    assert.ok(drive.wheelRegenTorqueNm.every(t => t * sign < 0));
    assert.ok(drive.electricalPowerW < 0);
    assert.ok(drive.lossesW > 0);
    assert.ok(-drive.shaftPowerW <= DEFAULTS.regenPowerKW * 1000 + 1e-7);
  }
});

test('full battery disables regen while finite charge headroom limits recovered energy', () => {
  const full = evaluate({ brake: 1, batteryEnergyJ: capacity });
  assert.deepEqual(full.wheelRegenTorqueNm, [0, 0, 0, 0]);
  const almostFull = evaluate({ brake: 1, batteryEnergyJ: capacity - 10, dt: .1 });
  assert.ok(almostFull.batteryEnergyDeltaJ <= 10 && almostFull.batteryEnergyDeltaJ > 9.9);
  assert.ok(almostFull.batteryEnergyJ <= capacity);
  const capped = evaluate({ brake: 1 }, { batteryMaxChargeKW: 5 });
  assert.ok(capped.electricalPowerW >= -5000 && capped.electricalPowerW < -4990);
});

test('battery and inverter draw limits scale all powered motors without exceeding available energy', () => {
  const almostEmpty = evaluate({ throttle: 1, batteryEnergyJ: 10, dt: .1 });
  assert.ok(almostEmpty.electricalPowerW <= 100 && almostEmpty.electricalPowerW > 90);
  assert.ok(almostEmpty.batteryEnergyJ >= 0);
  const inverter = evaluate({ throttle: 1 }, { inverterMaxInputKW: 20, batteryMaxDischargeKW: 30 });
  assert.ok(inverter.electricalPowerW <= 20000 && inverter.electricalPowerW > 19500);
  const battery = evaluate({ throttle: 1 }, { inverterMaxInputKW: 30, batteryMaxDischargeKW: 20 });
  assert.ok(battery.electricalPowerW <= 20000 && battery.electricalPowerW > 19500);
});

test('empty battery cannot deliver launch or rolling propulsion, but can accept brake regen', () => {
  for (const omega of [0, 20]) assert.ok(evaluate({
    wheelOmega: [omega, omega, omega, omega], throttle: 1, batteryEnergyJ: 0,
  }).wheelDriveTorqueNm.every(t => t === 0));
  assert.ok(evaluate({ brake: 1, batteryEnergyJ: 0 }).electricalPowerW < 0);
});

test('regen alone cannot reverse a wheel in a discrete step and is disabled for counter-rotating front wheels', () => {
  const speeds = [1, 1, .7, 1.5], dt = .1;
  const drive = evaluate({ wheelOmega: speeds, brake: 1, dt });
  drive.wheelRegenTorqueNm.forEach((torque, i) => assert.ok(speeds[i] + torque / DEFAULTS.wheelInertia * dt >= -1e-12));
  const mixed = evaluate({ wheelOmega: [10, -10, 10, 10], brake: 1 });
  assert.equal(mixed.wheelRegenTorqueNm[0], 0);
  assert.equal(mixed.wheelRegenTorqueNm[1], 0);
  assert.ok(mixed.wheelRegenTorqueNm[2] < 0);
});

test('instantaneous electrical, wheel and loss powers balance in every drive direction', () => {
  for (const input of [{ throttle: 1 }, { throttle: -1 }, { brake: 1 },
    { throttle: 1, wheelOmega: [-10, 30, -20, 40] }, { throttle: -1, wheelOmega: [-20, -20, -20, -20] }]) {
    const drive = evaluate(input);
    near(drive.electricalPowerW, drive.wheelPowerW + drive.lossesW);
    assert.ok(drive.lossesW >= -1e-9);
    near(drive.electricalPowerW, drive.motors.reduce((sum, m) => sum + m.electricalPowerW, 0));
  }
});

test('midpoint work accounting includes launch acceleration and all named losses', () => {
  const oldOmega = [0, 0, 0, 0], newOmega = [1, 1, 2, 2], dt = .002;
  const drive = evaluate({ wheelOmega: oldOmega, throttle: 1, dt });
  assert.equal(drive.electricalPowerW, 0);
  const work = accountDriveWork(drive, oldOmega, newOmega, dt);
  const expected = drive.wheelTorqueNm.reduce((sum, torque, i) => sum + torque * newOmega[i] * .5 * dt, 0);
  near(work.wheelWorkJ, expected);
  assert.ok(work.electricalEnergyJ > work.wheelWorkJ);
  near(work.electricalEnergyJ, work.wheelWorkJ + work.lossEnergyJ);
  near(work.lossEnergyJ, work.gearLossJ + work.motorLossJ + work.inverterLossJ + work.brakingHeatJ);
});

test('front differential work is combined before electrical conversion, not counted as two motors', () => {
  const speeds = [20, -20, 0, 0], drive = evaluate({ wheelOmega: speeds, throttle: 1 });
  const work = accountDriveWork(drive, speeds, speeds, .002);
  assert.equal(work.perMotor[0].wheelWorkJ, 0);
  assert.equal(work.perMotor[0].electricalEnergyJ, 0);
});

test('midpoint brake work charges only with a brake request and reports plug heat explicitly', () => {
  const oldOmega = [20, 20, 20, 20], nextOmega = [19, 19, 19, 19];
  const regen = accountDriveWork(evaluate({ brake: 1 }), oldOmega, nextOmega, .002);
  assert.ok(regen.electricalEnergyJ < 0);
  near(regen.electricalEnergyJ, regen.wheelWorkJ + regen.lossEnergyJ);
  const plug = accountDriveWork(evaluate({ throttle: -1 }), oldOmega, nextOmega, .002);
  assert.equal(plug.electricalEnergyJ, 0);
  assert.ok(plug.brakingHeatJ > 0);
  near(plug.lossEnergyJ, -plug.wheelWorkJ);
});

test('evaluation does not mutate inputs and rejects invalid angular-velocity or time contracts', () => {
  const input = { wheelOmega: [20, 20, 20, 20], throttle: 1, dt: .002, soc: .5 };
  const original = structuredClone(input), params = { gearRatio: 8 };
  evaluateElectricDrive(input, params);
  assert.deepEqual(input, original);
  assert.deepEqual(params, { gearRatio: 8 });
  assert.throws(() => evaluateElectricDrive({ wheelOmega: [0, 0, 0] }), /four finite/);
  assert.throws(() => evaluateElectricDrive({ wheelOmega: [0, NaN, 0, 0] }), /four finite/);
  assert.throws(() => evaluateElectricDrive({ wheelOmega: [0, 0, 0, 0], dt: 0 }), /positive/);
});

test('one joule at rest bounds actual free-wheel launch work instead of clipping battery after free acceleration', () => {
  const speeds = [0, 0, 0, 0], dt = .002;
  const drive = evaluate({ wheelOmega: speeds, throttle: 1, batteryEnergyJ: 1, dt });
  const next = speeds.map((omega, i) => omega + drive.wheelTorqueNm[i] / DEFAULTS.wheelInertia * dt);
  const work = accountDriveWork(drive, speeds, next, dt);
  assert.ok(work.electricalEnergyJ <= 1 + 1e-10);
  assert.ok(work.electricalEnergyJ > .99);
  near(work.electricalEnergyJ, work.wheelWorkJ + work.lossEnergyJ);
  assert.ok(drive.limits.driveEnergyBoundJ <= 1 + 1e-10);
});

test('opposite throttle cannot overshoot tiny positive rotor speed into powered reverse', () => {
  const speeds = [.001, .001, .001, .001], dt = .002;
  const drive = evaluate({ wheelOmega: speeds, throttle: -1, dt });
  const next = speeds.map((omega, i) => omega +
    (drive.wheelTorqueNm[i] - DEFAULTS.wheelViscousDrag * omega) / DEFAULTS.wheelInertia * dt);
  assert.ok(next.every(omega => omega >= -1e-12));
  const work = accountDriveWork(drive, speeds, next, dt);
  assert.equal(work.electricalEnergyJ, 0);
  assert.ok(work.wheelWorkJ < 0);
  const empty = evaluate({ wheelOmega: speeds, throttle: -1, batteryEnergyJ: 0, dt });
  assert.ok(empty.wheelTorqueNm.every(torque => torque === 0));
});

test('road-target bound budgets midpoint work even when implicit wheel endpoints overshoot that target', () => {
  const speeds = [1, 1, 1, 1], roadBound = [80, 80, 80, 80], dt = .002;
  const drive = evaluate({ wheelOmega: speeds, wheelOmegaBound: roadBound, throttle: 1, batteryEnergyJ: 1, dt });
  // Endpoints approach 2*road-old: midpoint, not endpoint, is road-bounded.
  const next = speeds.map((omega, i) => 2 * roadBound[i] - omega);
  const work = accountDriveWork(drive, speeds, next, dt);
  assert.ok(work.electricalEnergyJ <= 1 + 1e-10);
  assert.ok(drive.limits.driveEnergyBoundJ <= 1 + 1e-10);
  near(work.electricalEnergyJ, work.wheelWorkJ + work.lossEnergyJ);
});

test('road-driven regen cannot exceed remaining charge headroom', () => {
  const speeds = [1, 1, 1, 1], dt = .002;
  const drive = evaluate({ wheelOmega: speeds, wheelOmegaBound: [80, 80, 80, 80], brake: 1,
    batteryEnergyJ: capacity - 1, dt });
  const work = accountDriveWork(drive, speeds, [159, 159, 159, 159], dt);
  assert.ok(-work.electricalEnergyJ <= 1 + 1e-10);
  assert.ok(-work.electricalEnergyJ > .99);
  assert.ok(drive.limits.chargeEnergyBoundJ <= 1 + 1e-10);
});

test('zero inverter or battery discharge power also disables torque at rest', () => {
  for (const params of [{ inverterMaxInputKW: 0 }, { batteryMaxDischargeKW: 0 }])
    assert.ok(evaluate({ wheelOmega: [0, 0, 0, 0], throttle: 1 }, params).wheelTorqueNm.every(torque => torque === 0));
});

test('road acceleration cannot push actual midpoint regeneration past the motor shaft rating', () => {
  const speeds = [20, 20, 20, 20], dt = .002;
  const drive = evaluate({ wheelOmega: speeds, wheelOmegaBound: [100, 100, 100, 100], brake: 1, dt });
  const work = accountDriveWork(drive, speeds, [180, 180, 180, 180], dt);
  assert.ok(-work.shaftWorkJ / dt <= DEFAULTS.regenPowerKW * 1000 + 1e-7);
  for (const motor of work.perMotor)
    assert.ok(-motor.shaftWorkJ / dt <= DEFAULTS.regenPowerKW * 1000 / 3 + 1e-7);
});
