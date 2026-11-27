import {RACE_COURSE, sampleCourse} from './station-race-course.js?v=20261127-race20';
import {AIR_APPROACH,AIR_CEILING,rivalAirPath} from './station-race-air.js?v=20261127-race20';
import {raceClock,renderRacePlayers} from './race-lobby-panel.js?v=20261127-race20';

const byId = id => document.getElementById(id);
const maps=new WeakMap();
function diagram(course){
  if(maps.has(course))return maps.get(course);
  const sample=course.sample||sampleCourse;
  const path=Array.from({length:160},(_,i)=>sample(i*course.length/160));
  const xs=path.map(p=>p.x),zs=path.map(p=>p.z);
  const bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...zs),bottom:Math.max(...zs)};
  const rings=course.gates.filter(g=>g.air),firstRing=rings[0].distance;
  const airStart=firstRing-AIR_APPROACH,airEnd=rings.at(-1).distance+95;
  const airPath=Array.from({length:65},(_,i)=>{
    const d=airStart+i*(airEnd-airStart)/64;
    const {lateral}=rivalAirPath(d,course);
    return {...sample(d,lateral),lateral};
  });
  const result={path,bounds,rings,firstRing,airStart,airEnd,airPath,sample};
  maps.set(course,result);return result;
}

let standingsKey='';
export function showRaceHUD(active) {
  standingsKey='';
  document.body.classList.toggle('racing', active);
  byId('race-hud').hidden = !active;
  if (active) {
    byId('race-entrance-hint').hidden = true;
    byId('race-finish').hidden = true;
  }
}

export function updateRaceHUD(race,telemetry,driver,online=null) {
  const course=race.course||RACE_COURSE,{rings,firstRing}=diagram(course);
  const self=online?.players.find(p=>p.id===online.selfId);
  const rank=self?.rank??online?.rank??race.rank;
  const field=online?online.players.length:race.rivals.length+1;
  byId('race-rank').textContent=rank;
  byId('race-field-size').textContent=' / '+field;
  byId('race-lap').textContent=race.lap+' / '+course.laps;
  byId('race-clock').textContent=raceClock(online?.elapsed??race.elapsed);
  byId('race-difficulty').parentElement.hidden=!!online;
  byId('race-retry').hidden=!!online;
  const signal = byId('race-signal');
  const cue = race.phase==='countdown' ? String(Math.max(1,Math.ceil(race.countdown))) : race.elapsed<.8 ? '출발!' : '';
  if (signal.textContent!==cue) signal.textContent = cue;
  signal.hidden = !cue;
  const done = race.phase==='finished';
  byId('race-flight').hidden = done;
  byId('race-touch').hidden = done;
  if (telemetry && !done) {
    byId('race-flight-state').textContent=race.rivalSupport?'차량 위':driver.landingAssist?'착지 중':driver.altHold?'높이 유지':driver.airborne?'비행':'지상';
    const centreHeight=telemetry.altitude+telemetry.groundHeight;
    byId('race-flight-height').textContent='중심 '+centreHeight.toFixed(1)+' m';
    byId('race-flight-gas').textContent='기체 ∞';
    byId('race-ring-count').textContent='링 '+race.airGatesThisLap+' / '+rings.length;
    const high=centreHeight>AIR_CEILING;
    const hint=byId('race-flight-hint');
    const guiding=race.airSectionStatus==='approach'||race.airSectionStatus==='flying';
    hint.classList.toggle('race-descend',high);
    hint.classList.toggle('race-guide-important',guiding||race.airSectionStatus==='missed'||race.airSectionStatus==='clear');
    const distance=Math.max(0,Math.round(race.airGateDistance||0));
    if(high)hint.textContent='높이를 낮춰 체크포인트 통과';
    else if(race.airSectionStatus==='missed')hint.textContent='미통과 · 이륙 지점부터 다시';
    else if(race.airGatesThisLap===rings.length){
      hint.textContent=race.airSectionStatus==='clear'&&driver.airborne?'링 통과 완료 · 노면으로 하강':'비행 완료 · 지상 코스';
    }
    else if(guiding){
      const rim=rings[race.airGatesThisLap],a=rim.aperture;
      const side=a.lateral < -1?'왼쪽':a.lateral > 1?'오른쪽':'중앙';
      const targetHeight=((a.minY+a.maxY)/2).toFixed(1);
      hint.textContent=(driver.airborne?'':'Space 상승 · ')+(rim.airOrdinal+1)+'번 '+side+' · 목표 '+targetHeight+' m · '+distance+' m 앞';
    }else hint.textContent=(firstRing/1000).toFixed(2)+' km 지점 · Space로 이륙';
    byId('race-land').hidden=!driver.airborne&&!driver.landingAssist&&!driver.altHold;
    byId('race-land').setAttribute('aria-pressed',driver.landingAssist);
  }
  byId('race-finish').hidden = !done;
  const standings=byId('race-online-results');
  standings.hidden=!done||!online;
  byId('race-recover').disabled = race.phase!=='racing';
  if (done) {
    byId('race-result-place').textContent=online&&self?.rank==null?'순위 집계 중':rank+'위 / '+field+'대';
    byId('race-result-time').textContent=course.laps+'랩 기록 '+raceClock(self?.elapsedMs!=null?self.elapsedMs/1000:race.finishTime)
      +' · 필수 링 '+race.airGatesPassed+' / '+(rings.length*course.laps);
    if(online){
      const key=JSON.stringify(online.players.map(p=>[p.id,p.name,p.disconnected,p.finished,p.rank,p.elapsedMs]));
      if(standingsKey!==key){renderRacePlayers(standings,online,true);standingsKey=key;}
    }
  }
}

// This lane diagram expands the lateral scale to show the slalom on a phone.
// Up is the direction of travel, right is right of the circuit centreline.
function drawFlightSector(ctx,race,player,opponents){
  const course=race.course||RACE_COURSE,{airStart,airEnd,rings,airPath,sample}=diagram(course);
  const {width:w,height:h}=ctx.canvas,span=course.width*1.35;
  const x=lateral=>w/2+lateral*w/span;
  const y=distance=>h-9-(distance-airStart)*(h-18)/(airEnd-airStart);
  ctx.fillStyle='#10212b';ctx.fillRect(0,0,w,h);
  const left=x(-course.width/2),right=x(course.width/2);
  ctx.fillStyle='#1e3540';ctx.fillRect(left,0,right-left,h);
  ctx.beginPath();ctx.moveTo(left,0);ctx.lineTo(left,h);ctx.moveTo(right,0);ctx.lineTo(right,h);
  ctx.lineWidth=1;ctx.strokeStyle='#607781';ctx.stroke();
  ctx.beginPath();
  airPath.forEach((pt,i)=>i?ctx.lineTo(x(pt.lateral),y(pt.distance)):ctx.moveTo(x(pt.lateral),y(pt.distance)));
  ctx.strokeStyle='#6796a2';ctx.setLineDash([3,3]);ctx.stroke();ctx.setLineDash([]);
  ctx.font='bold 11px sans-serif';ctx.textAlign='left';ctx.fillStyle='#c6dddc';
  ctx.fillText('착지',left+3,12);
  for(const ring of rings){
    const a=ring.aperture,active=ring.index===race.nextGate,passed=ring.airOrdinal<race.airGatesThisLap;
    ctx.beginPath();ctx.ellipse(x(a.lateral),y(ring.distance),a.halfWidth*w/span,3.4,0,0,2*Math.PI);
    ctx.strokeStyle=active?'#ffbe62':passed?'#557482':'#55d9ee';ctx.lineWidth=active?2.6:1.4;ctx.stroke();
  }
  for(const car of opponents){
    const d=car.distance%course.length;
    if(!Number.isFinite(d)||!Number.isFinite(car.lateral)||d<airStart||d>airEnd)continue;
    ctx.beginPath();ctx.arc(x(car.lateral),y(d),2.6,0,2*Math.PI);
    ctx.fillStyle='#'+car.color.toString(16).padStart(6,'0');ctx.fill();
  }
  const local=race.progress%course.length,station=sample(local);
  const lateral=(player.x-station.x)*Math.sin(station.heading)+(player.z-station.z)*Math.cos(station.heading);
  const px=x(lateral),py=Math.max(6,Math.min(h-5,y(local)));
  ctx.beginPath();ctx.moveTo(px,py-5.5);ctx.lineTo(px-4.4,py+3.4);ctx.lineTo(px+4.4,py+3.4);ctx.closePath();
  ctx.fillStyle='#9fffd0';ctx.fill();ctx.strokeStyle='#0f212c';ctx.lineWidth=1;ctx.stroke();
}

export function drawRaceMap(ctx,race,player,yaw,opponents=race.rivals) {
  const course=race.course||RACE_COURSE,{path,bounds,rings,airPath,sample}=diagram(course);
  if(['approach','flying','clear'].includes(race.airSectionStatus)){
    ctx.save();drawFlightSector(ctx,race,player,opponents);ctx.restore();return;
  }
  const {width,height} = ctx.canvas;
  const scale = Math.min((width-28)/(bounds.right-bounds.left),(height-24)/(bounds.bottom-bounds.top));
  ctx.save();
  ctx.fillStyle = '#10212b'; ctx.fillRect(0,0,width,height);
  ctx.translate(width/2,height/2);
  ctx.scale(scale,scale);
  ctx.translate(-(bounds.right+bounds.left)/2,-(bounds.top+bounds.bottom)/2);
  ctx.beginPath();
  for (let i=0;i<path.length;i++) {
    if (!i) ctx.moveTo(path[i].x,path[i].z); else ctx.lineTo(path[i].x,path[i].z);
  }
  ctx.closePath(); ctx.lineJoin='round'; ctx.lineWidth=Math.max(course.width,2.5/scale); ctx.strokeStyle='#45606d'; ctx.stroke();
  ctx.beginPath();
  airPath.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.z);else ctx.moveTo(p.x,p.z);});
  ctx.lineWidth=2.2/scale;ctx.setLineDash([3/scale,3/scale]);ctx.strokeStyle='#60dbec';ctx.stroke();ctx.setLineDash([]);
  for(const gate of rings){
    const p=sample(gate.distance,gate.aperture.lateral);
    ctx.beginPath();ctx.arc(p.x,p.z,3/scale,0,Math.PI*2);ctx.fillStyle='#10212b';ctx.fill();ctx.stroke();
  }
  const gate=course.gates[race.nextGate], dx=Math.sin(gate.heading)*4/scale, dz=Math.cos(gate.heading)*4/scale;
  ctx.beginPath(); ctx.moveTo(gate.x-dx,gate.z-dz); ctx.lineTo(gate.x+dx,gate.z+dz);
  ctx.strokeStyle='#fff'; ctx.lineWidth=1.4/scale; ctx.stroke();
  for (const car of opponents) {
    ctx.beginPath(); ctx.arc(car.x,car.z,3.4/scale,0,Math.PI*2);
    ctx.fillStyle='#'+car.color.toString(16).padStart(6,'0'); ctx.fill();
  }
  ctx.translate(player.x,player.z); ctx.rotate(-yaw); ctx.scale(1/scale,1/scale);
  ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-5,-4); ctx.lineTo(-3,0); ctx.lineTo(-5,4); ctx.closePath();
  ctx.fillStyle='#9fffd0'; ctx.fill(); ctx.strokeStyle='#10212b'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
}
