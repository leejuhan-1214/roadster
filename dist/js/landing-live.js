// The live view reads the solver; it never writes forces, velocities or time.
const fmt=(value,digits=2)=>Number.isFinite(value)?value.toFixed(digits):'—';
export function landingLiveReadings(sim){
  const mass=sim.mass,vy=sim.state.vel.y;
  return {mass,gravityN:mass*sim.params.gravity,velocityY:vy,
    // Read directly on a paused +2 ms step, before the next render updates its
    // smoothed diagram. clone() preserves the physical nozzle directions.
    thrustVerticalN:(sim.thrusters||[]).reduce((sum,t)=>sum+t.force*t.dir.clone().applyQuaternion(sim.state.q).y,0),
    accelerationY:sim.resolvedAcceleration.y,
    verticalKineticEnergyJ:.5*mass*vy*vy,
    // Linear spring storage only. PhysicsSim also has a nonlinear bump stop
    // beyond 0.22 m; neither that storage nor damping loss is included here.
    springEnergyJ:sim.wheels.reduce((energy,w)=>energy+.5*sim.params.springK*Math.max(0,w.compression)**2,0),
    compression:Math.max(0,...sim.wheels.map(w=>w.compression))};
}

export class LandingLiveUI {
  constructor(root){
    this.root=root;
    const panel=document.createElement('section');panel.id='landing-live-physics';panel.className='landing-live-physics';
    panel.setAttribute('aria-label','착지 물리량과 힘 범례');
    panel.innerHTML=`<div class="landing-live-heading"><b>힘과 운동</b><span id="landing-phase">자유 조종</span></div>
      <dl class="landing-force-key"><div class="gravity"><dt>중력 mg ↓</dt><dd id="landing-weight">—</dd></div><div class="thrust"><dt>추력 Tᵧ ↑</dt><dd id="landing-thrust-y">—</dd></div><div class="normal"><dt>지면 N ↑</dt><dd id="landing-normal">—</dd></div></dl>
      <p class="landing-force-scale" id="landing-force-scale">화살표는 같은 힘 축척</p>
      <details class="landing-live-details"><summary>가속도·에너지와 식</summary>
        <p class="landing-equation">통제 실험 · 위쪽 +<br>수직 연속력 N + Tᵧ − mg</p>
        <dl><div><dt>실제 가속도 aᵧ (보정 포함)</dt><dd id="landing-acceleration">—</dd></div><div><dt>수직 운동 ½mvᵧ²</dt><dd id="landing-kinetic">—</dd></div><div><dt>선형 스프링 Σ½kx²</dt><dd id="landing-elastic">—</dd></div><div><dt>현재 최대 압축 x</dt><dd id="landing-live-compression">—</dd></div></dl>
        <p>화살표는 차체 옆으로 옮겨 표시합니다. 접촉 전 N = 0. 접촉하면 스프링·감쇠가 하강을 멈춥니다. 화살표 N은 연속 반력이며 아래 등가반력은 접촉 보정 충격량도 포함합니다.</p>
        <p>스프링 값은 선형 부분만 계산하며 22 cm 이후의 비선형 스토퍼와 감쇠 소산은 제외합니다. 분사 중 질량이 줄어듭니다. 위 에너지는 차체의 순간값이며 배출 기체·중력 위치에너지·소산을 합친 보존량은 아닙니다.</p>
      </details>`;
    root.querySelector('.force-reading').before(panel);this.panel=panel;
    this.nodes=Object.fromEntries([...panel.querySelectorAll('[id]')].map(el=>[el.id,el]));
  }
  setVisible(visible){this.panel.hidden=!visible;}
  update(sim,visual,run,{active=false,paused=false}={}){
    if(this.panel.hidden)return;
    const reading=landingLiveReadings(sim),metrics=visual?.metrics;
    this.nodes['landing-weight'].textContent=fmt(reading.gravityN/1000,1)+' kN';
    this.nodes['landing-thrust-y'].textContent=fmt(reading.thrustVerticalN/1000,1)+' kN';
    this.nodes['landing-normal'].textContent=fmt(Math.max(0,sim.groundForceN)/1000,1)+' kN';
    this.nodes['landing-force-scale'].textContent=metrics&&Number.isFinite(metrics.forceScaleNPerM)?'화살표 1 m = '+fmt(metrics.forceScaleNPerM/1000,1)+' kN · 공통 축척':'화살표는 같은 힘 축척';
    this.nodes['landing-acceleration'].textContent=(reading.accelerationY>=0?'+':'')+fmt(reading.accelerationY)+' m/s²';
    this.nodes['landing-kinetic'].textContent=fmt(reading.verticalKineticEnergyJ/1000)+' kJ';
    this.nodes['landing-elastic'].textContent=fmt(reading.springEnergyJ/1000)+' kJ';
    this.nodes['landing-live-compression'].textContent=fmt(reading.compression*100,1)+' cm';
    let phase='자유 조종';
    if(run){phase=active?(run.touchdownTime!==null?'접촉 · 완충':run.manualLiftActive?'수동 분사':run.braking||run.method==='gentle'?'추력 제동':'낙하'): '측정 완료';if(active&&paused)phase+=' · 정지';}
    this.nodes['landing-phase'].textContent=phase;
  }
}
