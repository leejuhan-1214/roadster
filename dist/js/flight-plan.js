/**
 * Bounded reference trajectories for the finite-tank educational vehicle.
 * These request forces through the ordinary controller: they never move the
 * body directly, refill gas, or guarantee a target under altered parameters.
 * Heights are measured above the loaded, settled chassis reference height.
 */
const profile = (id, height, rise, hold, down, description) => Object.freeze({
  id, height, rise, hold, down, duration: rise + hold + down,
  label: `${height} m`, description,
});

export const FLIGHT_PROFILES = Object.freeze({
  '0.6': profile('0.6', .6, 1.2, .2, 1.5, '낮은 도약 · 접촉과 서스펜션 감쇠 관찰'),
  '2': profile('2', 2, 1.2, .05, 2, '중간 도약 · 상승과 착지 감속 관찰'),
  '3': profile('3', 3, 1.2, .05, 2.2, '높은 도약 · 기본 조건에서 약 3.15 m, 착지에 기체 사용'),
});
export const DEFAULT_FLIGHT_PROFILE = '3';

function resolveProfile(value = DEFAULT_FLIGHT_PROFILE) {
  if (typeof value === 'string' || typeof value === 'number') {
    if (FLIGHT_PROFILES[value]) return FLIGHT_PROFILES[value];
    throw new RangeError(`Unknown guided flight profile: ${value}`);
  }
  if (value && Object.values(FLIGHT_PROFILES).includes(value)) return value;
  throw new TypeError('Use a supported guided flight profile.');
}

function smoothReference(time, duration) {
  const s = Math.max(0, Math.min(1, time / duration));
  return [10*s**3 - 15*s**4 + 6*s**5,
    (30*s*s - 60*s**3 + 30*s**4) / duration,
    (60*s - 180*s*s + 120*s**3) / (duration * duration)];
}

export function getGuidedInput(time, selected = DEFAULT_FLIGHT_PROFILE) {
  const p = resolveProfile(selected), t = Math.max(0, Number(time) || 0);
  let h = 0, v = 0, a = 0, phase = 'settle';
  if (t < p.rise) {
    [h, v, a] = smoothReference(t, p.rise).map(x => x * p.height);
    phase = 'rise';
  } else if (t < p.rise + p.hold) {
    h = p.height; phase = 'hover';
  } else if (t < p.duration) {
    [h, v, a] = smoothReference(t - p.rise - p.hold, p.down);
    h = p.height * (1 - h); v *= -p.height; a *= -p.height;
    phase = 'descent';
  }
  return {
    h, v, a, phase, duration: p.duration, finished: t >= p.duration,
    targetHeight: h, targetVelocity: v, targetAcceleration: a,
    throttle: 0, steer: 0, brake: 0, boost: false, lift: 0,
    pitch: 0, roll: 0, yaw: 0, stabilize: true, altHold: true, fan: false,
  };
}

/** Call before each integration step; ended runs must disable altitude hold. */
export function createGuidedRun(selected = DEFAULT_FLIGHT_PROFILE, startTime = 0) {
  return { profile: resolveProfile(selected), startTime, wasAirborne: false,
    landed: false, ended: false, reason: null, contactSpeed: null };
}

export function updateGuidedRun(run, sim) {
  if (run.ended) return run;
  const elapsed = sim.state.time - run.startTime;
  if (sim.contactCount === 0) run.wasAirborne = true;
  if (run.wasAirborne && sim.contactCount > 0) {
    run.landed = run.ended = true;
    run.reason = 'landed'; run.contactSpeed = Math.abs(sim.state.vel.y);
  } else if (sim.state.pressure <= 1.2e6) {
    run.ended = true; run.reason = 'pressure';
  } else if (elapsed > run.profile.duration + 2) {
    run.ended = true; run.reason = run.wasAirborne ? 'timeout' : 'no-takeoff';
  }
  return run;
}

/** A short visible vectoring example using the ordinary finite-gas 2 m hop. */
export function getLevelMoveInput(time){
 const input=getGuidedInput(time,'2');
 return {...input,airMoveForward:0,airMoveRight:time>=.6&&time<1.5?1:time>=1.5&&time<2.4?-1:0};
}
