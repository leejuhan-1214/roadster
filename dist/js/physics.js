import { Vector3, Quaternion, Euler } from 'three';
import {evaluateElectricDrive,accountDriveWork} from './electric-drive.js?v=20261107-drive2';
import {sampleRoadSurface,tireContactForces} from './road-surface.js?v=20261107-drive2';
import {LIFT_LAYOUT,BOOST_LAYOUT,BODY_ENVELOPE} from './vehicle-layout.js?v=20261107-drive2';
import {createObstacleIndex,queryObstacles} from './obstacle-index.js?v=20261109-city1';
import {preparePrism,containsFootprint,prismContact} from './city-building-collision.js?v=20261110-seoul1';
import {AIR_SYSTEM_DEFAULTS,rechargeAirTank,poweredGroundFan} from './air-systems.js?v=20261114-air1';

/** Educational six-DOF rigid-body model; NOT a Tesla digital twin.
 * Right-handed axes: X forward, Y up, Z right. Angular velocity is body-local.
 * Four massless wheel carriers lump tire/suspension compliance into corner springs.
 * Configurable fixed CG/principal inertia neglect expelled angular momentum and tank mass redistribution.
 * The ten-nozzle layout and all performance parameters are hypothetical.
 */
export const DEFAULTS = Object.freeze({
  ...AIR_SYSTEM_DEFAULTS,
  dryMass: 1900, tankVolume: .9, tankPressureMPa: 35.875, initialTemperature: 300,
  friction: 1.15, rollingResistance: .015, springK: 75000, damperC: 6000, fanMaxForce: 18000,
  motorPowerKW: 650, motorTorqueNm: 900, windX: 0, windZ: 0,
  gravity: 9.80665, dragScale: 1, valveTau: .03,
  wheelRadius: .36, wheelInertia: 2.6, gearRatio: 9, driveEfficiency: .94,
  batteryKWh: 200, roadRoughness:0, tractionControl:true, absEnabled:true, feedLossCoefficient:1000, contactEnabled: true, aeroEnabled: true,
  cgX: 0, cgY: 0, cgZ: 0, inertiaRoll: 900, inertiaYaw: 3400, inertiaPitch: 3500,
  wheelbase: 2.8, trackWidth: 1.88,
  bodyLength: BODY_ENVELOPE.half[0] * 2, bodyWidth: BODY_ENVELOPE.half[2] * 2,
  bodyHeight: BODY_ENVELOPE.half[1] * 2, bodyCenterY: BODY_ENVELOPE.center[1],
  liftX:LIFT_LAYOUT.x,liftY:LIFT_LAYOUT.y,liftZ:LIFT_LAYOUT.z,
  boostX:BOOST_LAYOUT.x,boostY:BOOST_LAYOUT.y,boostZ:BOOST_LAYOUT.z,
  yawX:1.35,yawY:0,yawZ:.87,
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
  tankVolume: ['탱크 체적', 'm³', '가정 · 비행 실험용 저장 용량, 실차 확정 사양 아님'],
  tankPressureMPa: ['초기 절대압력', 'MPa', '이상 공기 375 kg / 900 L / 300 K로 역산한 가정'],
  initialTemperature: ['초기 기체 온도', 'K', '실측값이 아닌 상온 가정'],
  friction: ['접지력 한도 μ', '—', '타이어가 전달할 수 있는 힘의 한도. 타력 감속 계수와 다름'],
  rollingResistance: ['구름저항 계수 Crr', '—', '가정 · 접지 하중에 비례하는 타력 주행 저항, μN 한도 안에서 적용'],
  springK: ['바퀴별 스프링 상수', 'N/m', '타이어와 서스펜션을 합친 가정값'],
  damperC: ['바퀴별 감쇠 계수', 'N·s/m', '선형 댐퍼 가정'],
  fanMaxForce: ['팬 최대 다운포스', 'N', '가정 · 차고·기울기에 따라 감소'],
  compressorPowerKW: ['공기 압축기 출력', 'kW', '가정 · 4단 중간 냉각 및 후냉각, 정차 중 배터리로 충전'],
  compressorEfficiency: ['압축기 단 효율', '—', '가정 · 등엔트로피 단 압축 일과 실제 전기 입력의 비'],
  compressorMaxFlowKgS: ['흡입 질량 유량 한도', 'kg/s', '가정 · 압력과 가용 전력에 따라 더 감소'],
  fanPowerKW: ['팬 정격 전력', 'kW', '가정 · 탱크가 아닌 배터리로 지면 흡착 팬 구동'],
  fanArea: ['흡착 유효 면적', 'm²', '가정 · 압력차 × 면적으로 다운포스 계산'],
  motorPowerKW: ['모터 최대 출력', 'kW', '가정 · 앞 1개·뒤 2개 모터 합산'],
  motorTorqueNm: ['모터 최대 토크', 'N·m', '가정 · 앞 1개·뒤 2개 모터 합산'],
  valveTau: ['밸브 응답 시정수', 's', '1차 지연 가정'],
};
const R = 287, GAMMA = 1.4, CV = R / (GAMMA - 1), CP = GAMMA * CV;
export const ATMOSPHERE = 101325;
const CRITICAL = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(1, 0, 0);
export const GIMBAL_LIMIT=25*Math.PI/180,GIMBAL_RATE=120*Math.PI/180;

// Fy is the body-Y component. Account for the moment of lateral thrust below CG.
export function allocateLift(vertical,tx,tz,direction,cg,maxima,layout=LIFT_LAYOUT){
 const gx=direction.x/direction.y,gz=direction.z/direction.y,h=layout.y-cg.y,a=layout.x,b=layout.z;
 const x=[a,a,-a,-a],z=[-b,b,-b,b],sign=[-1,1,1,-1];
 const support=x.map((xi,i)=>.25+z[i]*(cg.z+h*gz)/(4*b*b)+xi*(cg.x+h*gx)/(4*a*a));
 const moment=x.map((xi,i)=>-z[i]*tx/(4*b*b)+xi*tz/(4*a*a));
 const caps=maxima.map(f=>f*direction.y);
 const bounded=(v,torqueScale=1)=>{
  const f=moment.map((m,i)=>m*torqueScale+support[i]*v);let lo=-Infinity,hi=Infinity;
  for(let i=0;i<4;i++){const aa=-f[i]/sign[i],bb=(caps[i]-f[i])/sign[i];lo=Math.max(lo,Math.min(aa,bb));hi=Math.min(hi,Math.max(aa,bb));}
  if(lo<=hi+1e-9){const lambda=clamp(0,lo,hi);return f.map((n,i)=>clamp(n+sign[i]*lambda,0,caps[i]));}
  return null;
 };
 let v=Math.max(0,vertical),forces=bounded(v),saturated=false;
 if(!forces){
  // Positive-only RCS needs some collective lift when a torque is requested at V=0.
  let needed=v;for(let i=0;i<4;i++)if(support[i]>1e-9)needed=Math.max(needed,-moment[i]/support[i]);
  forces=bounded(needed);
  if(!forces){
   // Preserve balanced force ratios when pressure cannot meet collective demand.
   // Uniformly reduce the requested wrench instead of clipping one nozzle and tipping.
   saturated=true;let low=0,high=1;forces=bounded(0,0);
   for(let k=0;k<24;k++){const scale=(low+high)/2,candidate=bounded(needed*scale,scale);if(candidate){low=scale;forces=candidate;}else high=scale;}
  }
 }
 const thrust=forces.map(f=>f/direction.y);
 const yawTorque=forces.reduce((sum,f,i)=>sum+((z[i]-cg.z)*gx-(x[i]-cg.x)*gz)*f,0);
 return {thrust,yawTorque,saturated};
}
const BOX_AXES = [new Vector3(1,0,0), new Vector3(0,1,0), new Vector3(0,0,1)];

// Oriented chassis box versus a static axis-aligned obstacle. This is a contact
// envelope, not the render mesh, tire deformation, or structural damage model.
function boxContact(sim, obstacle) {
  if(obstacle.footprint)return prismContact(sim,obstacle);
  const {pos,q}=sim.state;
  const BODY_HALF=sim.bodyHalf, BODY_BOX_CENTER=sim.bodyBoxCenter;
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
 * Pa absolute; K; m². Inlet is the supplied stagnation state; feed-line loss is applied upstream (Cd=1).
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
  for (const x of [LIFT_LAYOUT.x, -LIFT_LAYOUT.x]) for (const z of [-LIFT_LAYOUT.z, LIFT_LAYOUT.z])
    result.push({ name: `${x > 0 ? '전' : '후'}${z < 0 ? '좌' : '우'} 수직`, group: 'lift',
      pos: new Vector3(x, LIFT_LAYOUT.y, z), dir: new Vector3(0, 1, 0), area: .00035 });
  for (const z of [-BOOST_LAYOUT.z, BOOST_LAYOUT.z]) result.push({ name: z < 0 ? '후방 좌 추진' : '후방 우 추진', group: 'boost',
    pos: new Vector3(BOOST_LAYOUT.x, BOOST_LAYOUT.y, z), dir: new Vector3(1, 0, 0), area: .00025 });
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
    this.bodyHalf = [...BODY_ENVELOPE.half];
    this.bodyBoxCenter = new Vector3(...BODY_ENVELOPE.center);
    this.obstacles = [];
    this.baseObstacles = this.obstacles;
    this.obstacleChunks = new Map();
    this.obstacleIndex = createObstacleIndex(this.obstacles);
    this.wheels = [];
    for (const x of [1.4, -1.4]) for (const z of [-.94, .94]) this.wheels.push({
      name: `${x > 0 ? '전' : '후'}${z < 0 ? '좌' : '우'}`, pos: new Vector3(x, -.31, z),
      compression: 0, omega: 0, load: 0, slip: 0, steer: 0, grounded: false,
    });
    this.inertia = new Vector3(900, 3400, 3500);
    this.gimbalX=0;this.gimbalZ=0;this.gimbalDirection=new Vector3(0,1,0);
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
    // Per-vehicle contact envelope in the same body coordinates as the wheel mounts.
    // Dimensions are collision approximations, independent of the visual mesh.
    for (const [key,min,max] of [['bodyLength',1,8],['bodyWidth',.5,3],['bodyHeight',.3,4],['bodyCenterY',-2,2]]) {
      const value=Number(p[key]);
      p[key]=clamp(Number.isFinite(value)?value:DEFAULTS[key],min,max);
    }
    this.bodyHalf=[p.bodyLength/2,p.bodyHeight/2,p.bodyWidth/2];
    this.bodyBoxCenter.set(0,p.bodyCenterY,0);
    this.cg.set(p.cgX, p.cgY, p.cgZ);
    this.inertia.set(p.inertiaRoll, p.inertiaYaw, p.inertiaPitch);
    this.wheels.forEach((w, i) => {
      w.pos.set(i < 2 ? p.wheelbase / 2 : -p.wheelbase / 2, -.31, i % 2 ? p.trackWidth / 2 : -p.trackWidth / 2).sub(this.cg);
      w.isFront = i < 2;
    });
    this.gimbalX=0;this.gimbalZ=0;this.gimbalDirection.set(0,1,0);
    for(const key of ['liftX','liftY','liftZ','boostX','boostY','boostZ','yawX','yawY','yawZ']){
      const value=Number(p[key]);p[key]=clamp(Number.isFinite(value)?value:DEFAULTS[key],key.endsWith('Y')?-1.5:key==='boostX'?-4:.15,key.endsWith('Y')?1.5:key==='boostX'?-.15:3);
    }
    this.liftLayout={x:p.liftX,y:p.liftY,z:p.liftZ};
    this.thrusters.forEach((t,i)=>{
      if(i<4)t.mountPosition.set(i<2?p.liftX:-p.liftX,p.liftY,i%2?p.liftZ:-p.liftZ);
      else if(i<6)t.mountPosition.set(p.boostX,p.boostY,i%2?p.boostZ:-p.boostZ);
      else t.mountPosition.set(i%2?-p.yawX:p.yawX,p.yawY,(i===6||i===9)?p.yawZ:-p.yawZ);
      t.pos.copy(t.mountPosition).sub(this.cg);if(t.group==='lift')t.dir.set(0,1,0);
    });
    const gas = p.tankPressureMPa * 1e6 * p.tankVolume / (R * p.initialTemperature);
    this.initialGas = gas;
    this.initialEnergy = gas * CV * p.initialTemperature;
    this.restHeight = .31 + p.wheelRadius + this.cg.y - (p.dryMass + gas) * p.gravity / (4 * p.springK);
    this.state = { pos: new Vector3(this.cg.x, this.restHeight, this.cg.z), vel: new Vector3(),
      q: new Quaternion(), omega: new Vector3(), gas, temp: p.initialTemperature,
      pressure: p.tankPressureMPa * 1e6, time: 0, batteryJ: p.batteryKWh * 3.6e6,
      acceleration: new Vector3(), gasUsed: 0, expelledEnthalpy: 0,
      gasRefilledKg:0, inletEnthalpyJ:0, tankHeatOutJ:0, compressorEnergyJ:0,
    };
    if (preset === 'drop') this.state.pos.y += 3;
    if (preset === 'flight') { this.state.pos.y += 1.8; this.state.vel.x = 8; }
    if (preset === 'corner') this.state.vel.x = 12;
    if (preset === 'rolling') this.state.vel.x = 20;
    this.contactCount = preset === 'drop' || preset === 'flight' ? 0 : 4;
    this.fanForce = 0; this.totalThrust = 0; this.maxThrust = 0;
    this.fanPowerW=0;this.fanPressurePa=0;this.fanAirflowM3S=0;this.fanSeal=0;
    this.compressorState='off';this.compressorPowerW=0;this.compressorFlowKgS=0;this.compressorHeatW=0;this.tankHeatW=0;
    this.saturation = false; this.lastImpactSpeed = 0; this.impactImpulse = 0;
    this.groundForceN=0;this.groundCorrectionImpulseNs=0;this.bodyGroundContacts=0;
    this.preStepVelocityY=0;this.resolvedAcceleration=new Vector3();this.stepDuration=0;
    this.maxAltitude = 0; this.lastContactCount = this.contactCount; this.maxG = 1;
    this.lastInput = {}; this.lastForce = new Vector3(); this.lastTorque = new Vector3();
    this.frictionForceN = 0; this.brakeForceN = 0; this.airDragN = 0; this.rollingResistanceN = 0;
    this.handbrakeAmount=0;this.handbrakeForceN=0;
    this.motorState=evaluateElectricDrive({wheelOmega:[0,0,0,0],throttle:0,brake:0,batteryEnergyJ:this.state.batteryJ,dt:.002},p);
    this.manifoldPressure=this.state.pressure;this.massFlowKgS=0;this.electricPowerW=0;this.regenPowerW=0;this.driveLossW=0;this.tractionCut=1;
    this.history = [];
    this.obstacleContacts = []; this.lastObstacleImpact = null; this.collisionCount=0;
    for (const w of this.wheels) { w.forceX=0;w.forceY=0;w.forceZ=0;w.normalX=0;w.normalY=1;w.normalZ=0;w.sliding=false;w.absFactor=1;w.tireForceN=0; w.compression = this.contactCount ? .31 + p.wheelRadius + this.cg.y - this.restHeight : 0;
      w.omega = preset === 'corner' ? 12 / p.wheelRadius : preset === 'rolling' ? 20 / p.wheelRadius : 0; w.load = this.contactCount ? (p.dryMass + gas) * p.gravity / 4 : 0;
      w.spinAngle = 0; w.rollingResistanceN = 0; w.tireForceN = 0; w.driveTorque = 0; w.brakeTorque = 0; w.handbrakeTorque = 0; w.slip = 0; w.steer = 0; w.grounded = this.contactCount > 0; }
    for (const t of this.thrusters) { t.force = 0; t.maxForce = nozzle(this.state.pressure, this.state.temp, t.area).force; t.opening = 0; t.command = 0; t.mdot = 0; }
    return this.state;
  }

  /** Static stage collision boxes. Reset preserves this course; [] restores the empty test pad. */
  setObstacles(boxes = []) {
    const obstacles=this._prepareObstacles(boxes);
    this.baseObstacles=obstacles;
    this.obstacles=obstacles;
    this.obstacleIndex=createObstacleIndex(obstacles);
    this.obstacleChunks.clear();
    this.obstacleContacts=[];this.lastObstacleImpact=null;
  }

  _prepareObstacles(boxes) {
    if(!Array.isArray(boxes))throw new TypeError('Obstacles must be an array.');
    return boxes.map((box,i)=>{
      if(!Array.isArray(box.center)||!Array.isArray(box.size)||box.center.length!==3||box.size.length!==3||
         !box.center.every(Number.isFinite)||!box.size.every(n=>Number.isFinite(n)&&n>0))
        throw new TypeError('Each obstacle needs finite center[3] and positive size[3].');
      const center=new Vector3(...box.center),half=new Vector3(...box.size).multiplyScalar(.5);
      const footprint=box.kind==='prism'||box.footprint?preparePrism(box):null;
      if(footprint){
        const xs=footprint.map(p=>p[0]),zs=footprint.map(p=>p[1]);
        center.x=(Math.min(...xs)+Math.max(...xs))/2;center.z=(Math.min(...zs)+Math.max(...zs))/2;
        half.x=(Math.max(...xs)-Math.min(...xs))/2;half.z=(Math.max(...zs)-Math.min(...zs))/2;
      }
      return {id:box.id??String(i),treeId:box.treeId??null,center,half,footprint,min:center.clone().sub(half),max:center.clone().add(half)};
    });
  }

  /** Register one immutable streamed tile, leaving the core and other grids intact.
   * Call before attaching the corresponding mesh. Replacement is atomic: malformed
   * data leaves the previous tile active, and contacts/history survive streaming.
   */
  setObstacleChunk(key,boxes) {
    if(typeof key!=='string'||!key)throw new TypeError('An obstacle chunk needs a nonempty string key.');
    const previous=this.obstacleChunks.get(key);
    if(previous&&previous.source===boxes)return false;
    const obstacles=this._prepareObstacles(boxes),index=createObstacleIndex(obstacles);
    const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
    for(const box of obstacles){
      bounds.minX=Math.min(bounds.minX,box.min.x);bounds.maxX=Math.max(bounds.maxX,box.max.x);
      bounds.minZ=Math.min(bounds.minZ,box.min.z);bounds.maxZ=Math.max(bounds.maxZ,box.max.z);
    }
    this.obstacleChunks.set(key,{source:boxes,obstacles,index,bounds});
    this._refreshObstacleList();return true;
  }

  removeObstacleChunk(key) {
    if(!this.obstacleChunks.delete(key))return false;
    this._refreshObstacleList();return true;
  }

  _refreshObstacleList() {
    // This lightweight reference list is for inspection/counts. Prepared prisms,
    // vectors and spatial bins are retained; only the changed tile is rebuilt.
    this.obstacles=this.baseObstacles.concat(...[...this.obstacleChunks.values()].map(chunk=>chunk.obstacles));
  }

  _obstaclesNear(x,z,radius=0) {
    let result=queryObstacles(this.obstacleIndex,x,z,radius);
    for(const chunk of this.obstacleChunks.values()){
      const b=chunk.bounds;
      if(x+radius<b.minX||x-radius>b.maxX||z+radius<b.minZ||z-radius>b.maxZ)continue;
      const nearby=queryObstacles(chunk.index,x,z,radius);
      if(nearby.length)result=result.concat(nearby);
    }
    return result;
  }

  /** Highest horizontal supporting surface below this wheel/fan reference point. */
  surfaceHeightAt(x,z,referenceY=Infinity) {
    let height=sampleRoadSurface(x,z,{roughness:this.params.roadRoughness}).height;
    for(const box of this._obstaclesNear(x,z))if(x>=box.min.x&&x<=box.max.x&&z>=box.min.z&&z<=box.max.z&&
      box.max.y<=referenceY+.10&&box.max.y>height&&(!box.footprint||containsFootprint(box.footprint,x,z)))height=box.max.y;
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
    const BODY_HALF=this.bodyHalf, BODY_BOX_CENTER=this.bodyBoxCenter;
    this.lastInput = input;
    const velocityBefore=s.vel.clone();this.preStepVelocityY=s.vel.y;this.stepDuration=dt;
    // Refilling is an explicit parked operation. Intaking ambient air increases
    // mass and consumes battery energy; it never replenishes a live nozzle.
    const dischargeLimitW=Math.max(0,Number.isFinite(p.batteryMaxDischargeKW)?p.batteryMaxDischargeKW:800)*1000;
    let blocked=null;
    if(input.compressor){
      const intakeUp=UP.clone().applyQuaternion(s.q),intakeSurface=this.surfaceHeightAt(s.pos.x,s.pos.z,s.pos.y-this.restHeight);
      const flyingIntent=input.boost||input.lift>0||input.altHold||Number.isFinite(input.verticalAcceleration)||input.airMoveForward||input.airMoveRight||input.pitch||input.roll||input.yaw||input.thrusterCommands?.some(x=>x>0);
      const nozzleActive=this.thrusters.some(t=>t.opening>1e-8||t.mdot>1e-8);
      blocked=this.contactCount<3||!p.contactEnabled||s.pos.y-this.restHeight-intakeSurface>.1||intakeUp.y<.95?'airborne':
        flyingIntent||nozzleActive?'thrusters':s.vel.length()>.15||s.omega.length()>.1||Math.abs(input.throttle||0)>.001?'moving':null;
    }
    const refill=rechargeAirTank(s,p,dt,{enabled:!!input.compressor,blockReason:blocked,capacityKg:this.initialGas,powerBudgetW:dischargeLimitW});
    if(refill.addedKg>0){
      // Inelastic capture of ambient air. Intake momentum follows the configured
      // wind; with no wind the small permitted parking velocity is diluted.
      const oldVehicleMass=this.mass,newVehicleMass=oldVehicleMass+refill.addedKg;
      s.vel.multiplyScalar(oldVehicleMass/newVehicleMass);
      s.vel.addScaledVector(new Vector3(p.windX||0,0,p.windZ||0),refill.addedKg/newVehicleMass);
    }
    s.gas=refill.gas;s.temp=refill.temp;s.pressure=refill.pressure;
    s.gasRefilledKg+=refill.addedKg;s.inletEnthalpyJ+=refill.inletEnthalpyJ;s.tankHeatOutJ+=refill.tankHeatOutJ;
    s.compressorEnergyJ+=refill.powerW*dt;
    this.compressorState=refill.status;this.compressorPowerW=refill.powerW;this.compressorFlowKgS=refill.addedKg/dt;
    this.compressorHeatW=refill.aftercoolerHeatJ/dt;this.tankHeatW=refill.tankHeatOutJ/dt;
    const mass = this.mass, gravity = Math.max(0, p.gravity);
    this.groundForceN=0;this.groundCorrectionImpulseNs=0;this.bodyGroundContacts=0;
    this.inertia.set(p.inertiaRoll, p.inertiaYaw, p.inertiaPitch);
    const qInv = s.q.clone().invert();
    const omegaWorld = s.omega.clone().applyQuaternion(s.q);
    const bodyUp = UP.clone().applyQuaternion(s.q);
    const force = new Vector3(0, -mass * gravity, 0), torqueWorld = new Vector3();
    const applyAt = (f, r) => { force.add(f); torqueWorld.add(new Vector3().crossVectors(r, f)); };
    const bodyVelocity = s.vel.clone().applyQuaternion(qInv);

    // Direct blowdown: pressure falls with the tank, and flow adds a supply-line loss.
    const oldFlow=this.thrusters.reduce((sum,t)=>sum+t.mdot,0);
    this.manifoldPressure=Math.max(ATMOSPHERE,s.pressure-Math.max(0,p.feedLossCoefficient)*oldFlow*oldFlow);
    const layoutMaximum = this.thrusters.map(t => nozzle(this.manifoldPressure, s.temp, t.area));
    for (let i = 0; i < this.thrusters.length; ++i) this.thrusters[i].maxForce = layoutMaximum[i].force;
    const isAirborne = this.contactCount === 0;
    const enabledControl = isAirborne || input.lift > .01 || input.altHold || Number.isFinite(input.verticalAcceleration);
    const forward = FORWARD.clone().applyQuaternion(s.q);
    const heading = Math.atan2(-forward.z, forward.x);
    const yawTarget = new Quaternion().setFromAxisAngle(UP, heading);
    let moveForward=isAirborne?clamp(input.airMoveForward||0,-1,1):0;
    let moveRight=isAirborne?clamp(input.airMoveRight||0,-1,1):0;
    const moveLength=Math.hypot(moveForward,moveRight);
    if(moveLength>1){moveForward/=moveLength;moveRight/=moveLength;}
    const airMoveActive=moveLength>1e-5;
    // WASD steers the nozzles, while the attitude target remains level at current heading.
    // A bounded actuator moves continuously; it cannot alter the body's pose or velocity.
    const oldGx=this.gimbalDirection.x/this.gimbalDirection.y,oldGz=this.gimbalDirection.z/this.gimbalDirection.y;
    const targetX=GIMBAL_LIMIT*moveForward,targetZ=GIMBAL_LIMIT*moveRight;
    const deltaX=targetX-this.gimbalX,deltaZ=targetZ-this.gimbalZ,delta=Math.hypot(deltaX,deltaZ);
    const fraction=delta>0?Math.min(1,GIMBAL_RATE*dt/delta):0;
    this.gimbalX+=deltaX*fraction;this.gimbalZ+=deltaZ*fraction;
    const angle=Math.hypot(this.gimbalX,this.gimbalZ),sine=angle>1e-12?Math.sin(angle)/angle:1;
    this.gimbalDirection.set(this.gimbalX*sine,Math.cos(angle),this.gimbalZ*sine);
    for(let i=0;i<4;i++)this.thrusters[i].dir.copy(this.gimbalDirection);
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
      const liftWorldY=this.gimbalDirection.clone().applyQuaternion(s.q).y;
      vertical = mass * Math.max(0, gravity + aDesired) * this.gimbalDirection.y / Math.max(.3, liftWorldY);
    }
    // Landing experiments request acceleration, never pose or velocity changes.
    // The same allocation, finite tank, valve lag and force limits still apply.
    if(Number.isFinite(input.verticalAcceleration)){
      const aDesired=clamp(input.verticalAcceleration,-gravity,1.1*Math.max(gravity,1));
      const liftWorldY=this.gimbalDirection.clone().applyQuaternion(s.q).y;
      vertical=mass*Math.max(0,gravity+aDesired)*this.gimbalDirection.y/Math.max(.3,liftWorldY);
    }
    // Anticipate the first-order valve lag while the swivel changes direction.
    // Only force distribution changes; body attitude remains a result of r × F.
    const lead=Math.max(.001,Number(p.valveTau)||.03)*(p.liftY-this.cg.y)*vertical/dt;
    tx-=lead*(this.gimbalDirection.z/this.gimbalDirection.y-oldGz);
    tz+=lead*(this.gimbalDirection.x/this.gimbalDirection.y-oldGx);
    const allocation=allocateLift(vertical,tx,tz,this.gimbalDirection,this.cg,layoutMaximum.slice(0,4).map(n=>n.force),this.liftLayout);
    // Parallel lift vectors couple yaw to roll/pitch. Side RCS counters that moment.
    const yawRequest=ty-allocation.yawTorque;
    const desiredForces = [...allocation.thrust, input.boost ? layoutMaximum[4].force : 0, input.boost ? layoutMaximum[5].force : 0,
      Math.max(0, yawRequest) / (2*p.yawX), Math.max(0, yawRequest) / (2*p.yawX), Math.max(0, -yawRequest) / (2*p.yawX), Math.max(0, -yawRequest) / (2*p.yawX)];
    // Educational per-nozzle override, still constrained by valve lag and tank state.
    if (Array.isArray(input.thrusterCommands)) for (let i = 0; i < desiredForces.length; ++i)
      desiredForces[i] = clamp(input.thrusterCommands[i] || 0, 0, 1) * layoutMaximum[i].force;
    this.saturation = allocation.saturated; this.totalThrust = 0; this.maxThrust = 0;
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
    s.gasUsed += dm;this.massFlowKgS=totalFlow*flowScale;

    // Anisotropic body drag, relative wind, and aerodynamic surface moment.
    const relative = s.vel.clone().sub(new Vector3(p.windX || 0, 0, p.windZ || 0)).applyQuaternion(qInv);
    this.airDragN = 0;
    if (p.aeroEnabled) {
      const rho = 1.225, aeroScale = Math.max(0, p.dragScale);
      const aero = new Vector3(-.5 * rho * .50 * relative.x * Math.abs(relative.x),
        -.5 * rho * 3.4 * relative.y * Math.abs(relative.y), -.5 * rho * 1.6 * relative.z * Math.abs(relative.z)).multiplyScalar(aeroScale);
      this.airDragN = aero.length();
      applyAt(aero.applyQuaternion(s.q), new Vector3(-.12, .06, 0).sub(this.cg).applyQuaternion(s.q));
      if (input.wing) {
        const wing = new Vector3(-.5 * rho * .18 * relative.x * Math.abs(relative.x), -.5 * rho * 1.3 * relative.x ** 2, 0).multiplyScalar(aeroScale);
        applyAt(wing.applyQuaternion(s.q), new Vector3(-1.68, .48, 0).sub(this.cg).applyQuaternion(s.q));
      }
      const airRateTorque = s.omega.clone().multiply(new Vector3(-22, -55, -55)).multiplyScalar(aeroScale * Math.max(1, relative.length() * .08)).applyQuaternion(s.q);
      torqueWorld.add(airRateTorque);
    }

    // Fan pressure force vanishes rapidly when the ground seal opens.
    let electricPower = this.compressorPowerW;
    this.fanForce = 0;
    this.fanPowerW=0;this.fanPressurePa=0;this.fanAirflowM3S=0;this.fanSeal=0;
    if(input.fan){
      const fanSurface=this.surfaceHeightAt(s.pos.x,s.pos.z,s.pos.y-this.restHeight);
      const clearance = Math.max(0, s.pos.y - this.restHeight - fanSurface);
      const fan=poweredGroundFan({enabled:!!input.fan,clearance,upY:bodyUp.y,dt,
        batteryJ:Math.max(0,s.batteryJ-electricPower*dt),powerBudgetW:Math.max(0,dischargeLimitW-electricPower)},p);
      this.fanForce=fan.forceN;this.fanPowerW=fan.powerW;this.fanPressurePa=fan.pressurePa;this.fanAirflowM3S=fan.airflowM3S;this.fanSeal=fan.seal;
      electricPower+=fan.powerW;
      applyAt(bodyUp.clone().multiplyScalar(-this.fanForce), new Vector3(-.10, -.25, 0).sub(this.cg).applyQuaternion(s.q));
    }

    this.lastContactCount = this.contactCount;
    this.contactCount = 0;
    let steering = clamp(input.steer || 0, -1, 1) * .52 / (1 + Math.abs(bodyVelocity.x) / 28);
    const brakeAmount = clamp(input.brake || 0, 0, 1);
    // The city handbrake acts on rear wheel rotation, not on vehicle velocity
    // or yaw. Service braking has priority. It deliberately bypasses ABS, so
    // a locked rear tire spends its friction budget opposing longitudinal
    // slip and has less lateral authority through the same tire model.
    const handbrakeTarget=brakeAmount>0?0:clamp(input.handbrake||0,0,1);
    const handbrakeAmount=handbrakeTarget>0?(this.handbrakeAmount||0)+(handbrakeTarget-(this.handbrakeAmount||0))*(1-Math.exp(-dt/.08)):0;
    this.handbrakeAmount=handbrakeAmount;this.handbrakeForceN=0;
    const throttle = brakeAmount > 0 ? 0 : clamp(input.throttle || 0, -1, 1);
    const tireResultant = new Vector3();
    this.brakeForceN=0;this.rollingResistanceN=0;let maxSlip=0;
    // TCS limits torque when the wheel is outrunning the road, separately from friction.
    const spinning=Math.max(0,...this.wheels.map(w=>(w.slip||0)*Math.sign(throttle)));
    this.tractionCut=p.tractionControl!==false&&Math.abs(throttle)>0&&(throttle*bodyVelocity.x>=0||Math.abs(bodyVelocity.x)<.5)?clamp(1-(spinning-.14)*2.2,.12,1):1;
    const coastBrake=input.coastRegen&&this.lastContactCount>0&&Math.abs(throttle)<.01&&brakeAmount===0?.25:0;
    for(const w of this.wheels){const target=p.absEnabled!==false&&Math.max(brakeAmount,coastBrake)>0&&Math.abs(bodyVelocity.x)>2?clamp(1+((w.slip||0)*Math.sign(bodyVelocity.x)+.16)*7,.08,1):1;w.absFactor+=(target-w.absFactor)*(1-Math.exp(-dt/.025));}
    const absScale=Math.min(...this.wheels.map(w=>w.absFactor));
    const oldWheelOmega=this.wheels.map(w=>w.omega);
    const wheelOmegaBound=this.wheels.map(w=>Math.max(Math.abs(w.omega),s.vel.clone().add(new Vector3().crossVectors(omegaWorld,w.pos.clone().applyQuaternion(s.q))).length()/p.wheelRadius));
    const driveParameters=electricPower>0?{...p,batteryMaxDischargeKW:Math.max(0,dischargeLimitW-electricPower)/1000}:p;
    const drive=evaluateElectricDrive({wheelOmega:oldWheelOmega,wheelOmegaBound,throttle:throttle*this.tractionCut,brake:Math.max(brakeAmount,coastBrake)*absScale,batteryEnergyJ:Math.max(0,s.batteryJ-electricPower*dt),dt},driveParameters);
    for(let index=0;index<this.wheels.length;index++){
      const wheel=this.wheels[index],rCenter=wheel.pos.clone().applyQuaternion(s.q),worldCenter=s.pos.clone().add(rCenter);
      const cornerVel=s.vel.clone().add(new Vector3().crossVectors(omegaWorld,rCenter));
      const road=sampleRoadSurface(worldCenter.x,worldCenter.z,{roughness:p.roadRoughness});
      const surfaceY=this.surfaceHeightAt(worldCenter.x,worldCenter.z,worldCenter.y);
      const n=surfaceY>road.height+1e-8?UP.clone():new Vector3(...road.normal);
      wheel.surfaceY=surfaceY;wheel.normalX=n.x;wheel.normalY=n.y;wheel.normalZ=n.z;
      const compression=Math.max(0,p.wheelRadius-(worldCenter.y-surfaceY)*n.y);
      wheel.compression=compression;wheel.grounded=!!p.contactEnabled&&compression>0;
      const centreRadius=Math.abs(steering)>1e-7?p.wheelbase/Math.tan(Math.abs(steering)):Infinity;
      const mountZ=wheel.pos.z+this.cg.z,wheelRadiusToTurn=centreRadius+Math.sign(steering)*mountZ;
      wheel.steer=wheel.isFront?Math.sign(steering)*Math.atan(p.wheelbase/wheelRadiusToTurn):0;
      const normal=wheel.grounded?Math.max(0,p.springK*compression-p.damperC*cornerVel.dot(n)+900000*Math.max(0,compression-.22)**1.35):0;
      wheel.load=normal;if(normal>0)this.contactCount++;
      this.groundForceN+=normal*n.y;
      const fwd=new Vector3(Math.cos(wheel.steer),0,-Math.sin(wheel.steer)).applyQuaternion(s.q);fwd.addScaledVector(n,-fwd.dot(n)).normalize();
      const right=new Vector3().crossVectors(fwd,n).normalize(),ux=cornerVel.dot(fwd),uy=cornerVel.dot(right);
      const driveTorque=drive.wheelTorqueNm[index];
      const rearHandbrake=wheel.isFront?0:handbrakeAmount*5200;
      const frictionBrake=Math.max(0,brakeAmount*wheel.absFactor*3100-Math.abs(drive.wheelRegenTorqueNm[index]))+rearHandbrake;
      const omegaFor=fx=>{let omega=wheel.omega+(driveTorque-fx*p.wheelRadius-.025*wheel.omega)/p.wheelInertia*dt;return Math.sign(omega)*Math.max(0,Math.abs(omega)-frictionBrake/p.wheelInertia*dt);};
      const profile=p.friction<=.2?'ice':p.friction<=.7?'wet':'dry';
      const atForce=fx=>{const speed=(wheel.omega+omegaFor(fx))*.5*p.wheelRadius;return tireContactForces({surface:profile,normalLoad:normal,grounded:wheel.grounded,muPeak:Math.max(0,p.friction),rollingResistance:p.rollingResistance,forwardSpeed:ux,slipRatio:(speed-ux)/Math.max(2.5,Math.abs(ux),Math.abs(speed)),slipAngle:Math.atan2(uy,Math.max(3,Math.abs(ux))),longitudinalStiffness:120000,corneringStiffness:70000});};
      // Implicit wheel reaction makes realistic high slip stiffness stable at 500 Hz.
      let lo=-Math.max(0,p.friction)*normal,hi=-lo;
      for(let k=0;k<(Math.abs(ux)<2?20:14)&&normal>0&&p.friction>0;k++){const mid=(lo+hi)*.5;const residual=mid-atForce(mid).fx;if(Math.abs(residual)<1e-7){lo=hi=mid;break;}if(residual>0)hi=mid;else lo=mid;}
      const tire=atForce((lo+hi)*.5),fx=tire.fx,fy=tire.fy,rolling=tire.rolling;
      const nextOmega=omegaFor(fx),patchSpeed=(wheel.omega+nextOmega)*.5*p.wheelRadius;
      wheel.slip=wheel.grounded?(patchSpeed-ux)/Math.max(2.5,Math.abs(ux),Math.abs(patchSpeed)):0;
      wheel.sliding=wheel.grounded&&(tire.sliding||Math.abs(wheel.slip)>.2);maxSlip=Math.max(maxSlip,Math.abs(wheel.slip));
      wheel.rollingResistanceN=Math.abs(rolling);this.rollingResistanceN+=wheel.rollingResistanceN;wheel.tireForceN=tire.magnitude;
      const contactForce=fwd.clone().multiplyScalar(fx+rolling).addScaledVector(right,fy);
      wheel.forceX=contactForce.x;wheel.forceY=contactForce.y;wheel.forceZ=contactForce.z;
      if(normal>0){tireResultant.add(contactForce);const lever=new Vector3(rCenter.x,surfaceY-s.pos.y,rCenter.z);applyAt(contactForce.clone().addScaledVector(n,normal),lever);}
      if((brakeAmount>0||rearHandbrake>0)&&normal>0){
        const brakingForce=Math.max(0,-fx*Math.sign(ux));this.brakeForceN+=brakingForce;
        if(rearHandbrake>0)this.handbrakeForceN+=brakingForce;
      }
      wheel.driveTorque=drive.wheelDriveTorqueNm[index];wheel.regenTorque=drive.wheelRegenTorqueNm[index];wheel.brakeTorque=frictionBrake;wheel.handbrakeTorque=rearHandbrake;
      wheel.omega=nextOmega;wheel.spinAngle+=nextOmega*dt;
    }
    this.frictionForceN=tireResultant.length();this.maxSlip=maxSlip;
    const work=accountDriveWork(drive,oldWheelOmega,this.wheels.map(w=>w.omega),dt,p);
    electricPower+=work.electricalEnergyJ/dt;this.electricPowerW=electricPower;this.regenPowerW=Math.max(0,-work.electricalEnergyJ/dt);this.driveLossW=work.lossEnergyJ/dt;
    this.motorState=drive;for(let i=0;i<drive.motors.length;i++){drive.motors[i].electricalPowerW=work.perMotor[i].electricalEnergyJ/dt;drive.motors[i].shaftPowerW=work.perMotor[i].shaftWorkJ/dt;}
    s.batteryJ=clamp(s.batteryJ-electricPower*dt,0,p.batteryKWh*3.6e6);

    // Body skid contact is separate from suspension; forces and impulses are explicit.
    if (p.contactEnabled) {
      for (const x of [-BODY_HALF[0], BODY_HALF[0]]) for (const y of [BODY_BOX_CENTER.y-BODY_HALF[1], BODY_BOX_CENTER.y+BODY_HALF[1]]) for (const z of [-BODY_HALF[2], BODY_HALF[2]]) {
        const r = new Vector3(x, y, z).sub(this.cg).applyQuaternion(s.q);
        const penetration = .006 - (s.pos.y + r.y);
        if (penetration > 0) {
          const contactVel = s.vel.clone().add(new Vector3().crossVectors(omegaWorld, r));
          const normal = Math.max(0, 420000 * penetration - 6500 * contactVel.y);
          this.groundForceN+=normal;this.bodyGroundContacts++;
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
    if (p.contactEnabled) { this._resolveBrakeStick(dt,input); this._resolveObstacles(); this._resolveGround(); }
    this.resolvedAcceleration.copy(s.vel).sub(velocityBefore).divideScalar(dt);
    s.time += dt; s.acceleration.copy(acceleration);
    this.lastForce.copy(force); this.lastTorque.copy(torqueBody);
    this.maxAltitude = Math.max(this.maxAltitude, s.pos.y - this.restHeight);
    if (this.lastContactCount === 0 && this.contactCount > 0) this.lastImpactSpeed = Math.abs(s.vel.y - acceleration.y * dt);
    this.maxG = Math.max(this.maxG, acceleration.clone().addScaledVector(UP, gravity).length() / Math.max(gravity, .001));
  }

  _resolveBrakeStick(dt,input) {
    // A held brake can sustain static friction at near-zero contact speed.
    // Project impulses into each tire's remaining Coulomb/brake budget instead
    // of zeroing the vehicle velocity (which would also stop it on ice/in air).
    const s=this.state,p=this.params;
    if(!(input.brake>0)||!(p.friction>0)||Math.hypot(s.vel.x,s.vel.z)>.5)return;
    const qi=s.q.clone().invert(),inverseMass=1/this.mass;
    const contacts=this.wheels.filter(w=>w.load>1&&Math.abs(w.omega*p.wheelRadius)<.1).map(w=>{
      const r=w.pos.clone().applyQuaternion(s.q);r.y=w.surfaceY-s.pos.y;
      const normal=new Vector3(w.normalX,w.normalY,w.normalZ);
      const forward=new Vector3(Math.cos(w.steer),0,-Math.sin(w.steer)).applyQuaternion(s.q);forward.addScaledVector(normal,-forward.dot(normal)).normalize();
      const side=new Vector3().crossVectors(forward,normal);
      return {w,r,forward,side,j:new Vector3(w.forceX*dt,w.forceY*dt,w.forceZ*dt),limit:p.friction*w.load*dt,longLimit:(w.brakeTorque/p.wheelRadius+(w.rollingResistanceN||0))*dt};
    });
    for(let pass=0;pass<6;pass++)for(const c of contacts)for(const axis of [c.forward,c.side]){
      const velocity=s.vel.clone().add(new Vector3().crossVectors(s.omega.clone().applyQuaternion(s.q),c.r));
      const cross=new Vector3().crossVectors(c.r,axis);
      const invRot=cross.clone().applyQuaternion(qi).divide(this.inertia).applyQuaternion(s.q);
      const candidate=c.j.clone().addScaledVector(axis,-velocity.dot(axis)/(inverseMass+cross.dot(invRot)));
      const longitudinal=candidate.dot(c.forward);
      candidate.addScaledVector(c.forward,clamp(longitudinal,-c.longLimit,c.longLimit)-longitudinal);
      if(candidate.length()>c.limit)candidate.setLength(c.limit);
      const change=candidate.clone().sub(c.j);c.j.copy(candidate);
      s.vel.addScaledVector(change,inverseMass);
      s.omega.add(new Vector3().crossVectors(c.r,change).applyQuaternion(qi).divide(this.inertia));
    }
    for(const c of contacts){c.w.forceX=c.j.x/dt;c.w.forceY=c.j.y/dt;c.w.forceZ=c.j.z/dt;c.w.tireForceN=c.j.length()/dt;}
    const resultant=new Vector3();this.brakeForceN=0;
    for(const w of this.wheels){resultant.add(new Vector3(w.forceX,w.forceY,w.forceZ));const forward=new Vector3(Math.cos(w.steer),0,-Math.sin(w.steer)).applyQuaternion(s.q);this.brakeForceN+=Math.abs(w.forceX*forward.x+w.forceZ*forward.z);}
    this.frictionForceN=resultant.length();
  }

  _resolveObstacles() {
    this.obstacleContacts=[];
    if(!this.obstacles.length)return;
    const s=this.state, inverseMass=1/this.mass;
    // Sequential impulses: low restitution and Coulomb friction dissipate impact
    // energy. Full residual overlap correction is a numerical constraint, not thrust.
    for(let pass=0;pass<4;++pass){
      let any=false;
      const searchRadius=Math.hypot(...this.bodyHalf)+this.cg.length()+this.bodyBoxCenter.length();
      const nearby=this._obstaclesNear(s.pos.x,s.pos.z,searchRadius);
      for(const box of nearby){
        const contact=boxContact(this,box);if(!contact)continue;
        any=true;const {normal,depth,point}=contact;
        const r=point.clone().sub(s.pos),qInv=s.q.clone().invert();
        const omegaWorld=s.omega.clone().applyQuaternion(s.q);
        const contactVelocity=s.vel.clone().add(new Vector3().crossVectors(omegaWorld,r));
        const normalSpeed=contactVelocity.dot(normal);
        s.pos.addScaledVector(normal,depth+1e-6);
        // Compound trunk/branch pieces share one tree impact identity.
        const contactId=box.treeId??box.id;
        if(!this.obstacleContacts.includes(contactId))this.obstacleContacts.push(contactId);
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
          const frictionImpulse=Math.min(Math.min(.4, Math.max(0, this.params.friction))*normalImpulse,tangentSpeed/(inverseMass+rt.dot(inverseTangent)));
          applyImpulse(tangent.multiplyScalar(-frictionImpulse));
        }
        this.impactImpulse+=normalImpulse;
        if(normalSpeed<-.3){
          const previous=this.lastObstacleImpact;
          if(previous&&previous.id===contactId&&s.time-previous.lastTime<.2){previous.speed=Math.max(previous.speed,-normalSpeed);previous.impulse+=normalImpulse;previous.lastTime=s.time;}
          else {this.collisionCount++;this.lastObstacleImpact={id:contactId,speed:-normalSpeed,time:s.time,lastTime:s.time,impulse:normalImpulse};}
        }
      }
      if(!any)break;
    }
  }

  _resolveGround() {
    const s = this.state;
    const BODY_HALF=this.bodyHalf, BODY_BOX_CENTER=this.bodyBoxCenter;
    let lowest = Infinity, rLow = null;
    for (const x of [-BODY_HALF[0], BODY_HALF[0]]) for (const y of [BODY_BOX_CENTER.y-BODY_HALF[1], BODY_BOX_CENTER.y+BODY_HALF[1]]) for (const z of [-BODY_HALF[2], BODY_HALF[2]]) {
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
    this.groundCorrectionImpulseNs+=impulse;
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
    if (s.pressure <= ATMOSPHERE * 1.01) status = 'GAS DEPLETED';
    return {motorState:this.motorState, electricPowerW:this.electricPowerW,regenPowerW:this.regenPowerW,driveLossW:this.driveLossW,tractionCut:this.tractionCut,slidingWheels:this.wheels.filter(w=>w.sliding).length,massFlowKgS:this.massFlowKgS,manifoldPressureMPa:this.manifoldPressure/1e6,tankCapacityKg:this.initialGas,tankVolumeL:p.tankVolume*1000,
      gimbalAngleDeg:Math.hypot(this.gimbalX,this.gimbalZ)*180/Math.PI, gimbalForwardDeg:this.gimbalX*180/Math.PI,gimbalRightDeg:this.gimbalZ*180/Math.PI,
      horizontalSpeed: Math.hypot(s.vel.x, s.vel.z), forwardSpeed: s.vel.dot(fwd),
      rollingResistanceN: this.rollingResistanceN, frictionForceN: this.frictionForceN, brakeForceN: this.brakeForceN, airDragN: this.airDragN,
      handbrakeAmount:this.handbrakeAmount,handbrakeForceN:this.handbrakeForceN,
      speed: Math.hypot(s.vel.x, s.vel.z), totalSpeed: s.vel.length(), altitude: Math.max(0, s.pos.y - this.restHeight),
      verticalSpeed: s.vel.y, pressureMPa: s.pressure / 1e6, pressureGaugeMPa: (s.pressure - ATMOSPHERE) / 1e6,
      temperature: s.temp, gasKg: s.gas, gasPct: 100 * s.gas / this.initialGas, totalMass: m,
      thrustN: this.totalThrust, fanN: this.fanForce, fanPressurePa:this.fanPressurePa,fanPowerW:this.fanPowerW,fanAirflowM3S:this.fanAirflowM3S,fanSeal:this.fanSeal,contactCount: contact, slip: this.maxSlip || 0,
      compressorState:this.compressorState,compressorPowerW:this.compressorPowerW,compressorFlowKgS:this.compressorFlowKgS,
      compressorHeatW:this.compressorHeatW,tankHeatW:this.tankHeatW,compressorEnergyJ:s.compressorEnergyJ,
      gasRefilledKg:s.gasRefilledKg,gasConsumedKg:s.gasUsed,
      kineticEnergy: kinetic, potentialEnergy: m * p.gravity * Math.max(0, s.pos.y - this.restHeight),
      rotationEnergy: rotation, springEnergy: spring, tankEnergy: s.gas * CV * s.temp,
      gasUsed:s.gasUsed, thrustToWeight: this.totalThrust / Math.max(.001, m * p.gravity),
      status, attitude, acceleration: s.acceleration.clone(), gLoad, batteryPct: 100 * s.batteryJ / (p.batteryKWh * 3.6e6),
      saturation: this.saturation, lastImpactSpeed: this.lastImpactSpeed, maxAltitude: this.maxAltitude,
      massBalanceError: Math.abs(s.gas + s.gasUsed - this.initialGas-s.gasRefilledKg),
      tankEnergyBalanceError: Math.abs(s.gas * CV * s.temp + s.expelledEnthalpy+s.tankHeatOutJ-s.inletEnthalpyJ - this.initialEnergy),
      groundHeight: this.restHeight, time: s.time, cgOffset: this.cg.clone(), inertia: this.inertia.clone(),
      obstacleContacts: [...this.obstacleContacts], lastObstacleImpact: this.lastObstacleImpact, collisionCount:this.collisionCount,
      gripUsage:Math.max(0,...this.wheels.map(w=>w.load>1&&p.friction>0?w.tireForceN/(p.friction*w.load):0)),
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
