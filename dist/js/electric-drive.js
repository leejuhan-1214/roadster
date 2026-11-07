// Educational three-motor drivetrain; these are explicit model assumptions,
// not Tesla calibration, proprietary controls, or measured motor maps.
// Wheel order: front-left, front-right, rear-left, rear-right. SI units except
// named kW/kWh/RPM settings. Positive battery power means discharge.
export const ELECTRIC_DRIVE_DEFAULTS = Object.freeze({
  motorPowerKW: 650, motorTorqueNm: 900, gearRatio: 9, driveEfficiency: .94,
  motorEfficiency: .95, inverterEfficiency: .97, maxMotorRPM: 20000,
  batteryKWh: 200, batteryMaxDischargeKW: 800, batteryMaxChargeKW: 160,
  inverterMaxInputKW: 750, regenPowerKW: 150, regenTorqueNm: 540,
  regenFadeSpeed: 2, wheelRadius: .36, wheelInertia: 2.6, wheelViscousDrag: .025,
});

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const MOTOR_LAYOUT = [
  { id: 'front', label: 'Front motor', wheelIndices: [0, 1] },
  { id: 'rear-left', label: 'Rear-left motor', wheelIndices: [2] },
  { id: 'rear-right', label: 'Rear-right motor', wheelIndices: [3] },
];

function wheelSpeeds(values) {
  if (!Array.isArray(values) || values.length !== 4 || !values.every(Number.isFinite))
    throw new TypeError('wheelOmega must contain four finite angular velocities in rad/s.');
  return values;
}

function positiveStep(dt) {
  if (!Number.isFinite(dt) || dt <= 0) throw new TypeError('dt must be positive seconds.');
  return dt;
}

function settings(parameters) {
  const p = { ...ELECTRIC_DRIVE_DEFAULTS, ...parameters };
  for (const key of Object.keys(ELECTRIC_DRIVE_DEFAULTS))
    p[key] = finite(p[key], ELECTRIC_DRIVE_DEFAULTS[key]);
  for (const key of ['motorPowerKW', 'motorTorqueNm', 'batteryMaxDischargeKW',
    'batteryMaxChargeKW', 'inverterMaxInputKW', 'regenPowerKW', 'regenTorqueNm', 'wheelViscousDrag'])
    p[key] = Math.max(0, p[key]);
  for (const key of ['gearRatio', 'batteryKWh', 'maxMotorRPM', 'wheelRadius', 'wheelInertia'])
    p[key] = Math.max(.001, p[key]);
  for (const key of ['driveEfficiency', 'motorEfficiency', 'inverterEfficiency'])
    p[key] = clamp(p[key], .01, 1);
  p.regenFadeSpeed = Math.max(.001, p.regenFadeSpeed);
  return p;
}

function efficiencies(p) {
  return { gear: p.driveEfficiency, motor: p.motorEfficiency,
    inverter: p.inverterEfficiency,
    total: p.driveEfficiency * p.motorEfficiency * p.inverterEfficiency };
}

function wheelTorqueFor(motor, p, eta) {
  return motor.torqueNm * p.gearRatio *
    (motor.torqueNm * motor.shaftOmega >= 0 ? eta.gear : 1 / eta.gear) / motor.wheelIndices.length;
}

// Upper bound on signed midpoint work for this fixed torque. The tire solver
// must be passive about its CURRENT road target, using midpoint wheel speed.
// wheelOmegaBound bounds that road target, NOT the next wheel speed: an implicit
// endpoint can overshoot the target while its midpoint remains bounded.
function wheelWorkBound(motor, omega, groundOmega, omegaBound, dt, p, eta) {
  const torque = wheelTorqueFor(motor, p, eta), magnitude = Math.abs(torque), direction = Math.sign(torque);
  let a = 0, b = 0, regenMagnitude = 0;
  for (const index of motor.wheelIndices) {
    let signedBase = direction * omega[index], absoluteBase = Math.abs(omega[index]);
    if (groundOmega) {
      signedBase = Math.max(signedBase, direction * groundOmega[index]);
      absoluteBase = Math.max(absoluteBase, Math.abs(groundOmega[index]));
    }
    if (omegaBound) {
      signedBase = Math.max(signedBase, omegaBound[index]);
      absoluteBase = Math.max(absoluteBase, omegaBound[index]);
    }
    const dragChange = p.wheelViscousDrag * Math.abs(omega[index]) * dt / (2 * p.wheelInertia);
    // With torque scaled by x, positive wheel work is at most max(0,a*x*x+b*x).
    a += magnitude * magnitude * dt * dt / (2 * p.wheelInertia);
    b += magnitude * (signedBase + dragChange) * dt;
    regenMagnitude += magnitude * (absoluteBase + dragChange) * dt;
  }
  return { a, b, regenMagnitude };
}

function workScale(a, b, budget) {
  if (Math.max(0, a + b) <= budget) return 1;
  if (a <= 0) return b > 0 ? clamp(budget / b, 0, 1) : 1;
  const discriminant = Math.sqrt(b * b + 4 * a * budget);
  const root = b > 0 ? 2 * budget / (b + discriminant) : (-b + discriminant) / (2 * a);
  return clamp(root, 0, 1);
}

/** Integrate the motor torques actually applied to the wheels. Midpoint wheel
 * speeds include acceleration during this step, so launch work is not lost.
 * The front differential is accounted as ONE shaft: its two wheel works sum.
 * Negative throttle work without a brake request is dissipative plug braking;
 * it never charges the battery. Zero-throttle coasting requests no motor torque.
 * This function does not clamp energy: callers must enforce battery limits and
 * can inspect the unmodified work balance instead of silently discarding energy.
 */
export function accountDriveWork(driveResult, oldWheelOmega, newWheelOmega, dt, parameters = {}) {
  wheelSpeeds(oldWheelOmega); wheelSpeeds(newWheelOmega); positiveStep(dt);
  const eta = driveResult.efficiencies || efficiencies(settings(parameters));
  const perMotor = driveResult.motors.map(motor => {
    let wheelWorkJ = 0;
    for (const index of motor.wheelIndices)
      wheelWorkJ += driveResult.wheelTorqueNm[index] * (oldWheelOmega[index] + newWheelOmega[index]) * .5 * dt;
    const shaftWorkJ = wheelWorkJ >= 0 ? wheelWorkJ / eta.gear : wheelWorkJ * eta.gear;
    let electricalEnergyJ = 0, motorLossJ = 0, inverterLossJ = 0, brakingHeatJ = 0;
    if (shaftWorkJ >= 0) {
      const inverterOutputJ = shaftWorkJ / eta.motor;
      electricalEnergyJ = inverterOutputJ / eta.inverter;
      motorLossJ = inverterOutputJ - shaftWorkJ;
      inverterLossJ = electricalEnergyJ - inverterOutputJ;
    } else if (motor.mode === 'regen') {
      const inverterInputJ = shaftWorkJ * eta.motor;
      electricalEnergyJ = inverterInputJ * eta.inverter;
      motorLossJ = inverterInputJ - shaftWorkJ;
      inverterLossJ = electricalEnergyJ - inverterInputJ;
    } else {
      brakingHeatJ = -shaftWorkJ;
    }
    const gearLossJ = shaftWorkJ - wheelWorkJ;
    return { id: motor.id, wheelWorkJ, shaftWorkJ, electricalEnergyJ,
      gearLossJ, motorLossJ, inverterLossJ, brakingHeatJ,
      lossEnergyJ: electricalEnergyJ - wheelWorkJ };
  });
  const total = { electricalEnergyJ: 0, wheelWorkJ: 0, shaftWorkJ: 0,
    lossEnergyJ: 0, gearLossJ: 0, motorLossJ: 0, inverterLossJ: 0, brakingHeatJ: 0 };
  for (const motor of perMotor) for (const key of Object.keys(total)) total[key] += motor[key];
  return { ...total, batteryEnergyDeltaJ: total.electricalEnergyJ === 0 ? 0 : -total.electricalEnergyJ, perMotor };
}

/** Pure instantaneous torque evaluation. Input wheelOmega can be current or
 * midpoint speeds. Optional wheelGroundOmega is the signed per-wheel road target
 * ux/r. Optional nonnegative wheelOmegaBound bounds its magnitude; e.g. current
 * contact-point velocity.length()/r. Without either, the work bound covers free
 * wheel motion only. It includes motor-driven midpoint acceleration and passive
 * viscous drag, and is conservative for the midpoint tire solver described above.
 * Use accountDriveWork() after integrating wheel motion for
 * actual step energy. The equal 1/3 motor ratings, RPM limit, brake-only regen,
 * efficiencies and battery limits are educational assumptions, not OEM control.
 * The front motor drives an ideal open differential; the rear motors are
 * independent. Tire traction, friction brakes and chassis dynamics are external.
 */
export function evaluateElectricDrive(input, parameters = {}) {
  const omega = wheelSpeeds(input.wheelOmega), dt = positiveStep(input.dt ?? .002);
  const groundOmega = input.wheelGroundOmega == null ? null : wheelSpeeds(input.wheelGroundOmega);
  const omegaBound = input.wheelOmegaBound == null ? null : wheelSpeeds(input.wheelOmegaBound);
  if (omegaBound?.some(value => value < 0)) throw new TypeError('wheelOmegaBound must be nonnegative rad/s.');
  const p = settings(parameters), eta = efficiencies(p);
  const capacityJ = p.batteryKWh * 3.6e6;
  const batteryEnergyJ = clamp(finite(input.batteryEnergyJ,
    capacityJ * clamp(finite(input.soc, 1), 0, 1)), 0, capacityJ);
  const throttle = clamp(finite(input.throttle, 0), -1, 1);
  const brake = clamp(finite(input.brake, 0), 0, 1);
  const motors = MOTOR_LAYOUT.map(layout => {
    const wheelIndices = [...layout.wheelIndices];
    const axleOmega = wheelIndices.reduce((sum, index) => sum + omega[index], 0) / wheelIndices.length;
    const shaftOmega = axleOmega * p.gearRatio;
    const signedRpm = shaftOmega * 60 / (2 * Math.PI), rpm = Math.abs(signedRpm);
    let torqueNm = 0, mode = 'off';
    if (brake > 0 && Math.abs(shaftOmega) > 1e-10) {
      // Do not use a single front-motor regen torque when one front wheel is
      // stationary or turning against the other; friction brakes can stop each.
      const sameDirection = wheelIndices.every(index => omega[index] * axleOmega > 0);
      if (sameDirection) {
        const fade = clamp(Math.abs(axleOmega) * p.wheelRadius / p.regenFadeSpeed, 0, 1);
        const torqueLimit = Math.min(p.regenTorqueNm / 3, p.motorTorqueNm / 3,
          Math.min(p.regenPowerKW, p.motorPowerKW) * 1000 / 3 / Math.abs(shaftOmega));
        // Prevent this regen torque alone from reversing any wheel in one step.
        const wheelStopLimit = Math.min(...wheelIndices.map(index => Math.max(0, (p.wheelInertia / dt - p.wheelViscousDrag) * Math.abs(omega[index]))));
        const shaftStopLimit = wheelStopLimit * wheelIndices.length * eta.gear / p.gearRatio;
        torqueNm = -Math.sign(shaftOmega) * Math.min(brake * fade * torqueLimit, shaftStopLimit);
        mode = 'regen';
      }
    } else if (brake === 0 && throttle !== 0) {
      // Near rest, allow an energy-budgeted powered direction change. A stop-only
      // impulse would otherwise trap a wheel in tiny terrain-induced counter-rotation.
      const motoring = throttle * shaftOmega >= 0 || Math.abs(axleOmega)*p.wheelRadius < .1;
      const rpmFade = motoring ? clamp((p.maxMotorRPM - rpm) / (p.maxMotorRPM * .05), 0, 1) : 1;
      const torqueLimit = Math.min(p.motorTorqueNm / 3,
        p.motorPowerKW * 1000 / 3 / Math.max(Math.abs(shaftOmega), 1e-9));
      torqueNm = throttle * torqueLimit * rpmFade;
      if (!motoring) {
        // Opposite-direction throttle stops the rotor first; reverse propulsion
        // starts on a later powered step. Never create free reverse kinetic energy.
        const sameDirection = wheelIndices.every(index => omega[index] * axleOmega > 0);
        const wheelStopLimit = sameDirection ? Math.min(...wheelIndices.map(index =>
          Math.max(0, (p.wheelInertia / dt - p.wheelViscousDrag) * Math.abs(omega[index])))) : 0;
        torqueNm = Math.sign(torqueNm) * Math.min(Math.abs(torqueNm), wheelStopLimit * wheelIndices.length * eta.gear / p.gearRatio);
      }
      if (batteryEnergyJ === 0) torqueNm = 0;
      mode = motoring ? 'drive' : 'plug';
    }
    if (torqueNm === 0) mode = 'off';
    return { ...layout, wheelIndices, axleOmega, shaftOmega, rpm, signedRpm, torqueNm, mode };
  });

  // Gross positive DC draw and recovered DC power are limited independently.
  // Opposite-direction throttle absorbs energy as heat, never as battery charge.
  const requestedDrawW = motors.reduce((sum, m) => sum + Math.max(0, m.torqueNm * m.shaftOmega) / (eta.motor * eta.inverter), 0);
  const requestedChargeW = motors.reduce((sum, m) => sum + (m.mode === 'regen' ? Math.max(0, -m.torqueNm * m.shaftOmega) * eta.motor * eta.inverter : 0), 0);
  const drawLimitW = Math.min(p.batteryMaxDischargeKW * 1000, p.inverterMaxInputKW * 1000, batteryEnergyJ / dt);
  const chargeLimitW = Math.min(p.batteryMaxChargeKW * 1000, (capacityJ - batteryEnergyJ) / dt);
  const drawScale = drawLimitW <= 0 ? 0 : requestedDrawW > 0 ? Math.min(1, drawLimitW / requestedDrawW) : 1;
  const chargeScale = requestedChargeW > 0 ? Math.min(1, chargeLimitW / requestedChargeW) : 1;
  for (const motor of motors) {
    if (motor.mode === 'drive') motor.torqueNm *= drawScale;
    else if (motor.mode === 'regen') motor.torqueNm *= chargeScale;
    if (motor.mode !== 'regen') {
      const bound = wheelWorkBound(motor, omega, groundOmega, omegaBound, dt, p, eta);
      motor.torqueNm *= workScale(bound.a, bound.b, p.motorPowerKW * 1000 / 3 * dt * eta.gear);
    } else {
      const bound = wheelWorkBound(motor, omega, groundOmega, omegaBound, dt, p, eta);
      const shaftWorkLimit = Math.min(p.regenPowerKW, p.motorPowerKW) * 1000 / 3 * dt;
      if (bound.regenMagnitude > 0)
        motor.torqueNm *= Math.min(1, shaftWorkLimit / (bound.regenMagnitude * eta.gear));
    }
  }
  const bounds = motors.map(motor => wheelWorkBound(motor, omega, groundOmega, omegaBound, dt, p, eta));
  const energyUpper = scale => bounds.reduce((sum, bound, index) => sum +
    (motors[index].mode === 'regen' ? 0 : Math.max(0, bound.a * scale * scale + bound.b * scale) / eta.total), 0);
  let energyScale = 1;
  const driveBudgetJ = drawLimitW * dt;
  if (energyUpper(1) > driveBudgetJ) {
    let lo = 0, hi = 1;
    for (let iteration = 0; iteration < 40; iteration++) {
      const mid = (lo + hi) * .5;
      if (energyUpper(mid) <= driveBudgetJ) lo = mid; else hi = mid;
    }
    energyScale = lo;
  }
  const chargeEnergyUpperJ = bounds.reduce((sum, bound, index) => sum +
    (motors[index].mode === 'regen' ? bound.regenMagnitude * eta.total : 0), 0);
  const chargeEnergyScale = chargeEnergyUpperJ > 0 ? Math.min(1, chargeLimitW * dt / chargeEnergyUpperJ) : 1;
  const wheelDriveTorqueNm = [0, 0, 0, 0], wheelRegenTorqueNm = [0, 0, 0, 0];
  for (const motor of motors) {
    motor.torqueNm *= motor.mode === 'regen' ? chargeEnergyScale : energyScale;
    if (motor.torqueNm === 0) motor.mode = 'off';
    const wheelTorque = wheelTorqueFor(motor, p, eta);
    for (const index of motor.wheelIndices)
      (motor.mode === 'regen' ? wheelRegenTorqueNm : wheelDriveTorqueNm)[index] = wheelTorque;
  }
  const wheelTorqueNm = wheelDriveTorqueNm.map((torque, index) => torque + wheelRegenTorqueNm[index]);
  const result = { wheelDriveTorqueNm, wheelRegenTorqueNm, wheelTorqueNm, motors,
    efficiencies: eta, capacityJ, initialBatteryEnergyJ: batteryEnergyJ };
  const work = accountDriveWork(result, omega, omega, dt);
  for (let i = 0; i < motors.length; i++) {
    const energy = work.perMotor[i], motor = motors[i];
    motor.shaftPowerW = energy.shaftWorkJ / dt;
    motor.powerW = motor.shaftPowerW;
    motor.wheelPowerW = energy.wheelWorkJ / dt;
    motor.electricalPowerW = energy.electricalEnergyJ / dt;
    motor.lossesW = energy.lossEnergyJ / dt;
  }
  return { ...result, shaftRPM: motors.map(m => m.rpm),
    shaftPowerW: work.shaftWorkJ / dt, wheelPowerW: work.wheelWorkJ / dt,
    electricalPowerW: work.electricalEnergyJ / dt, lossesW: work.lossEnergyJ / dt,
    batteryEnergyDeltaJ: work.batteryEnergyDeltaJ,
    batteryEnergyJ: clamp(batteryEnergyJ + work.batteryEnergyDeltaJ, 0, capacityJ),
    limits: { drawLimitW, chargeLimitW, drawScale, chargeScale, energyScale, chargeEnergyScale,
      driveEnergyBoundJ: energyUpper(energyScale), chargeEnergyBoundJ: chargeEnergyUpperJ * chargeEnergyScale } };
}
