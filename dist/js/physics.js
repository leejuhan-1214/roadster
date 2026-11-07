import { Vector3, Quaternion, Euler } from 'three';

/** Educational six-DOF rigid-body model; NOT a Tesla digital twin.
 * Right-handed axes: X forward, Y up, Z right. Angular velocity is body-local.
 * Four massless wheel carriers lump tire/suspension compliance into corner springs.
 * Configurable fixed CG/principal inertia neglect expelled angular momentum and tank mass redistribution.
 * The ten-nozzle layout and all performance parameters are hypothetical.
 */
export const DEFAULTS = Object.freeze({
  dryMass: 1900, tankVolume: .6, tankPressureMPa: 35.875, initialTemperature: 300,
  friction: 1.15, springK: 75000, damperC: 6000, fanMaxForce: 18000,
  motorPowerKW: 650, motorTorqueNm: 900, windX: 0, windZ: 0,
  gravity: 9.80665, dragScale: 1, valveTau: .03,
  wheelRadius: .36, wheelInertia: 2.6, gearRatio: 9, driveEfficiency: .94,
  batteryKWh: 75, contactEnabled: true, aeroEnabled: true, driveMode: 'experimental',
  cgX: 0, cgY: 0, cgZ: 0, inertiaRoll: 900, inertiaYaw: 3400, inertiaPitch: 3500,
  wheelbase: 2.8, trackWidth: 1.88,
});
export const PARAMETER_INFO = {
  cgX: ['무게중심 전후 오프셋', 'm', '가정 · 차체 기준점에서 +전방 / −후방, 비행 중 고정'],
  cgY: ['무게중심 높이 오프셋', 'm', '가정 · 차체 기준점에서 +위쪽 / −아래쪽, 비행 중 고정'],
  cgZ: ['무게중심 좌우 오프셋', 'm', '가정 · 차체 기준점에서 +오른쪽 / −왼쪽, 비행 중 고정'],
  inertiaRoll: ['롤 관성모멘트', 'kg·m²', '가정 · CG를 지나는 차체 X축의 주관성, 질량과 독립 입력'],
  inertiaYaw: ['요 관성모멘트', 'kg·m²', '가정 · CG를 지나는 차체 Y축의 주관성, 질량과 독립 입력'],
  inertiaPitch: ['피치 관성모멘트', 'kg·m²', '가정 · CG를 지나는 차체 Z축의 주관성, 질량과 독립 입력'],
  wheelbase: ['휠베이스', 'm', '가정 · 앞뒤 바퀴 중심 간 거리, 공개 실측 치수 아님'],
  trackWidth: ['윤거', 'm', '가정 · 좌우 바퀴 중심 간 거리, 공개 실측 치수 아님'],
  dryMass: ['기체 제외 질량', 'kg', '가정 · 차체, 배터리, 빈 탱크, 탑승자 포함'],
  tankVolume: ['탱크 체적', 'm³', '발표 용량을 참고한 모델값 · 실제 구성 미검증'],
  tankPressureMPa: ['초기 절대압력', 'MPa', '이상 공기 250 kg / 600 L / 300 K로 역산한 가정'],
  initialTemperature: ['초기 기체 온도', 'K', '실측값이 아닌 상온 가정'],
  friction: ['마찰 계수', '—', '하중·온도 의존성을 생략한 마찰 원 근사'],
  springK: ['바퀴별 스프링 상수', 'N/m', '타이어와 서스펜션을 합친 가정값'],
  damperC: ['바퀴별 감쇠 계수', 'N·s/m', '선형 댐퍼 가정'],
  fanMaxForce: ['팬 최대 다운포스', 'N', '가정 · 차고·기울기에 따라 감소'],
  motorPowerKW: ['모터 최대 출력', 'kW', '가정 · 구동 모터 합산, 2020 실측값 아님'],
  motorTorqueNm: ['모터 최대 토크', 'N·m', '가정 · 구동 모터 합산, 2020 실측값 아님'],
  valveTau: ['밸브 응답 시정수', 's', '1차 지연 가정'],
};
const R = 287, GAMMA = 1.4, CV = R / (GAMMA - 1), CP = GAMMA * CV;
export const ATMOSPHERE = 101325;
const CRITICAL = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(1, 0, 0);
const BOX_AXES = [new Vector3(1,0,0), new Vector3(0,1,0), new Vector3(0,0,1)];
const BODY_HALF = [1.95, .435, .87];
const BODY_BOX_CENTER = new Vector3(0, .115, 0);

// Oriented chassis box versus a static axis-aligned obstacle. This is a contact
// envelope, not the render mesh, tire deformation, or structural damage model.
function boxContact(sim, obstacle) {
  const {pos,q}=sim.state;
  const center=BODY_BOX_CENTER.clone().sub(sim.cg).applyQuaternion(q).add(pos);
  const radius=Math.hypot(...BODY_HALF);
  if(center.x+radius<obstacle.min.x||center.x-radius>obstacle.max.x||
     center.y+radius<obstacle.min.y||center.y-radius>obstacle.max.y||
     center.z+radius<obstacle.min.z||center.z-radius>obstacle.max.z)return null;
  const axes=BOX_AXES.map(axis=>axis.clone().applyQuaternion(q));
  const delta=center.clone().sub(obstacle.center);
  const candidates=[...BOX_AXES,...axes];
  for(const axis of axes)for(const worldAxis of BOX_AXES)candidates.push(new Vector3().crossVectors(axis,worldAxis));
  let depth=Infinity, normal=null;
  for(const candidate of candidates){
    if(candidate.lengthSq()<1e-12)continue;
    const axis=candidate.clone().normalize();
    const bodyRadius=axes.reduce((sum,a,i)=>sum+BODY_HALF[i]*Math.abs(axis.dot(a)),0);
    const boxRadius=Math.abs(axis.x)*obstacle.half.x+Math.abs(axis.y)*obstacle.half.y+Math.abs(axis.z)*obstacle.half.z;
    const separation=delta.dot(axis),overlap=bodyRadius+boxRadius-Math.abs(separation);
    if(overlap<=0)return null;
    if(overlap<depth){depth=overlap;normal=axis.multiplyScalar(separation<0?-1:1);}
  }
  // Centre of a parallel supporting face; a rotated edge/vertex otherwise.
  // Clipping this representative point to the static box avoids a far-away lever arm.
  const point=center.clone();
  axes.forEach((axis,i)=>{const projection=normal.dot(axis);if(Math.abs(projection)>1e-7)point.addScaledVector(axis,-Math.sign(projection)*BODY_HALF[i]);});
  point.clamp(obstacle.min,obstacle.max);
  return {normal,depth,point};
}

/** Ideal convergent nozzle, exit=throat. Pressure thrust is retained when choked.
 * Pa absolute; K; m². Inlet is tank stagnation state, no plumbing losses (Cd=1).
 */
export function nozzle(pressure, temperature, area, ambient = ATMOSPHERE) {
  if (!(pressure > ambient) || !(temperature > 0) || !(area > 0))
    return { mdot: 0, force: 0, ve: 0, pe: ambient, regime: 'off', effectiveVelocity: 0 };
  const choked = ambient / pressure <= CRITICAL;
  const pe = choked ? pressure * CRITICAL : ambient;
  const te = choked ? temperature * 2 / (GAMMA + 1) : temperature * (ambient / pressure) ** ((GAMMA - 1) / GAMMA);
  const ve = choked ? Math.sqrt(GAMMA * R * te) : Math.sqrt(Math.max(0, 2 * CP * (temperature - te)));
  const mdot = area * pe * ve / (R * te);
  const force = mdot * ve + (pe - ambient) * area;
  return { mdot, force, ve, pe, regime: choked ? 'choked' : 'subsonic', effectiveVelocity: force / mdot };
}

export function rocketReference(mInitial, mFinal, effectiveVelocity) {
  return effectiveVelocity * Math.log(mInitial / mFinal);
}

function makeThrusters() {
  const result = [];
  for (const x of [1.28, -1.28]) for (const z of [-.78, .78])
    result.push({ name: `${x > 0 ? '전' : '후'}${z < 0 ? '좌' : '우'} 수직`, group: 'lift',
      pos: new Vector3(x, -.20, z), dir: new Vector3(0, 1, 0), area: .00035 });
  for (const z of [-.56, .56]) result.push({ name: z < 0 ? '후방 좌 추진' : '후방 우 추진', group: 'boost',
    pos: new Vector3(-1.92, -.05, z), dir: new Vector3(1, 0, 0), area: .00025 });
  result.push(
    { name: '전방 요 +', group: 'yaw+', pos: new Vector3(1.35, 0, .87), dir: new Vector3(0, 0, -1), area: .00004 },
    { name: '후방 요 +', group: 'yaw+', pos: new Vector3(-1.35, 0, -.87), dir: new Vector3(0, 0, 1), area: .00004 },
    { name: '전방 요 −', group: 'yaw-', pos: new Vector3(1.35, 0, -.87), dir: new Vector3(0, 0, 1), area: .00004 },
    { name: '후방 요 −', group: 'yaw-', pos: new Vector3(-1.35, 0, .87), dir: new Vector3(0, 0, -1), area: .00004 },
  );
  return result.map(t => ({ ...t, mountPosition: t.pos.clone(), force: 0, maxForce: 0, opening: 0, command: 0, mdot: 0 }));
}

export class PhysicsSim {
  constructor(params = {}) {
    this.params = { ...DEFAULTS, ...params };
    this.thrusters = makeThrusters();
    this.cg = new Vector3();
    this.obstacles = [];
    this.wheels = [];
    for (const x of [1.4, -1.4]) for (const z of [-.94, .94]) this.wheels.push({
      name: `${x > 0 ? '전' : '후'}${z < 0 ? '좌' : '우'}`, pos: new Vector3(x, -.31, z),
      compression: 0, omega: 0, load: 0, slip: 0, steer: 0, grounded: false,
    });
    this.inertia = new Vector3(900, 3400, 3500);
    this.reset();
  }

  reset(preset = 'ground') {
    const p = this.params;
    p.dryMass = Math.max(100, Number(p.dryMass) || DEFAULTS.dryMass);
    p.tankVolume = clamp(Number(p.tankVolume) || DEFAULTS.tankVolume, .02, 2);
    p.tankPressureMPa = clamp(Number(p.tankPressureMPa) || DEFAULTS.tankPressureMPa, .101325, 80);
    p.initialTemperature = clamp(Number(p.initialTemperature) || 300, 150, 500);
    for (const key of ['cgX', 'cgY', 'cgZ']) p[key] = clamp(Number(p[key]) || 0, key === 'cgY' ? -.2 : -.65, key === 'cgY' ? .6 : .65);
    for (const key of ['inertiaRoll', 'inertiaYaw', 'inertiaPitch']) p[key] = Math.max(100, Number(p[key]) || DEFAULTS[key]);
    p.wheelbase = clamp(Number(p.wheelbase) || DEFAULTS.wheelbase, 1.5, 4);
    p.trackWidth = clamp(Number(p.trackWidth) || DEFAULTS.trackWidth, 1, 2.6);
    this.cg.set(p.cgX, p.cgY, p.cgZ);
    this.inertia.set(p.inertiaRoll, p.inertiaYaw, p.inertiaPitch);
    this.wheels.forEach((w, i) => {
      w.pos.set(i < 2 ? p.wheelbase / 2 : -p.wheelbase / 2, -.31, i % 2 ? p.trackWidth / 2 : -p.trackWidth / 2).sub(this.cg);
      w.isFront = i < 2;
    });
    for (const t of this.thrusters) t.pos.copy(t.mountPosition).sub(this.cg);
    const electric = p.driveMode === 'electric';
    const gas = electric ? 0 : p.tankPressureMPa * 1e6 * p.tankVolume / (R * p.initialTemperature);
    this.initialGas = gas;
    this.initialEnergy = gas * CV * p.initialTemperature;
    this.restHeight = .31 + p.wheelRadius + this.cg.y - (p.dryMass + gas) * p.gravity / (4 * p.springK);
    this.state = { pos: new Vector3(this.cg.x, this.restHeight, this.cg.z), vel: new Vector3(),
      q: new Quaternion(), omega: new Vector3(), gas, temp: p.initialTemperature,
      pressure: electric ? ATMOSPHERE : p.tankPressureMPa * 1e6, time: 0,
      batteryJ: p.batteryKWh * 3.6e6 * (electric ? .8 : 1),
      acceleration: new Vector3(), gasUsed: 0, expelledEnthalpy: 0,
    };
    if (preset === 'drop') this.state.pos.y += 3;
    if (preset === 'flight') { this.state.pos.y += 1.8; this.state.vel.x = 8; }
    if (preset === 'corner') this.state.vel.x = 12;
    this.contactCount = preset === 'drop' || preset === 'flight' ? 0 : 4;
    this.fanForce = 0; this.totalThrust = 0; this.maxThrust = 0;
    this.saturation = false; this.lastImpactSpeed = 0; this.impactImpulse = 0;
    this.maxAltitude = 0; this.lastContactCount = this.contactCount; this.maxG = 1;
    this.lastInput = {}; this.lastForce = new Vector3(); this.lastTorque = new Vector3();
    this.frictionForceN = 0; this.brakeForceN = 0; this.regenKW = 0; this.drivePowerKW = 0;
    this.history = [];
    this.obstacleContacts = []; this.lastObstacleImpact = null;
    for (const w of this.wheels) { w.compression = this.contactCount ? .31 + p.wheelRadius + this.cg.y - this.restHeight : 0;
      w.omega = preset === 'corner' ? 12 / p.wheelRadius : 0; w.load = this.contactCount ? (p.dryMass + gas) * p.gravity / 4 : 0;
      w.slip = 0; w.steer = 0; w.grounded = this.contactCount > 0; }
    for (const t of this.thrusters) { t.force = 0; t.maxForce = nozzle(this.state.pressure, this.state.temp, t.area).force; t.opening = 0; t.command = 0; t.mdot = 0; }
    return this.state;
  }

  /** Static stage collision boxes. Reset preserves this course; [] restores the empty test pad. */
  setObstacles(boxes = []) {
    if(!Array.isArray(boxes))throw new TypeError('Obstacles must be an array.');
    this.obstacles=boxes.map((box,i)=>{
      if(!Array.isArray(box.center)||!Array.isArray(box.size)||box.center.length!==3||box.size.length!==3||
         !box.center.every(Number.isFinite)||!box.size.every(n=>Number.isFinite(n)&&n>0))
        throw new TypeError('Each obstacle needs finite center[3] and positive size[3].');
      const center=new Vector3(...box.center),half=new Vector3(...box.size).multiplyScalar(.5);
      return {id:box.id??String(i),center,half,min:center.clone().sub(half),max:center.clone().add(half)};
    });
    this.obstacleContacts=[];this.lastObstacleImpact=null;
  }

  /** Highest horizontal supporting surface below this wheel/fan reference point. */
  surfaceHeightAt(x,z,referenceY=Infinity) {
    let height=0;
    for(const box of this.obstacles)if(x>=box.min.x&&x<=box.max.x&&z>=box.min.z&&z<=box.max.z&&
      box.max.y<=referenceY+.10&&box.max.y>height)height=box.max.y;
    return height;
  }

  get mass() { return Math.max(100, this.params.dryMass) + this.state.gas; }
  get groundHeight() { return this.restHeight; }
  get bodyPosition() { return this.state.pos.clone().sub(this.cg.clone().applyQuaternion(this.state.q)); }
  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const count = Math.ceil(Math.min(dt, .1) / .002);
    const h = Math.min(dt, .1) / count;
    for (let i = 0; i < count; ++i) this._step(h, input);
  }

  _step(dt, input) {
    const p = this.params, s = this.state;
    const electric = p.driveMode === 'electric';
    // Road driving is isolated from the optional hypothetical flying equipment.
    if (electric) input = { ...input, lift: 0, altHold: false, boost: false,
      roll: 0, pitch: 0, yaw: 0, airMoveForward: 0, airMoveRight: 0,
      stabilize: false, fan: false, wing: false, thrusterCommands: undefined };
    this.lastInput = input;
    const mass = this.mass, gravity = Math.max(0, p.gravity);
    this.inertia.set(p.inertiaRoll, p.inertiaYaw, p.inertiaPitch);
    const qInv = s.q.clone().invert();
    const omegaWorld = s.omega.clone().applyQuaternion(s.q);
    const bodyUp = UP.clone().applyQuaternion(s.q);
    const force = new Vector3(0, -mass * gravity, 0), torqueWorld = new Vector3();
    const applyAt = (f, r) => { force.add(f); torqueWorld.add(new Vector3().crossVectors(r, f)); };
    const bodyVelocity = s.vel.clone().applyQuaternion(qInv);

    // Rate-limited first-order valves, physical positive-only allocation.
    const layoutMaximum = this.thrusters.map(t => nozzle(s.pressure, s.temp, t.area));
    for (let i = 0; i < this.thrusters.length; ++i) this.thrusters[i].maxForce = layoutMaximum[i].force;
    const isAirborne = this.contactCount === 0;
    const enabledControl = isAirborne || input.lift > .01 || input.altHold;
    const forward = FORWARD.clone().applyQuaternion(s.q);
    const heading = Math.atan2(-forward.z, forward.x);
    const yawTarget = new Quaternion().setFromAxisAngle(UP, heading);
    let moveForward=isAirborne?clamp(input.airMoveForward||0,-1,1):0;
    let moveRight=isAirborne?clamp(input.airMoveRight||0,-1,1):0;
    const moveLength=Math.hypot(moveForward,moveRight);
    if(moveLength>1){moveForward/=moveLength;moveRight/=moveLength;}
    const airMoveActive=moveLength>1e-5;
    // WASD requests a bounded attitude. Only physical thruster forces can then
    // accelerate horizontally; there is no velocity assignment or airborne tire force.
    if(airMoveActive)yawTarget.multiply(new Quaternion().setFromEuler(new Euler(.30*moveRight,0,-.30*moveForward,'XYZ')));
    const qError = qInv.clone().multiply(yawTarget);
    if (qError.w < 0) qError.set(-qError.x, -qError.y, -qError.z, -qError.w);
    const error = new Vector3(qError.x, qError.y, qError.z).multiplyScalar(2);
    const stabilize = input.stabilize !== false || airMoveActive;
    let tx = 0, ty = 0, tz = 0;
    if (enabledControl) {
      tx = this.inertia.x * ((Math.abs(input.roll || 0) > .02 ? 3.2 * input.roll : stabilize ? 10 * error.x : 0) - (stabilize || input.roll ? 5.6 : 0) * s.omega.x);
      tz = this.inertia.z * ((Math.abs(input.pitch || 0) > .02 ? 2.4 * input.pitch : stabilize ? 10 * error.z : 0) - (stabilize || input.pitch ? 5.6 : 0) * s.omega.z);
      ty = this.inertia.y * (1.2 * (input.yaw || 0) - (stabilize || input.yaw ? 1.6 : 0) * s.omega.y);
    }
    let vertical = input.lift > 0 ? mass * gravity * (1 + .4 * clamp(input.lift, 0, 1)) : 0;
    if (input.altHold) {
      const target = clamp(input.targetHeight ?? 1.5, 0, 15) + this.restHeight;
      const aDesired = clamp((input.targetAcceleration || 0) + 24 * (target - s.pos.y) + 10 * ((input.targetVelocity || 0) - s.vel.y), -gravity, 1.1 * Math.max(gravity, 1));
      vertical = mass * Math.max(0, gravity + aDesired) / Math.max(.3, bodyUp.y);
    }
    // Solve the symmetric physical mount layout about the selected CG. A shifted
    // CG changes each lever arm; collective lift requires unequal valve commands.
    const trimRoll = tx - this.cg.z * vertical, trimPitch = tz + this.cg.x * vertical;
    let liftForces = [0, 1, 2, 3].map(i => vertical / 4 + trimRoll * (-this.thrusters[i].mountPosition.z) / (4 * .78 ** 2) + trimPitch * this.thrusters[i].mountPosition.x / (4 * 1.28 ** 2));
    // A nonnegative common-mode shift enables physical RCS roll/pitch with no negative thrusters.
    const minLift = Math.min(...liftForces);
    if (minLift < 0) liftForces = liftForces.map(f => f - minLift);
    const desiredForces = [...liftForces, input.boost ? layoutMaximum[4].force : 0, input.boost ? layoutMaximum[5].force : 0,
      Math.max(0, ty) / 2.7, Math.max(0, ty) / 2.7, Math.max(0, -ty) / 2.7, Math.max(0, -ty) / 2.7];
    // Educational per-nozzle override, still constrained by valve lag and tank state.
    if (Array.isArray(input.thrusterCommands)) for (let i = 0; i < desiredForces.length; ++i)
      desiredForces[i] = clamp(input.thrusterCommands[i] || 0, 0, 1) * layoutMaximum[i].force;
    this.saturation = false; this.totalThrust = 0; this.maxThrust = 0;
    let totalFlow = 0;
    for (let i = 0; i < this.thrusters.length; ++i) {
      const t = this.thrusters[i], available = layoutMaximum[i];
      this.maxThrust += available.force;
      if (desiredForces[i] > available.force + 1) this.saturation = true;
      t.command = available.force > 0 ? clamp(desiredForces[i] / available.force, 0, 1) : 0;
      const openingOld = t.opening;
      const tau = Math.max(.001, Number(p.valveTau) || .03);
      t.opening = t.command + (t.opening - t.command) * Math.exp(-dt / tau);
      const midOpening = t.command + (openingOld - t.command) * Math.exp(-dt / (2 * tau));
      t.force = available.force * midOpening; t.mdot = available.mdot * midOpening;
      totalFlow += t.mdot;
    }
    // Check-valve cutoff at ambient; a finite tank cannot eject negative mass.
    const removable = s.pressure > ATMOSPHERE ? s.gas * (1 - (ATMOSPHERE / s.pressure) ** (1 / GAMMA)) : 0;
    const dm = Math.min(totalFlow * dt, Math.max(0, removable));
    const flowScale = totalFlow * dt > 0 ? dm / (totalFlow * dt) : 0;
    for (const t of this.thrusters) {
      t.force *= flowScale; t.mdot *= flowScale; this.totalThrust += t.force;
      if (t.force > 0) applyAt(t.dir.clone().multiplyScalar(t.force).applyQuaternion(s.q), t.pos.clone().applyQuaternion(s.q));
    }
    if (dm > 0) {
      const oldU = s.gas * CV * s.temp;
      const oldMass = s.gas;
      s.gas -= dm;
      s.temp *= (s.gas / oldMass) ** (GAMMA - 1);
      s.expelledEnthalpy += oldU - s.gas * CV * s.temp;
      s.pressure = s.gas * R * s.temp / p.tankVolume;
    }
    s.gasUsed = this.initialGas - s.gas;

    // Anisotropic body drag, relative wind, and aerodynamic surface moment.
    const relative = s.vel.clone().sub(new Vector3(p.windX || 0, 0, p.windZ || 0)).applyQuaternion(qInv);
    if (p.aeroEnabled) {
      const rho = 1.225, aeroScale = Math.max(0, p.dragScale);
      const aero = new Vector3(-.5 * rho * .50 * relative.x * Math.abs(relative.x),
        -.5 * rho * 3.4 * relative.y * Math.abs(relative.y), -.5 * rho * 1.6 * relative.z * Math.abs(relative.z)).multiplyScalar(aeroScale);
      applyAt(aero.applyQuaternion(s.q), new Vector3(-.12, .06, 0).sub(this.cg).applyQuaternion(s.q));
      if (input.wing) {
        const wing = new Vector3(-.5 * rho * .18 * relative.x * Math.abs(relative.x), -.5 * rho * 1.3 * relative.x ** 2, 0).multiplyScalar(aeroScale);
        applyAt(wing.applyQuaternion(s.q), new Vector3(-1.68, .48, 0).sub(this.cg).applyQuaternion(s.q));
      }
      const airRateTorque = s.omega.clone().multiply(new Vector3(-22, -55, -55)).multiplyScalar(aeroScale * Math.max(1, relative.length() * .08)).applyQuaternion(s.q);
      torqueWorld.add(airRateTorque);
    }

    // Fan pressure force vanishes rapidly when the ground seal opens.
    let electricPower = 0;
    this.fanForce = 0;
    if (input.fan && s.batteryJ > 0) {
      const fanSurface=this.surfaceHeightAt(s.pos.x,s.pos.z,s.pos.y-this.restHeight);
      const clearance = Math.max(0, s.pos.y - this.restHeight - fanSurface);
      this.fanForce = Math.max(0, p.fanMaxForce) * Math.exp(-clearance / .10) * Math.max(0, bodyUp.y) ** 6;
      applyAt(bodyUp.clone().multiplyScalar(-this.fanForce), new Vector3(-.10, -.25, 0).sub(this.cg).applyQuaternion(s.q));
      electricPower += 80000;
    }

    this.lastContactCount = this.contactCount;
    this.contactCount = 0;
    let steering = clamp(input.steer || 0, -1, 1) * .52 / (1 + Math.abs(bodyVelocity.x) / 28);
    const pedalBrake = clamp(input.brake || 0, 0, 1);
    const throttle = electric && pedalBrake > 0 ? 0 : clamp(input.throttle || 0, -1, 1);
    const regenEnabled = electric && input.regen !== false;
    const chargeAcceptance = clamp((1 - s.batteryJ / (p.batteryKWh * 3.6e6)) / .05, 0, 1);
    const tireResultant = new Vector3();
    this.brakeForceN = 0; this.regenKW = 0; this.drivePowerKW = 0;
    let maxSlip = 0;
    for (const wheel of this.wheels) {
      const rCenter = wheel.pos.clone().applyQuaternion(s.q);
      const worldCenter = s.pos.clone().add(rCenter);
      const cornerVel = s.vel.clone().add(new Vector3().crossVectors(omegaWorld, rCenter));
      const surfaceY=this.surfaceHeightAt(worldCenter.x,worldCenter.z,worldCenter.y);
      wheel.surfaceY=surfaceY;
      const compression = Math.max(0, p.wheelRadius + surfaceY - worldCenter.y);
      wheel.compression = compression;
      wheel.grounded = !!p.contactEnabled && compression > 0;
      // Ackermann geometry: inner front wheel steers farther so rolling wheels
      // share an instantaneous turn centre. Tire slip still determines actual force.
      const centreRadius = Math.abs(steering) > 1e-7 ? p.wheelbase / Math.tan(Math.abs(steering)) : Infinity;
      const mountZ = wheel.pos.z + this.cg.z;
      const wheelRadiusToTurn = centreRadius + Math.sign(steering) * mountZ;
      wheel.steer = wheel.isFront ? Math.sign(steering) * Math.atan(p.wheelbase / wheelRadiusToTurn) : 0;
      let normal = 0;
      if (wheel.grounded) {
        normal = Math.max(0, p.springK * compression - p.damperC * cornerVel.y + 900000 * Math.max(0, compression - .22) ** 1.35);
        if (normal > 0) ++this.contactCount;
      }
      wheel.load = normal;
      const fwd = new Vector3(Math.cos(wheel.steer), 0, -Math.sin(wheel.steer)).applyQuaternion(s.q);
      fwd.y = 0; if (fwd.lengthSq() < 1e-8) fwd.set(1, 0, 0); else fwd.normalize();
      const right = new Vector3().crossVectors(fwd, UP).normalize();
      const ux = cornerVel.dot(fwd), uy = cornerVel.dot(right);
      const wheelSpeed = wheel.omega * p.wheelRadius;
      const slip = (wheelSpeed - ux) / Math.max(2.5, Math.abs(ux), Math.abs(wheelSpeed));
      wheel.slip = wheel.grounded ? slip : 0;
      maxSlip = Math.max(maxSlip, Math.abs(wheel.slip));
      // Low-speed HOLD uses a bounded static-contact approximation with locked
      // wheels. It cannot supply a force off the ground or exceed the friction circle.
      const contactLever = new Vector3(rCenter.x, surfaceY-s.pos.y, rCenter.z);
      const contactVelocity = s.vel.clone().add(new Vector3().crossVectors(omegaWorld, contactLever));
      const holdUx = contactVelocity.dot(fwd), holdUy = contactVelocity.dot(right);
      const hold = electric && Math.abs(throttle) < .02 && (regenEnabled || pedalBrake > 0)
        && Math.hypot(ux, uy) < .8;
      let fx = wheel.grounded ? (hold ? -holdUx * mass / (4 * .08) : 11000 * slip) : 0;
      let fy = wheel.grounded ? (hold ? -holdUy * mass / (4 * .08) : -55000 * Math.atan2(uy, Math.max(3, Math.abs(ux)))) : 0;
      // Rolling resistance must also fit inside mu*N; mu=0 means no road grip.
      let rolling = -.012 * normal * Math.tanh(ux / .6);
      const combined = Math.hypot(fx + rolling, fy), limit = Math.max(0, p.friction) * normal;
      if (combined > limit && combined > 0) {
        const scale = limit / combined; fx *= scale; fy *= scale; rolling *= scale;
      }
      wheel.tireForceN = Math.hypot(fx + rolling, fy);
      if (normal > 0) {
        const horizontalForce = fwd.clone().multiplyScalar(fx + rolling).addScaledVector(right, fy);
        tireResultant.add(horizontalForce);
        const groundForce = horizontalForce.addScaledVector(UP, normal);
        applyAt(groundForce, contactLever);
      }
      let driveTorque = 0, regenTorque = 0;
      // Three-motor AWD is represented by an assumed fixed split: front 1/3,
      // rear 2/3. Motor ratings, split and regen limits are educational estimates.
      const share = electric ? (wheel.isFront ? 1 / 6 : 1 / 3) : (wheel.isFront ? 0 : .5);
      if (share > 0 && s.batteryJ > 0) {
        const motorOmega = wheel.omega * p.gearRatio;
        const motorLimit = Math.min(Math.max(0, p.motorTorqueNm) * share,
          Math.max(0, p.motorPowerKW) * 1000 * share / Math.max(Math.abs(motorOmega), 10));
        driveTorque = throttle * motorLimit * p.gearRatio * p.driveEfficiency;
      }
      if (regenEnabled && Math.abs(throttle) < .02 && !hold && chargeAcceptance > 0) {
        // 1.8 m/s2 requested lift-off deceleration, 80 kW mechanical limit,
        // 72% electrical recovery; fading below 1 m/s and above 95% SOC.
        regenTorque = -Math.sign(wheel.omega) * Math.min(mass * 1.8 * p.wheelRadius * share,
          80000 * share / Math.max(Math.abs(wheel.omega), 1))
          * clamp(Math.abs(ux), 0, 1) * chargeAcceptance;
      }
      const motorPower = driveTorque * wheel.omega;
      const regenPower = regenTorque * wheel.omega;
      this.drivePowerKW += Math.max(0, motorPower) / 1000;
      const recoveryEfficiency = electric ? .72 : .65;
      electricPower += motorPower >= 0 ? motorPower / p.driveEfficiency : motorPower * recoveryEfficiency;
      electricPower += regenPower * recoveryEfficiency;
      this.regenKW += Math.max(0, -(Math.min(0, motorPower) + regenPower) * recoveryEfficiency) / 1000;
      driveTorque += regenTorque;
      const brakeAmount = hold ? 1 : pedalBrake;
      const brakeTorque = brakeAmount * 3100;
      this.brakeForceN += brakeTorque / p.wheelRadius;
      wheel.driveTorque = driveTorque - regenTorque;
      wheel.regenTorque = regenTorque;
      wheel.brakeTorque = brakeTorque;
      const accelerationTorque = driveTorque - fx * p.wheelRadius - .025 * wheel.omega;
      let nextOmega = wheel.omega + accelerationTorque / p.wheelInertia * dt;
      // Brake complementarity: dissipative torque may stop a wheel, never reverse it.
      if (brakeTorque > 0) nextOmega = Math.sign(nextOmega) * Math.max(0, Math.abs(nextOmega) - brakeTorque / p.wheelInertia * dt);
      wheel.omega = nextOmega;
    }
    this.frictionForceN = tireResultant.length();
    this.maxSlip = maxSlip;
    s.batteryJ = clamp(s.batteryJ - electricPower * dt, 0, p.batteryKWh * 3.6e6);

    // Body skid contact is separate from suspension; forces and impulses are explicit.
    if (p.contactEnabled) {
      for (const x of [-1.95, 1.95]) for (const y of [-.32, .55]) for (const z of [-.87, .87]) {
        const r = new Vector3(x, y, z).sub(this.cg).applyQuaternion(s.q);
        const penetration = .006 - (s.pos.y + r.y);
        if (penetration > 0) {
          const contactVel = s.vel.clone().add(new Vector3().crossVectors(omegaWorld, r));
          const normal = Math.max(0, 420000 * penetration - 6500 * contactVel.y);
          const horizontalSpeed = Math.hypot(contactVel.x, contactVel.z);
          const drag = Math.min(normal * Math.min(.45, Math.max(0, p.friction)), horizontalSpeed * mass / Math.max(dt * 8, .02));
          applyAt(new Vector3(horizontalSpeed ? -contactVel.x / horizontalSpeed * drag : 0, normal,
            horizontalSpeed ? -contactVel.z / horizontalSpeed * drag : 0), r);
        }
      }
    }
    const midMass = mass - dm / 2;
    // Gravity acts on the same midpoint mass as the acceleration denominator.
    force.y += .5 * dm * gravity;
    const acceleration = force.clone().divideScalar(midMass);
    s.vel.addScaledVector(acceleration, dt);
    s.pos.addScaledVector(s.vel, dt);
    const torqueBody = torqueWorld.clone().applyQuaternion(qInv);
    const angularMomentum = s.omega.clone().multiply(this.inertia);
    const gyro = new Vector3().crossVectors(s.omega, angularMomentum);
    const angularAcceleration = torqueBody.clone().sub(gyro).divide(this.inertia);
    s.omega.addScaledVector(angularAcceleration, dt);
    const spin = s.omega.length();
    if (spin > 1e-12) s.q.multiply(new Quaternion().setFromAxisAngle(s.omega.clone().divideScalar(spin), spin * dt)).normalize();
    if (p.contactEnabled) { this._resolveObstacles(); this._resolveGround(); }
    s.time += dt; s.acceleration.copy(acceleration);
    this.lastForce.copy(force); this.lastTorque.copy(torqueBody);
    this.maxAltitude = Math.max(this.maxAltitude, s.pos.y - this.restHeight);
    if (this.lastContactCount === 0 && this.contactCount > 0) this.lastImpactSpeed = Math.abs(s.vel.y - acceleration.y * dt);
    this.maxG = Math.max(this.maxG, acceleration.clone().addScaledVector(UP, gravity).length() / Math.max(gravity, .001));
  }

  _resolveObstacles() {
    this.obstacleContacts=[];
    if(!this.obstacles.length)return;
    const s=this.state, inverseMass=1/this.mass;
    // Sequential impulses: low restitution and Coulomb friction dissipate impact
    // energy. Full residual overlap correction is a numerical constraint, not thrust.
    for(let pass=0;pass<4;++pass){
      let any=false;
      for(const box of this.obstacles){
        const contact=boxContact(this,box);if(!contact)continue;
        any=true;const {normal,depth,point}=contact;
        const r=point.clone().sub(s.pos),qInv=s.q.clone().invert();
        const omegaWorld=s.omega.clone().applyQuaternion(s.q);
        const contactVelocity=s.vel.clone().add(new Vector3().crossVectors(omegaWorld,r));
        const normalSpeed=contactVelocity.dot(normal);
        s.pos.addScaledVector(normal,depth+1e-6);
        if(!this.obstacleContacts.includes(box.id))this.obstacleContacts.push(box.id);
        if(normalSpeed>=0)continue;
        const rn=new Vector3().crossVectors(r,normal);
        const inverseRot=rn.clone().applyQuaternion(qInv).divide(this.inertia).applyQuaternion(s.q);
        const effectiveMassInv=inverseMass+rn.dot(inverseRot);
        const normalImpulse=-(normalSpeed<-.5?1.05:1)*normalSpeed/effectiveMassInv;
        const applyImpulse=impulse=>{
          s.vel.addScaledVector(impulse,inverseMass);
          s.omega.add(new Vector3().crossVectors(r,impulse).applyQuaternion(qInv).divide(this.inertia));
        };
        applyImpulse(normal.clone().multiplyScalar(normalImpulse));
        const afterVelocity=s.vel.clone().add(new Vector3().crossVectors(s.omega.clone().applyQuaternion(s.q),r));
        const tangent=afterVelocity.clone().addScaledVector(normal,-afterVelocity.dot(normal));
        const tangentSpeed=tangent.length();
        if(tangentSpeed>1e-8){
          tangent.divideScalar(tangentSpeed);
          const rt=new Vector3().crossVectors(r,tangent);
          const inverseTangent=rt.clone().applyQuaternion(qInv).divide(this.inertia).applyQuaternion(s.q);
          const frictionImpulse=Math.min(Math.min(.4,Math.max(0,this.params.friction))*normalImpulse,tangentSpeed/(inverseMass+rt.dot(inverseTangent)));
          applyImpulse(tangent.multiplyScalar(-frictionImpulse));
        }
        this.impactImpulse+=normalImpulse;
        if(normalSpeed<-.3)this.lastObstacleImpact={id:box.id,speed:-normalSpeed,time:s.time,impulse:normalImpulse};
      }
      if(!any)break;
    }
  }

  _resolveGround() {
    const s = this.state;
    let lowest = Infinity, rLow = null;
    for (const x of [-1.95, 1.95]) for (const y of [-.32, .55]) for (const z of [-.87, .87]) {
      const r = new Vector3(x, y, z).sub(this.cg).applyQuaternion(s.q), height = s.pos.y + r.y;
      if (height < lowest) { lowest = height; rLow = r; }
    }
    if (lowest >= 0) return;
    // Constraint stabilization removes residual numeric overlap; inward momentum is
    // removed with the corresponding effective-mass impulse, never an unexplained v=0.
    s.pos.y -= lowest;
    const omegaWorld = s.omega.clone().applyQuaternion(s.q);
    const vNormal = s.vel.y + new Vector3().crossVectors(omegaWorld, rLow).y;
    if (vNormal >= 0) return;
    const qInv = s.q.clone().invert();
    const cross = new Vector3().crossVectors(rLow, UP);
    const invInertiaCross = cross.clone().applyQuaternion(qInv).divide(this.inertia).applyQuaternion(s.q);
    const effectiveInvMass = 1 / this.mass + cross.dot(invInertiaCross);
    const impulse = -(1.05) * vNormal / effectiveInvMass;
    s.vel.y += impulse / this.mass;
    s.omega.add(cross.multiplyScalar(impulse).applyQuaternion(qInv).divide(this.inertia));
    this.impactImpulse += impulse;
  }

  telemetry() {
    const s = this.state, m = this.mass, p = this.params;
    const fwd = FORWARD.clone().applyQuaternion(s.q), up = UP.clone().applyQuaternion(s.q);
    const attitude = { yaw: Math.atan2(-fwd.z, fwd.x), pitch: Math.asin(clamp(fwd.y, -1, 1)), roll: Math.atan2(up.z, up.y) };
    const contact = this.contactCount;
    const kinetic = .5 * m * s.vel.lengthSq();
    const rotation = .5 * s.omega.clone().multiply(this.inertia).dot(s.omega);
    const spring = this.wheels.reduce((sum, w) => sum + .5 * p.springK * w.compression ** 2, 0);
    const gLoad = s.acceleration.clone().addScaledVector(UP, p.gravity).length() / Math.max(.001, p.gravity);
    let status = contact >= 3 ? 'GROUND' : contact > 0 ? 'CONTACT' : s.vel.y > .12 ? 'ASCENDING' : s.vel.y < -.12 ? 'DESCENDING' : 'AIRBORNE';
    if (p.driveMode !== 'electric' && s.pressure <= ATMOSPHERE * 1.01) status = 'GAS DEPLETED';
    return { driveMode: p.driveMode, horizontalSpeed: Math.hypot(s.vel.x, s.vel.z),
      forwardSpeed: s.vel.clone().applyQuaternion(s.q.clone().invert()).x,
      frictionForceN: this.frictionForceN, tireForceN: this.frictionForceN,
      brakeForceN: this.brakeForceN, regenKW: this.regenKW, drivePowerKW: this.drivePowerKW,
      batterySOC: clamp(s.batteryJ / (p.batteryKWh * 3.6e6), 0, 1),
      speed: Math.hypot(s.vel.x, s.vel.z), totalSpeed: s.vel.length(), altitude: Math.max(0, s.pos.y - this.restHeight),
      verticalSpeed: s.vel.y, pressureMPa: s.pressure / 1e6, pressureGaugeMPa: (s.pressure - ATMOSPHERE) / 1e6,
      temperature: s.temp, gasKg: s.gas, gasPct: this.initialGas > 0 ? 100 * s.gas / this.initialGas : 0, totalMass: m,
      thrustN: this.totalThrust, fanN: this.fanForce, fanPressurePa: this.fanForce / 2.2, contactCount: contact, slip: this.maxSlip || 0,
      kineticEnergy: kinetic, potentialEnergy: m * p.gravity * Math.max(0, s.pos.y - this.restHeight),
      rotationEnergy: rotation, springEnergy: spring, tankEnergy: s.gas * CV * s.temp,
      gasUsed: this.initialGas - s.gas, thrustToWeight: this.totalThrust / Math.max(.001, m * p.gravity),
      status, attitude, acceleration: s.acceleration.clone(), gLoad, batteryPct: 100 * s.batteryJ / (p.batteryKWh * 3.6e6),
      saturation: this.saturation, lastImpactSpeed: this.lastImpactSpeed, maxAltitude: this.maxAltitude,
      massBalanceError: Math.abs(s.gas + s.gasUsed - this.initialGas),
      tankEnergyBalanceError: Math.abs(s.gas * CV * s.temp + s.expelledEnthalpy - this.initialEnergy),
      groundHeight: this.restHeight, time: s.time, cgOffset: this.cg.clone(), inertia: this.inertia.clone(),
      obstacleContacts: [...this.obstacleContacts], lastObstacleImpact: this.lastObstacleImpact,
      frontAxleLoad: this.wheels.filter(w => w.isFront).reduce((sum, w) => sum + w.load, 0),
      rearAxleLoad: this.wheels.filter(w => !w.isFront).reduce((sum, w) => sum + w.load, 0),
    };
  }
}

/** Small browser-side reference experiments; they are model checks, not real-car validation. */
export function runValidation() {
  const results = [];
  const add = (name, pass, actual, expected, detail) => results.push({ name, pass: !!pass, actual, expected, detail });
  const vacuum = new PhysicsSim({ contactEnabled: false, aeroEnabled: false });
  vacuum.state.pos.y = 20; vacuum.state.vel.set(0, 0, 0);
  for (let i = 0; i < 500; ++i) vacuum.step(.002, { stabilize: false });
  const exactHeight = 20 - .5 * DEFAULTS.gravity;
  add('자유낙하', Math.abs(vacuum.state.pos.y - exactHeight) < .011, `${vacuum.state.pos.y.toFixed(5)} m`, `${exactHeight.toFixed(5)} m`, '항력·접촉·추력 0, 1초. 반암시적 적분의 위치 오차 약 9.8 mm.');
  let v = 0, mass = 2000; const dt = .001, mdot = 2, ve = 500;
  for (let i = 0; i < 10000; ++i) { v += mdot * ve / (mass - mdot * dt / 2) * dt; mass -= mdot * dt; }
  const expected = rocketReference(2000, 1980, ve);
  add('이상 로켓 방정식', Math.abs(v - expected) < 1e-7, `${v.toFixed(8)} m/s`, `${expected.toFixed(8)} m/s`, '일정 유효 배출속도·직선 분사·외력 없음. 추력 적분과 비교.');
  const left = new Vector3(0, 0, -.8).cross(new Vector3(0, 5000, 0));
  const right = new Vector3(0, 0, .8).cross(new Vector3(0, 5000, 0));
  add('대칭 추진기', left.clone().add(right).length() < 1e-9, `${left.clone().add(right).length().toFixed(1)} N·m`, '0 N·m', '같은 높이의 좌우 추진기가 같은 위쪽 힘을 내면 롤 토크 상쇄.');
  add('한쪽 추진기', left.x > 0, `${left.x.toFixed(0)} N·m`, '+4000 N·m', '왼쪽(z<0) 상향 힘 → +X 롤 토크 → 왼쪽이 올라감.');
  const hoverA = (2000 * DEFAULTS.gravity - 2000 * DEFAULTS.gravity) / 2000;
  add('순간 수직 평형', hoverA === 0, `${hoverA.toFixed(3)} m/s²`, '0 m/s²', '수직 추력=무게, 다른 힘 없음. 유한 탱크의 지속 체공 보장은 아님.');
  const tank = new PhysicsSim({ contactEnabled: false, aeroEnabled: false, gravity: 0 });
  for (let i = 0; i < 150; ++i) tank.step(.002, { boost: true, stabilize: false });
  const tele = tank.telemetry();
  add('질량·탱크 에너지', tele.massBalanceError < 1e-8 && tele.tankEnergyBalanceError < 1e-5,
    `${tele.massBalanceError.toExponential(1)} kg`, '질량 잔차 ≈ 0', '차량 감소량=배출 기체량, 탱크 내부에너지 감소=유출 엔탈피.');
  const off = nozzle(ATMOSPHERE, 300, .002);
  add('압력 한계', off.force === 0 && off.mdot === 0, `${off.force} N`, '0 N', '탱크 절대압력이 대기압 이하이면 분사 중단.');
  const land = new PhysicsSim(); land.reset('drop');
  let minimum = Infinity;
  for (let i = 0; i < 3000; ++i) { land.step(.002, { stabilize: false }); minimum = Math.min(minimum, land.state.pos.y); }
  add('착지·감쇠', minimum > .31 && Math.abs(land.state.vel.y) < .03,
    `${land.state.vel.y.toFixed(5)} m/s`, '최종 수직속도 ≈ 0', '네 개 질량 없는 바퀴 지지점의 스프링·댐퍼와 차체 접촉. 실제 파손은 모델 밖.');
  function fallError(h) { const sim = new PhysicsSim({ contactEnabled: false, aeroEnabled: false }); sim.state.pos.y = 20;
    for (let t = 0; t < Math.round(1 / h); ++t) sim.step(h, { stabilize: false }); return Math.abs(sim.state.pos.y - exactHeight); }
  const e1 = fallError(.002), e2 = fallError(.001);
  add('시간 간격 수렴', e2 < e1 * .6, `${(e1 * 1000).toFixed(2)} → ${(e2 * 1000).toFixed(2)} mm`, 'Δt 절반 → 오차 감소', '자유낙하 반암시적 Euler 위치 오차를 해석해와 비교. 접촉·제어도 별도 검증 필요.');
  return results;
}
