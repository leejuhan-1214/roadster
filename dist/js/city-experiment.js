// City-only experiment settings. These are deliberately separate from the
// controlled landing experiment and never mutate the simulator themselves.
export const CITY_SURFACES=Object.freeze([
  Object.freeze({id:'dry',label:'건조 아스팔트',friction:1.15}),
  Object.freeze({id:'wet',label:'젖은 노면',friction:.65}),
  Object.freeze({id:'ice',label:'빙판',friction:.15}),
  Object.freeze({id:'none',label:'마찰 없음',friction:0}),
]);
export const CITY_EXPERIMENT_DEFAULTS=Object.freeze({
  surface:'dry',rollingResistance:.015,aeroEnabled:true,
  windX:0,windZ:0,roadRoughness:.15,
});
export const BRAKE_STOP_SPEED=.1; // m/s; the displayed integer km/h is not a stop detector.
export const BRAKE_DECEL_WINDOW=.05; // Peak horizontal speed loss averaged over 50 ms.
export const BRAKE_REASONS=Object.freeze({
  collision:'장애물 충돌',airborne:'접지 상실',released:'정지 전 B 해제',
  'settings-changed':'실험 조건 변경','vehicle-changed':'차체 변경',
  reset:'주행 초기화',paused:'일시정지',timeout:'60초 안에 정지하지 않음',thrust:'추진기 작동',
  invalid:'유효하지 않은 측정 상태',drift:'드리프트 입력',
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const numeric=(value,fallback,min,max)=>{
  const n=(typeof value==='number'||typeof value==='string'&&value.trim()!=='')?Number(value):NaN;
  return Number.isFinite(n)?clamp(n,min,max):fallback;
};
export function normalizeCityExperiment(value={}){
  const source=value&&typeof value==='object'?value:{},d=CITY_EXPERIMENT_DEFAULTS;
  return {
    surface:CITY_SURFACES.some(s=>s.id===source.surface)?source.surface:d.surface,
    rollingResistance:numeric(source.rollingResistance,d.rollingResistance,0,.08),
    aeroEnabled:typeof source.aeroEnabled==='boolean'?source.aeroEnabled:d.aeroEnabled,
    windX:numeric(source.windX,d.windX,-30,30),windZ:numeric(source.windZ,d.windZ,-30,30),
    roadRoughness:numeric(source.roadRoughness,d.roadRoughness,0,1),
  };
}
export function cityExperimentParams(value={}){
  const s=normalizeCityExperiment(value),{friction}=CITY_SURFACES.find(p=>p.id===s.surface);
  return {friction,rollingResistance:s.rollingResistance,aeroEnabled:s.aeroEnabled,
    windX:s.windX,windZ:s.windZ,roadRoughness:s.roadRoughness};
}
const view=trial=>trial?{
  initialSpeed:trial.initialSpeed,distance:trial.distance,elapsed:trial.elapsed,
  maxDeceleration:trial.maxDeceleration,vehicleId:trial.vehicleId,settings:{...trial.settings},
}:null;

/**
 * Observe once immediately BEFORE each city physics step. The next observation
 * includes that step's motion and collisions, including collisions that stop
 * the car. The observer never writes pose, velocity, input or physical params.
 * A rising manual B press above 2 m/s starts a ground braking measurement.
 */
export class CityBrakeTrial {
  constructor(){this._results=[];this._serial=0;this.reset();}
  reset({keepResults=false}={}){
    this._active=null;this._held=false;this.status='idle';this.reason='';
    if(!keepResults){this._results=[];this.lastResult=null;}
  }
  clear(){this.reset();}
  cancel(reason='reset'){
    if(this._active)this._finish(false,reason);
    return this.status;
  }
  getSnapshot(){return {status:this.status,reason:this.reason,current:view(this._active),
    lastResult:this.lastResult,results:this._results.slice()};}
  _finish(valid,reason=''){
    const a=this._active;if(!a)return;
    const result=Object.freeze({...view(a),settings:Object.freeze({...a.settings}),id:++this._serial,
      valid,reason,stoppingDistance:valid?a.distance:null,stoppingTime:valid?a.elapsed:null,
      stopSpeed:BRAKE_STOP_SPEED,decelerationWindow:BRAKE_DECEL_WINDOW});
    this.lastResult=result;this._results.push(result);if(this._results.length>6)this._results.shift();
    this._active=null;this.status=valid?'complete':'invalid';this.reason=reason;
  }
  sample(sim,{braking=false,drifting=false,airborne=false,settings=CITY_EXPERIMENT_DEFAULTS,vehicleId=''}={}){
    const held=!!braking,rising=held&&!this._held;this._held=held;
    if(!this._active&&!rising)return this.status;
    const s=sim?.state,time=s?.time,x=s?.pos?.x,z=s?.pos?.z,speed=Math.hypot(s?.vel?.x,s?.vel?.z);
    if(![time,x,z,speed].every(Number.isFinite)){this.cancel('invalid');return this.status;}
    const collisionCount=sim.collisionCount||0,collision=sim.obstacleContacts?.length>0;
    const flying=airborne||sim.contactCount===0;
    const thrust=(sim.totalThrust||0)>100;
    const normalized=normalizeCityExperiment(settings),key=JSON.stringify(normalized);
    if(this._active){
      const a=this._active,dt=time-a.previousTime;
      // Collision detection precedes the speed threshold: a wall stop cannot
      // become a successful braking result, even if it happens in one step.
      if(collision||collisionCount!==a.collisionCount)this._finish(false,'collision');
      else if(time<a.previousTime)this._finish(false,'reset');
      else if(key!==a.settingsKey)this._finish(false,'settings-changed');
      else if(vehicleId!==a.vehicleId)this._finish(false,'vehicle-changed');
      else if(flying)this._finish(false,'airborne');
      else if(thrust)this._finish(false,'thrust');
      else if(drifting)this._finish(false,'drift');
      else if(dt>0){
        const distance=Math.hypot(x-a.previousX,z-a.previousZ);
        const fraction=speed<=BRAKE_STOP_SPEED&&a.previousSpeed>BRAKE_STOP_SPEED?
          clamp((a.previousSpeed-BRAKE_STOP_SPEED)/(a.previousSpeed-speed),0,1):1;
        a.distance+=distance*fraction;a.elapsed=(time-dt*(1-fraction))-a.startTime;
        a.speeds.push({time,speed});
        while(a.speeds.length>2&&a.speeds[1].time<=time-BRAKE_DECEL_WINDOW)a.speeds.shift();
        const first=a.speeds[0],window=time-first.time;
        if(window>=BRAKE_DECEL_WINDOW-.000001)
          a.maxDeceleration=Math.max(a.maxDeceleration,(first.speed-speed)/window);
        a.previousTime=time;a.previousX=x;a.previousZ=z;a.previousSpeed=speed;
        if(speed<=BRAKE_STOP_SPEED)this._finish(true);
        else if(!held)this._finish(false,'released');
        else if(a.elapsed>=60)this._finish(false,'timeout');
      }else if(!held)this._finish(false,'released');
    }
    // Ignore a held key after completion/cancellation until it is released.
    // Invalid initial conditions do not produce misleading zero-length trials.
    if(!this._active&&rising&&speed>=2&&!flying&&!collision&&!thrust&&!drifting){
      this._active={initialSpeed:speed,distance:0,elapsed:0,maxDeceleration:0,
        vehicleId,settings:normalized,settingsKey:key,startTime:time,collisionCount,
        previousTime:time,previousX:x,previousZ:z,previousSpeed:speed,speeds:[{time,speed}]};
      this.status='measuring';this.reason='';
    }
    return this.status;
  }
}

export function brakeResultsCSV(results=[]){
  const escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const number=value=>Number.isFinite(value)?Number(value.toFixed(6)):'';
  const header=['trial','vehicle','valid','reason','initial_speed_km_h','stopping_distance_m','stopping_time_s',
    'observed_path_m','observed_time_s','max_deceleration_50ms_m_s2','stop_threshold_m_s',
    'surface','friction_mu','rolling_resistance_Crr','aero_enabled','wind_x_m_s','wind_z_m_s','road_roughness'];
  const rows=results.map(r=>{
    const settings=normalizeCityExperiment(r.settings),params=cityExperimentParams(settings);
    return [r.id,r.vehicleId,r.valid?'yes':'no',BRAKE_REASONS[r.reason]||r.reason,
      number(r.initialSpeed*3.6),number(r.stoppingDistance),number(r.stoppingTime),number(r.distance),
      number(r.elapsed),number(r.maxDeceleration),BRAKE_STOP_SPEED,settings.surface,params.friction,
      settings.rollingResistance,settings.aeroEnabled,settings.windX,settings.windZ,settings.roadRoughness];
  });
  return '\uFEFF'+[header,...rows].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
