const measured=(value,scale=1)=>Number.isFinite(value)?String(Number((value*scale).toPrecision(10))):'미기록';
const state=value=>value===true?'켬':value===false?'끔':'미기록';

function setupLines(row){
  const p=row.parameters||{};
  const v=row.releaseVelocity;
  const speed=Array.isArray(v)&&v.length===3?Math.hypot(...v):null;
  return [
    '출발 바퀴 높이 '+measured(row.height)+' m · 초기 속력 '+measured(speed)+' m/s · 목표 접촉 속력 '+measured(row.targetSpeed)+' m/s',
    '탱크 '+measured(row.tankVolume,1000)+' L · 초기 절대압 '+measured(row.tankPressureMPa)+' MPa · 온도 '+measured(row.initialTemperature)+' K · 초기 압축공기 '+measured(row.initialGas)+' kg',
    '바퀴별 스프링 '+measured(row.springK)+' N/m · 바퀴별 감쇠 '+measured(row.damperC)+' N·s/m · 중력가속도 '+measured(p.gravity)+' m/s²',
    '노면 마찰계수 '+measured(p.friction)+' · 구름저항계수 '+measured(p.rollingResistance)+' · 노면 요철 계수 '+measured(p.roadRoughness)+' · 공기저항 '+state(p.aeroEnabled)+(p.aeroEnabled?' (밀도 '+measured(p.airDensity)+' kg/m³, 수직 CdA '+measured(p.verticalDragArea)+' m² 가정)':'')+' · 바람 (X, Z) ('+measured(p.windX)+', '+measured(p.windZ)+') m/s',
    '계산 간격 '+measured(row.physicsStep,1000)+' ms · 물리 모델 '+(row.modelVersion||'미기록')+' · 시뮬레이터 '+(row.appVersion||'미기록'),
  ].join('\n');
}

// Group by the saved release conditions, including groups that were stopped early.
export function landingConditionText(rows,methodNames,audit){
  const groups=new Map();
  for(const row of rows){
    const id=row.groupId??row.id;
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(row);
  }
  const sections=['Roadster 착지 실험 조건 ('+rows.length+'회 측정)'];
  let index=0;
  for(const records of groups.values()){
    const planned=Math.max(...records.map(r=>r.groupSize||1));
    const blocks=new Map();
    for(const row of records){
      const setup=setupLines(row);
      if(!blocks.has(setup))blocks.set(setup,new Map());
      const vehicles=blocks.get(setup);
      const car=(row.vehicleTitle||row.title||row.vehicleId||'차체 미기록')+' · 중앙 추가 질량 '+measured(row.ballastKg??row.parameters?.ballastKg)+' kg · 초기 총질량 '+measured(row.initialMass)+' kg';
      if(!vehicles.has(car))vehicles.set(car,[]);
      const method=methodNames[row.method]||row.method||'방식 미기록';
      const setting=row.method==='brake'?' (제동 설정 '+measured(row.brakeHeight)+' m)':'';
      const manual=row.manualLiftUsed?' [수동 분사 '+measured(row.manualLiftDuration)+' s]':'';
      vehicles.get(car).push(method+setting+manual);
    }
    const lines=['실험 묶음 '+(++index)+' · '+records.length+'/'+planned+'회 측정'];
    for(const [setup,vehicles] of blocks){
      lines.push(setup);
      for(const [vehicle,methods] of vehicles)lines.push(vehicle+' — '+methods.join(', '));
    }
    sections.push(lines.join('\n'));
  }
  const original=audit?.rows?.length&&rows.find(row=>row.id===audit.source?.id);
  if(original){
    const steps=audit.rows.map(r=>measured(r.step,1000)).join(' / ');
    sections.push('계산 간격 검산 · '+(original.vehicleTitle||original.vehicleId)+' · '+(methodNames[original.method]||original.method)+
      ' · 출발 '+measured(original.height)+' m · 초기 총질량 '+measured(original.initialMass)+' kg\n'+
      '물리 계산 간격 '+steps+' ms · 제어 주기 '+measured(original.physicsStep,1000)+' ms · 같은 출발 조건과 제동 계획으로 재계산');
  }
  return sections.join('\n\n');
}

export async function copyLandingConditions(dialog,rows,methodNames,audit){
  const text=landingConditionText(rows,methodNames,audit);
  const area=dialog.querySelector('#landing-copy-text'),status=dialog.querySelector('#landing-copy-status');
  area.value=text;area.hidden=true;status.textContent='';
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    // A modal dialog is the only interactive subtree. Keep the fallback inside it.
    area.hidden=false;area.focus();area.select();
    try{
      if(!dialog.ownerDocument.execCommand('copy'))throw new Error();
    }catch{
      status.textContent='선택한 조건을 복사하세요.';return;
    }
    area.hidden=true;
    dialog.querySelector('#landing-copy-conditions').focus();
  }
  status.textContent=rows.length+'회 실험 조건을 복사했습니다.';
}
