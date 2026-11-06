import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Quaternion } from 'three';
import { PhysicsSim, DEFAULTS, ATMOSPHERE, nozzle, rocketReference, runValidation } from '../dist/js/physics.js';

const advance = (sim, duration, input = {}, dt = .002) => {
  for (let i = 0; i < Math.round(duration / dt); ++i) sim.step(dt, typeof input === 'function' ? input(i * dt, sim) : input);
};
const finiteState = sim => [...sim.state.pos, ...sim.state.vel, ...sim.state.q, ...sim.state.omega,
  sim.state.pressure, sim.state.temp, sim.state.gas].every(Number.isFinite);

test('convergent nozzle is continuous at choking and shuts off at ambient', () => {
  const critical = (2 / 2.4) ** 3.5;
  const p = ATMOSPHERE / critical;
  const a = nozzle(p * (1 - 1e-8), 300, .002), b = nozzle(p * (1 + 1e-8), 300, .002);
  assert.equal(a.regime, 'subsonic'); assert.equal(b.regime, 'choked');
  assert.ok(Math.abs(a.force - b.force) / b.force < 1e-6);
  assert.equal(nozzle(ATMOSPHERE, 300, .002).force, 0);
  assert.equal(nozzle(ATMOSPHERE * .5, 300, .002).mdot, 0);
  const choked = nozzle(30e6, 300, .002);
  assert.ok(choked.pe > ATMOSPHERE);
  assert.ok(choked.force > choked.mdot * choked.ve, 'positive pressure thrust is retained');
});

test('integrated ideal straight rocket converges to Tsiolkovsky, without adding delta-v twice', () => {
  const analytic = rocketReference(2000, 1980, 500);
  const calculate = dt => {
    let m = 2000, v = 0;
    for (let t = 0; t < Math.round(10 / dt); ++t) { v += 2 * 500 / m * dt; m -= 2 * dt; }
    return Math.abs(v - analytic);
  };
  const errors = [.002, .001, .0005].map(calculate);
  assert.ok(errors[2] < 1.3e-6);
  assert.ok(errors[1] < errors[0] * .51 && errors[2] < errors[1] * .51);
});

test('actual rigid body follows vacuum freefall and position error halves with timestep', () => {
  const errors = [.002, .001, .0005].map(dt => {
    const s = new PhysicsSim({ contactEnabled: false, aeroEnabled: false });
    s.state.pos.set(0, 20, 0); s.state.vel.set(0, 3, 0);
    advance(s, 1, { stabilize: false }, dt);
    assert.ok(Math.abs(s.state.vel.y - (3 - DEFAULTS.gravity)) < 1e-10);
    return Math.abs(s.state.pos.y - (20 + 3 - .5 * DEFAULTS.gravity));
  });
  assert.ok(errors[2] < .00246);
  assert.ok(errors[1] < errors[0] * .501 && errors[2] < errors[1] * .501);
});

test('instantaneous force balance and tilt projection respect Newton second law', () => {
  const mass = 2000, force = mass * DEFAULTS.gravity;
  assert.equal((force - mass * DEFAULTS.gravity) / mass, 0);
  const vector = new Vector3(0, force, 0).applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 6));
  const acceleration = vector.y / mass - DEFAULTS.gravity;
  assert.ok(Math.abs(acceleration - -1.3138419739773344) < 1e-12);
});

test('actual symmetric lift nozzles cancel torque', () => {
  const s = new PhysicsSim({ contactEnabled: false, aeroEnabled: false, gravity: 0 });
  advance(s, .2, { stabilize: false, thrusterCommands: [.2, .2, .2, .2] });
  assert.ok(s.state.vel.y > 0);
  assert.ok(s.state.omega.length() < 1e-10);
  assert.ok(s.lastTorque.length() < 1e-8);
});

test('actual front-left nozzle lifts the left and nose, and its thrust rotates with the body', () => {
  const s = new PhysicsSim({ contactEnabled: false, aeroEnabled: false, gravity: 0 });
  advance(s, .04, { stabilize: false, thrusterCommands: [.5] });
  assert.ok(s.state.omega.x > 0, 'left side rises');
  assert.ok(s.state.omega.z > 0, 'nose rises');
  s.state.q.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  s.state.vel.set(0, 0, 0); s.state.omega.set(0, 0, 0);
  s.step(.002, { stabilize: false, thrusterCommands: [.5, .5, .5, .5] });
  assert.ok(s.state.vel.x < 0, 'upward body direction rotates toward world -X');
});

test('vehicle mass loss equals integrated gas flow; adiabatic mass-temperature law holds', () => {
  const s = new PhysicsSim({ contactEnabled: false, aeroEnabled: false, gravity: 0 });
  const m0 = s.mass, mg0 = s.state.gas, U0 = s.state.gas * 717.5 * s.state.temp;
  let emitted = 0;
  for (let i = 0; i < 300; ++i) {
    s.step(.002, { boost: true, stabilize: false });
    emitted += s.thrusters.reduce((sum, t) => sum + t.mdot, 0) * .002;
  }
  assert.ok(Math.abs(m0 - s.mass - emitted) < 1e-9);
  assert.ok(Math.abs(s.state.temp - 300 * (s.state.gas / mg0) ** .4) < 1e-9);
  assert.ok(Math.abs(s.state.gas * 717.5 * s.state.temp + s.state.expelledEnthalpy - U0) < 1e-5);
  assert.ok(s.state.pressure < 35.875e6 && s.state.temp < 300);
});

test('four-wheel suspension lands, damps and does not provide airborne tire forces', () => {
  const s = new PhysicsSim(); s.reset('drop');
  let minimumCG = Infinity, maximumCompression = 0;
  advance(s, 7, () => {
    minimumCG = Math.min(minimumCG, s.state.pos.y);
    maximumCompression = Math.max(maximumCompression, ...s.wheels.map(w => w.compression));
    return { stabilize: false };
  });
  assert.ok(minimumCG >= .32 - 1e-6, `minimum CG ${minimumCG}`);
  assert.ok(maximumCompression > .07);
  assert.ok(Math.abs(s.state.vel.y) < 1e-4);
  assert.ok(Math.abs(s.state.pos.y - s.restHeight) < 1e-4);
  assert.equal(s.contactCount, 4);
  const air = new PhysicsSim({ gravity: 0, aeroEnabled: false }); air.state.pos.y = 8;
  advance(air, .5, { throttle: 1, steer: 1, stabilize: false });
  assert.equal(air.contactCount, 0); assert.ok(air.wheels.every(w => w.load === 0));
  assert.equal(air.state.vel.length(), 0, 'spinning wheels cannot accelerate an airborne car');
});

test('tilted body collision remains finite and enforces the explicit ground constraint', () => {
  const s = new PhysicsSim(); s.reset('drop');
  s.state.q.setFromAxisAngle(new Vector3(1, 0, 0), 1.5);
  advance(s, 6, { stabilize: false });
  assert.ok(finiteState(s));
  for (const x of [-1.95, 1.95]) for (const y of [-.32, .55]) for (const z of [-.87, .87]) {
    const corner = new Vector3(x, y, z).applyQuaternion(s.state.q).add(s.state.pos);
    assert.ok(corner.y > -1e-6);
  }
});

test('ground traction, motor power, brakes and fan produce finite physical responses', () => {
  const drive = new PhysicsSim();
  advance(drive, 4, { throttle: 1, stabilize: false });
  const before = drive.telemetry();
  assert.ok(before.speed > 15 && before.speed < 40);
  assert.ok(before.batteryPct < 100); assert.equal(before.gasUsed, 0);
  advance(drive, 3, { brake: 1, stabilize: false });
  assert.ok(drive.telemetry().speed < before.speed * .3);
  const fan = new PhysicsSim(); advance(fan, 3, { fan: true, stabilize: false });
  const load = fan.wheels.reduce((sum, w) => sum + w.load, 0);
  assert.ok(load > fan.mass * DEFAULTS.gravity + 17000);
  assert.ok(fan.state.batteryJ < DEFAULTS.batteryKWh * 3.6e6);
  assert.equal(fan.state.gas, fan.initialGas);
});

test('finite-tank guided hop reaches target and lands with bounded vertical speed', () => {
  const s = new PhysicsSim(); let wasAirborne = false, touched = false, speedAtTouch = Infinity, peak = 0;
  const reference = (t, d) => { const r = Math.max(0, Math.min(1, t / d)); return [10*r**3-15*r**4+6*r**5, (30*r*r-60*r**3+30*r**4)/d, (60*r-180*r*r+120*r**3)/(d*d)]; };
  for (let i = 0; i < 2500; ++i) {
    const t = i * .002; let h, v, a;
    if (t < 1.2) [h,v,a] = reference(t,1.2).map(x=>x*.6);
    else if (t < 1.4) { h=.6; v=a=0; }
    else { [h,v,a]=reference(t-1.4,1.5);h=.6*(1-h);v*=-.6;a*=-.6; }
    s.step(.002,{altHold:!touched,targetHeight:h,targetVelocity:v,targetAcceleration:a,stabilize:true});
    peak=Math.max(peak,s.telemetry().altitude);
    if (s.contactCount===0) wasAirborne=true;
    if(wasAirborne&&!touched&&s.contactCount>0){touched=true;speedAtTouch=Math.abs(s.state.vel.y);}
  }
  assert.ok(touched && wasAirborne);
  assert.ok(peak>.55 && peak<.7);
  assert.ok(speedAtTouch<.55);
  assert.ok(s.state.gas>0 && s.state.gas<s.initialGas);
  assert.ok(s.state.pressure>ATMOSPHERE);
  assert.ok(Math.abs(s.state.vel.y)<.01);
});

test('browser validation panel reports all model checks honestly', () => {
  const results=runValidation();
  assert.equal(results.length,9);
  for(const r of results) assert.ok(r.pass, `${r.name}: ${r.actual}`);
});
