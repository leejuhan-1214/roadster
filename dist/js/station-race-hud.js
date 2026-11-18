import {RACE_COURSE, sampleCourse} from './station-race.js?v=20261118-race152';

const byId = id => document.getElementById(id);
const path = Array.from({length:160}, (_,i) => sampleCourse(i*RACE_COURSE.length/160));
const xs = path.map(p=>p.x), zs = path.map(p=>p.z);
const bounds = {left:Math.min(...xs), right:Math.max(...xs), top:Math.min(...zs), bottom:Math.max(...zs)};

function clock(seconds) {
  const tenths = Math.floor(seconds*10);
  return Math.floor(tenths/600)+':'+String(Math.floor(tenths%600/10)).padStart(2,'0')+'.'+tenths%10;
}

export function showRaceHUD(active) {
  document.body.classList.toggle('racing', active);
  byId('race-hud').hidden = !active;
  if (active) {
    byId('race-entrance-hint').hidden = true;
    byId('race-finish').hidden = true;
  }
}

export function updateRaceHUD(race) {
  byId('race-rank').textContent = race.rank;
  byId('race-lap').textContent = race.lap+' / '+RACE_COURSE.laps;
  byId('race-clock').textContent = clock(race.elapsed);
  const signal = byId('race-signal');
  const cue = race.phase==='countdown' ? String(Math.max(1,Math.ceil(race.countdown))) : race.elapsed<.8 ? '출발!' : '';
  if (signal.textContent!==cue) signal.textContent = cue;
  signal.hidden = !cue;
  const done = race.phase==='finished';
  byId('race-finish').hidden = !done;
  byId('race-recover').disabled = race.phase!=='racing';
  if (done) {
    byId('race-result-place').textContent = race.rank+'위 / 4대';
    byId('race-result-time').textContent = RACE_COURSE.laps+'랩 기록 '+clock(race.finishTime);
  }
}

export function drawRaceMap(ctx, race, player, yaw) {
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
  ctx.closePath(); ctx.lineJoin='round'; ctx.lineWidth=RACE_COURSE.width; ctx.strokeStyle='#45606d'; ctx.stroke();
  const gate=RACE_COURSE.gates[race.nextGate], dx=Math.sin(gate.heading)*9, dz=Math.cos(gate.heading)*9;
  ctx.beginPath(); ctx.moveTo(gate.x-dx,gate.z-dz); ctx.lineTo(gate.x+dx,gate.z+dz);
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
  for (const car of race.rivals) {
    ctx.beginPath(); ctx.arc(car.x,car.z,3.4/scale,0,Math.PI*2);
    ctx.fillStyle='#'+car.color.toString(16).padStart(6,'0'); ctx.fill();
  }
  ctx.translate(player.x,player.z); ctx.rotate(-yaw); ctx.scale(1/scale,1/scale);
  ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-5,-4); ctx.lineTo(-3,0); ctx.lineTo(-5,4); ctx.closePath();
  ctx.fillStyle='#9fffd0'; ctx.fill(); ctx.strokeStyle='#10212b'; ctx.lineWidth=1; ctx.stroke(); ctx.restore();
}
