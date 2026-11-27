const byId=id=>document.getElementById(id);
const readyMessage='다른 드라이버가 참가하면 방장이 출발할 수 있어요.';
const driverColors=['#8deec8','#69c8f0','#ffaf70','#cc9efa'];

export function raceClock(seconds){
  const tenths=Math.floor(Math.max(0,seconds)*10);
  return Math.floor(tenths/600)+':'+String(Math.floor(tenths%600/10)).padStart(2,'0')+'.'+tenths%10;
}

export function raceInviteURL(href,code){
  const url=new URL(href);
  url.search='';url.hash='';
  url.searchParams.set('mode','city');url.searchParams.set('room',code);
  return url.href;
}

export function renderRacePlayers(list,state,results=false){
  const players=[...(state.players||[])].sort((a,b)=>
    (results?(a.rank??Infinity)-(b.rank??Infinity):0)||a.slot-b.slot);
  const rows=players.map(player=>{
    const li=document.createElement('li');
    li.style.setProperty('--driver-color',driverColors[player.slot%driverColors.length]);
    const name=document.createElement('span'),tag=document.createElement('small');
    name.textContent=player.name+(player.id===state.selfId?' (나)':'');
    if(results){
      tag.textContent=player.finished&&player.rank!=null?player.rank+'위 · '+raceClock(player.elapsedMs/1000):
        player.disconnected?'연결 종료':'주행 중';
    }else if(state.phase==='preparing'){
      tag.textContent=player.ready?'준비 완료':'코스 준비 중';
    }else{
      tag.textContent=player.slot===0?'방장':'참가자';
    }
    li.append(name,tag);return li;
  });
  list.replaceChildren(...rows);
}

function drawPreview(canvas,course){
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const w=canvas.width,h=canvas.height;
  const path=Array.from({length:160},(_,i)=>course.sample(i*course.length/160));
  const xs=path.map(p=>p.x),zs=path.map(p=>p.z);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  const scale=Math.min((w-44)/Math.max(1,x1-x0),(h-34)/Math.max(1,z1-z0));
  const x=px=>w/2+(px-(x0+x1)/2)*scale,y=pz=>h/2+(pz-(z0+z1)/2)*scale;
  ctx.clearRect(0,0,w,h);
  ctx.beginPath();
  path.forEach((p,i)=>{if(i)ctx.lineTo(x(p.x),y(p.z));else ctx.moveTo(x(p.x),y(p.z));});
  ctx.closePath();ctx.lineJoin='round';ctx.lineWidth=8;ctx.strokeStyle='#456772';ctx.stroke();
  ctx.lineWidth=2.2;ctx.strokeStyle='#b3d9d9';ctx.stroke();
  for(const gate of course.gates){
    if(!gate.air)continue;
    ctx.beginPath();ctx.arc(x(gate.x),y(gate.z),3.7,0,Math.PI*2);ctx.fillStyle='#f5bc6b';ctx.fill();
  }
  const start=path[0];
  ctx.fillStyle='#a2ffe3';ctx.fillRect(x(start.x)-4,y(start.z)-7,8,14);
}

export function createRaceLobbyPanel({courses,selectedCourseId,onCourse,onSolo,onHost,onJoin,onStart,onLeave,beforeOpen,afterClose}){
  const dialog=byId('race-lobby-dialog'),trigger=byId('race-lobby-open'),selector=byId('race-course-select');
  const form=byId('race-lobby-form'),submit=byId('race-lobby-submit'),input=byId('race-invite-input');
  const driverName=byId('race-driver-name'),status=byId('race-lobby-status'),room=byId('race-room');
  const switches=[...byId('race-lobby-modes').querySelectorAll('button')],roomCode=byId('race-room-code');
  const catalog=new Map(courses.map(course=>[course.id,course]));
  for(const course of courses)selector.append(new Option(course.name,course.id));
  let state={phase:'idle',players:[]},mode='solo',busy=false,selectedId=null,available=true,notice='';
  const invited=new URLSearchParams(location.search).get('room')?.trim().toUpperCase();
  if(invited){input.value=invited.slice(0,6);mode='join';}
  function setCourse(id){
    const course=catalog.get(id);if(!course||selectedId===course.id)return;
    selectedId=id;selector.value=id;
    drawPreview(byId('race-course-preview'),course);
    byId('race-course-stats').textContent=(course.length/1000).toFixed(2)+' km · '+course.laps+'랩 · 공중 링 '+course.gates.filter(g=>g.air).length+'개/랩';
  }
  function render(){
    const inRoom=['lobby','preparing','racing','finished'].includes(state.phase);
    const locked=busy||state.phase==='connecting';
    trigger.disabled=!available;
    trigger.textContent=inRoom||state.phase==='connecting'?'온라인 방':'경기장 · 대결';
    byId('race-lobby-title').textContent=inRoom?'온라인 대기실':'경기장';
    byId('race-lobby-modes').hidden=inRoom;
    for(const button of switches){button.disabled=locked;button.setAttribute('aria-pressed',button.dataset.raceMode===mode);}
    byId('race-lobby-course-field').hidden=mode==='join'&&!inRoom;
    selector.disabled=inRoom||locked;
    form.hidden=inRoom;
    byId('race-name-label').hidden=mode==='solo';
    byId('race-code-label').hidden=mode!=='join';
    input.disabled=locked||inRoom||mode!=='join';
    driverName.disabled=locked||inRoom;
    submit.disabled=locked;
    submit.textContent=locked?(state.phase==='connecting'?'연결 중…':'준비 중…'):{solo:'AI와 경주 시작',host:'온라인 방 만들기',join:'코드로 참가'}[mode];
    room.hidden=!inRoom;
    let guidance=!inRoom&&mode!=='solo'?'2–4인 · 차량끼리 충돌하지 않는 고스트 대결':'';
    byId('race-cancel-connect').hidden=state.phase!=='connecting';
    if(inRoom){
      roomCode.value=state.code||'';
      byId('race-room-count').textContent=state.players.length+' / 4';
      renderRacePlayers(byId('race-room-players'),state);
      const start=byId('race-room-start');
      start.hidden=!state.isHost||state.phase!=='lobby';
      start.disabled=busy||state.players.length<2;
      if(state.phase==='preparing')guidance='코스 준비 '+state.players.filter(p=>p.ready).length+' / '+state.players.length+'명';
      else if(state.phase==='lobby')guidance=state.isHost?(state.players.length<2?readyMessage:''):'방장이 출발하면 함께 시작해요.';
    }
    status.textContent=notice||state.message||guidance;
  }
  function setState(next){
    state=next;
    if(next.courseId&&next.phase!=='idle')setCourse(next.courseId);
    notice='';render();
  }
  function setError(message){notice=String(message||'');render();}
  async function action(fn){
    if(busy)return;
    busy=true;notice='';render();
    try{await fn();}catch(error){setError(error?.message||'요청에 실패했어요. 다시 시도해 주세요.');}
    finally{busy=false;render();}
  }
  selector.addEventListener('change',()=>{setCourse(selector.value);onCourse?.(selectedId);});
  for(const button of switches)button.addEventListener('click',()=>{mode=button.dataset.raceMode;notice='';render();});
  input.addEventListener('input',()=>{input.value=input.value.replace(/[^a-z0-9]/gi,'').toUpperCase();});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(state.phase!=='idle')return;
    const code=input.value.trim().toUpperCase(),name=driverName.value.trim();
    if(mode==='join'&&!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){setError('공유받은 방 코드 6자리를 확인해 주세요.');input.focus();return;}
    void action(async()=>{
      if(mode==='solo'){if(await onSolo(selectedId))close();}
      else if(mode==='host')await onHost({courseId:selectedId,name});
      else await onJoin({code,name});
    });
  });
  byId('race-room-start').addEventListener('click',()=>{if(state.isHost&&state.phase==='lobby'&&state.players.length>=2)void action(onStart);});
  byId('race-room-leave').addEventListener('click',()=>{void onLeave();});
  byId('race-cancel-connect').addEventListener('click',()=>{void onLeave();});
  async function copy(value,label){
    try{await navigator.clipboard.writeText(value);setError(label+'를 복사했어요.');}
    catch{
      if(value===state.code){roomCode.focus();roomCode.select();setError('선택된 방 코드를 복사해 주세요.');}
      else setError(value);
    }
  }
  byId('race-copy-code').addEventListener('click',()=>copy(state.code,'방 코드'));
  byId('race-copy-link').addEventListener('click',()=>copy(raceInviteURL(location.href,state.code),'초대 링크'));
  function open(){
    if(dialog.open||!available||beforeOpen?.()===false)return false;
    render();dialog.showModal();return true;
  }
  function close(){if(dialog.open)dialog.close();}
  trigger.addEventListener('click',open);byId('race-lobby-close').addEventListener('click',close);
  dialog.addEventListener('close',()=>afterClose?.());
  setCourse(catalog.has(selectedCourseId)?selectedCourseId:courses[0].id);
  render();
  return {open,close,setState,setCourse,setError,get isOpen(){return dialog.open;},
    setAvailable(value){available=!!value;if(!available)close();render();}};
}
