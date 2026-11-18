// Both panels share time from release. Forces are step means from the solver;
// velocities are endpoint measurements. The touchdown velocity ends the flight
// curve before any ground impulse can contaminate it.
const finite=Number.isFinite;
const stamp=value=>finite(value)?value.toFixed(4)+' s':'';
const palette={thrust:'#95eacc',velocity:'#8cbeff',command:'#ffc078',above:'#96efc9',contact:'#f2a7cc'};

export function brakeTimelineEvents(result){
  const measured=Object.hasOwn(result,'firstAboveWeightTime');
  return [
    {label:'자동 제동 명령',time:result.autoBrakeTime,color:palette.command,empty:result.method==='free'?'명령 없음 (자유 낙하)':'기록 없음'},
    {label:'상향 추력 > 무게',time:result.firstAboveWeightTime,color:palette.above,empty:measured?'접촉 전 초과 표본 없음':'측정 기록 없음'},
    {label:'첫 접촉',time:result.touchdownTime,color:palette.contact,empty:'접촉 미측정'},
  ];
}

export function brakeTimelinePlot(result,zoom=false){
  if(!Object.hasOwn(result,'firstAboveWeightTime'))return '';
  const flight=(result.samples||[]).filter(s=>finite(s.time)&&(!finite(result.touchdownTime)||s.time<result.touchdownTime));
  const end=finite(result.touchdownTime)?result.touchdownTime:(flight.at(-1)?.time??0);
  const start=zoom?Math.max(0,end-.5):0;
  const events=brakeTimelineEvents(result);
  const left=48,right=425,width=right-left,timeSpan=end-start;
  const x=t=>left+(timeSpan?(t-start)/timeSpan:0)*width;
  const thrust=[{t:0,v:0}],velocity=[{t:0,v:0}];
  for(const sample of flight){
    if(finite(sample.thrustWeightRatio))thrust.push({t:sample.time,v:sample.thrustWeightRatio});
    if(finite(sample.velocity))velocity.push({t:sample.time,v:sample.velocity});
  }
  if(finite(result.firstAboveWeightTime)&&finite(result.firstAboveWeightRatio)){
    // This event can fall between the coarser saved graph samples.
    thrust.push({t:result.firstAboveWeightTime,v:result.firstAboveWeightRatio});thrust.sort((a,b)=>a.t-b.t);
  }
  if(finite(result.touchdownTime)){
    if(finite(result.touchdownThrustWeightRatio))thrust.push({t:end,v:result.touchdownThrustWeightRatio});
    if(finite(result.touchdownVelocityY))velocity.push({t:end,v:result.touchdownVelocityY});
  }
  function windowPoints(series){
    const points=series.filter(p=>p.t>=start&&p.t<=end);
    if(points.length&&points[0].t>start){
      const before=series.findLast(p=>p.t<start),next=points[0];
      if(before)points.unshift({t:start,v:before.v+(next.v-before.v)*(start-before.t)/(next.t-before.t)});
    }
    return points;
  }
  const ty=windowPoints(thrust),vy=windowPoints(velocity);
  const tick=v=>Number(v.toPrecision(3)).toString();
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 332" role="img" aria-label="착지 전 상향 추력과 무게의 비 및 수직 속도"><title>제동 명령과 하강 속도의 변화</title><desc>공통 가로축은 출발 후 경과 시간입니다. 위 그래프는 상향 추력을 같은 계산 구간의 무게로 나눈 값, 아래 그래프는 위쪽을 양수로 둔 수직 속도입니다.</desc>';
  function panel(points,top,bottom,min,max,title,color,baseline){
    const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
    svg+='<text x="'+left+'" y="'+(top-9)+'" fill="'+color+'">'+title+'</text>';
    for(const value of Array.from(new Set([min,baseline,max]))){
      svg+='<line x1="'+left+'" x2="'+right+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="'+(value===baseline?'#7e9ca8':'#29424e')+'" stroke-dasharray="'+(value===baseline?'4 4':'none')+'"/><text x="'+(left-5)+'" y="'+(y(value)+4)+'" text-anchor="end">'+tick(value)+'</text>';
    }
    for(const event of events)if(finite(event.time)&&event.time>=start&&event.time<=end){
      svg+='<line x1="'+x(event.time)+'" x2="'+x(event.time)+'" y1="'+top+'" y2="'+bottom+'" stroke="'+event.color+'" stroke-dasharray="3 4"/>';
    }
    const coords=points.map(p=>x(p.t).toFixed(2)+','+y(p.v).toFixed(2)).join(' ');
    if(coords)svg+='<polyline points="'+coords+'" fill="none" stroke="'+color+'" stroke-width="2.2" stroke-linejoin="round"/>';
  }
  const lowTy=Math.min(0,...ty.map(p=>p.v)),highTy=Math.max(1.4,...ty.map(p=>p.v));
  const lowVy=Math.min(-1,...vy.map(p=>p.v)),highVy=Math.max(0,...vy.map(p=>p.v));
  panel(ty,26,95,lowTy,highTy,'상향 추력 / 무게',palette.thrust,1);
  panel(vy,127,199,lowVy,highVy,'수직 속도 (m/s)',palette.velocity,0);
  const axisTimes=timeSpan>0?[start,(start+end)/2,end]:[0];
  for(const [i,t]of axisTimes.entries()){
    svg+='<text x="'+x(t)+'" y="218" text-anchor="'+(i===0?'start':i===2?'end':'middle')+'">'+tick(t)+'</text>';
  }
  svg+='<text x="'+right+'" y="238" text-anchor="end">출발 후 시간 (s)</text>';
  for(const [i,event]of events.entries()){
    const yy=263+i*21;
    svg+='<line x1="22" x2="40" y1="'+(yy-4)+'" y2="'+(yy-4)+'" stroke="'+event.color+'" stroke-width="2" stroke-dasharray="3 3"/><text x="48" y="'+yy+'">'+event.label.replace('>','&gt;')+' · '+(stamp(event.time)||event.empty)+'</text>';
  }
  return svg+'</svg>';
}
