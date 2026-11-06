/**
 * A compact finite-fuel skills course. Coordinates are metres, +X forward/Y up.
 * Visuals and collision code consume these same box definitions. Checkpoints
 * observe the ordinary simulation; this module never changes forces or fuel.
 */
const box = (id, center, size, color = '#355063') => ({ id, center, size, color });
export const COURSE = {
  id: 'aerodrome-01', title: 'STAGE 01 · 도약 시험장',
  description: '왼쪽 주행 게이트 → 공중 링 → 착지 구역에서 정지',
  start: [0, 0, 0], heading: 0, timeLimit: 120, boundaryRadius: 120,
  obstacles: [
    box('slalom-block-a', [10, .65, 1.6], [3, 1.3, 3.2], '#edb36f'),
    box('slalom-block-b', [19, .85, -6.8], [3.2, 1.7, 2.2], '#edb36f'),
    box('arch-left', [28, 3, -4.8], [1, 6, .65], '#518e9c'),
    box('arch-right', [28, 3, 4.8], [1, 6, .65], '#518e9c'),
    box('arch-header', [28, 6.2, 0], [1, .6, 10.25], '#6fb3bb'),
    box('landing-block-left', [42, 1.4, -7.4], [3, 2.8, 2.2], '#355063'),
    box('landing-block-right', [42, 1.4, 7.4], [3, 2.8, 2.2], '#355063'),
  ],
  checkpoints: [
    { id: 'drive', label: '01 · 왼쪽 주행 게이트', type: 'drive', center: [12, 0, -4], radius: 3.8,
      hint: 'WASD로 왼쪽 표시 구역을 지나세요. 바퀴가 지면에 닿아 있어야 합니다.' },
    { id: 'air', label: '02 · 공중 링 통과', type: 'air', center: [28, 2.6, 0], radius: 2.1, minHeight: .8,
      hint: '링 약 8 m 앞까지 주행한 뒤 Space를 짧게 눌러 이륙하세요. WASD로 기울여 앞으로 통과합니다. 표시 고도 0.8 m 이상.' },
    { id: 'land', label: '03 · 착지하고 정지', type: 'land', center: [41, 0, 0], radius: 5,
      maxSpeed: 1.5, maxVerticalSpeed: .5, holdSeconds: .5,
      hint: '착지 구역에서 3개 이상 바퀴를 접지하고 1.5 m/s 미만으로 감속해 0.5초 유지하세요.' },
  ],
  finishpad: { center: [41, 0, 0], radius: 5, label: 'LAND / STOP' },
};
export const STAGE = COURSE;

const point = p => Array.isArray(p) ? p : [p.x, p.y, p.z];
const clamp01 = n => Math.max(0, Math.min(1, n));
function sweptDiskFraction(a, b, center, radius) {
  const dx=b[0]-a[0], dz=b[2]-a[2], length2=dx*dx+dz*dz;
  const along=length2>1e-12?clamp01(((center[0]-a[0])*dx+(center[2]-a[2])*dz)/length2):0;
  const x=a[0]+along*dx-center[0], z=a[2]+along*dz-center[2];
  return x*x+z*z<=radius*radius?along:null;
}
function airCrossingFraction(a, b, checkpoint, restHeight) {
  const dx=b[0]-a[0];
  if(dx<=1e-10||a[0]>checkpoint.center[0]||b[0]<checkpoint.center[0])return null;
  const along=(checkpoint.center[0]-a[0])/dx;
  const y=a[1]+along*(b[1]-a[1]),z=a[2]+along*(b[2]-a[2]);
  const dy=y-checkpoint.center[1],dz=z-checkpoint.center[2];
  return dy*dy+dz*dz<=checkpoint.radius**2&&y-restHeight>=checkpoint.minHeight?along:null;
}

export class StageRun {
  constructor(course = COURSE) { this.course=course; this.reset(); }
  reset() {
    this.status='ready';this.progress=0;this.elapsed=0;this.startTime=0;
    this.landingHold=0;this.reason=null;this.milestones=[];this.lastEvent=null;
    return this;
  }
  start(simTime = 0) { this.reset();this.status='running';this.startTime=simTime;return this; }
  get nextCheckpoint() { return this.course.checkpoints[this.progress]||null; }
  get total() { return this.course.checkpoints.length; }
  get completed() { return this.status==='complete'; }
  update(prevPos, sim, dt) {
    this.lastEvent=null;
    if(this.status!=='running')return this;
    if(!Number.isFinite(dt)||dt<0)throw new RangeError('Stage timestep must be finite and nonnegative.');
    const a=point(prevPos),b=point(sim.state.pos),velocity=point(sim.state.vel);
    if(![...a,...b,...velocity].every(Number.isFinite)){this.status='failed';this.reason='invalid-state';return this;}
    this.elapsed+=dt;
    if(this.elapsed>=this.course.timeLimit){this.status='failed';this.reason='timeout';return this;}
    if(Math.hypot(b[0]-this.course.start[0],b[2]-this.course.start[2])>this.course.boundaryRadius||b[1]<-5||b[1]>100){
      this.status='failed';this.reason='out-of-bounds';return this;
    }
    const cp=this.nextCheckpoint;if(!cp)return this;
    let passed=false;
    if(cp.type==='drive')passed=sim.contactCount>0&&sweptDiskFraction(a,b,cp.center,cp.radius)!==null;
    if(cp.type==='air')passed=sim.contactCount===0&&airCrossingFraction(a,b,cp,sim.restHeight??0)!==null;
    if(cp.type==='land'){
      const inside=Math.hypot(b[0]-cp.center[0],b[2]-cp.center[2])<=cp.radius;
      const slow=Math.hypot(velocity[0],velocity[2])<cp.maxSpeed&&Math.abs(velocity[1])<cp.maxVerticalSpeed;
      this.landingHold=inside&&slow&&sim.contactCount>=3?this.landingHold+dt:0;
      passed=this.landingHold+1e-10>=cp.holdSeconds;
    }
    if(passed){
      this.progress++;this.landingHold=0;this.lastEvent={type:'checkpoint',id:cp.id,label:cp.label,time:this.elapsed};
      this.milestones.push({...this.lastEvent});
      if(this.progress===this.total){this.status='complete';this.reason='finished';this.lastEvent.type='complete';}
    }
    return this;
  }
}
export function createStageRun(simTime = 0, course = COURSE) { return new StageRun(course).start(simTime); }
export function updateStageRun(run, prevPos, sim, dt) { return run.update(prevPos,sim,dt); }
