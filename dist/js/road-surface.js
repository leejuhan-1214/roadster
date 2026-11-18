// Educational brush-inspired combined slip; not measured Tesla tire data.
// https://api.chrono.projectchrono.org/wheeled_tire.html
// https://www.mathworks.com/help/sdl/ref/tireroadinteractionmagicformula.html
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),num=(x,d=0)=>Number.isFinite(x)?x:d;
const preset=(id,label,muPeak,muSlide,rollingResistance)=>Object.freeze({id,label,muPeak,muSlide,rollingResistance,assumed:true});
export const ROAD_SURFACES=Object.freeze({dry:preset('dry','마른 노면',1.15,.90,.015),wet:preset('wet','젖은 노면',.65,.48,.016),ice:preset('ice','얼음 노면',.15,.09,.010),zero:preset('zero','무마찰 비교',0,0,0)});
export function getRoadSurface(id='dry'){return Object.hasOwn(ROAD_SURFACES,id)?ROAD_SURFACES[id]:ROAD_SURFACES.dry;}
// City height targets use the parked chassis pose as zero above the local road.
export function rideHeightAboveSurface(sim){
 const {x,y,z}=sim.state.pos;
 return y-sim.restHeight-(sim.surfaceHeightAt?.(x,z,y)??0);
}
const WAVES=[[.50,7,1,.22],[.30,3.8,.37,1],[.20,2.4,.8,-.6]].map(([weight,len,x,z])=>{const k=2*Math.PI/(len*Math.hypot(x,z));return {weight,kx:x*k,kz:z*k};});
// Continuous deterministic relief, max 3mm × roughness; no random per-frame kicks.
export function sampleRoadSurface(x,z,{roughness=1}={}){
 if(!Number.isFinite(x)||!Number.isFinite(z))throw new TypeError('Road coordinates must be finite.');
 const amp=.003*clamp(num(roughness,1),0,2);if(amp===0)return {height:0,normal:[0,1,0],gradient:[0,0]};
 let value=0,dx=0,dz=0;for(const w of WAVES){const phase=w.kx*x+w.kz*z;value+=w.weight*Math.sin(phase);const derivative=w.weight*Math.cos(phase);dx+=derivative*w.kx;dz+=derivative*w.kz;}
 const fade=Math.exp(-(x*x+z*z)/64),envelope=1-fade;
 const dhDx=amp*(envelope*dx+value*fade*x/32),dhDz=amp*(envelope*dz+value*fade*z/32),length=Math.hypot(dhDx,1,dhDz);
 return {height:amp*envelope*value,normal:[-dhDx/length,1/length,-dhDz/length],gradient:[dhDx,dhDz]};
}
const zero=()=>({fx:0,fy:0,rolling:0,totalFx:0,magnitude:0,limit:0,peakLimit:0,utilization:0,sliding:false,slipDemand:0});
// Load, lateral slip and available grip are constant during the implicit
// wheel-speed solve. Only longitudinal slip is sampled at each iteration.
export function tireForceAtSlip(o={}){
 const p=getRoadSurface(o.surface),load=Math.max(0,num(o.normalLoad)),muPeak=Math.max(0,num(o.muPeak,p.muPeak));
 if(o.grounded===false||load===0||muPeak===0)return (slip,longitudinalOnly)=>longitudinalOnly?0:zero();
 const ratio=p.muPeak>0?p.muSlide/p.muPeak:.78,muSlide=clamp(num(o.muSlide,muPeak*ratio),0,muPeak);
 const crr=Math.max(0,num(o.rollingResistance,p.rollingResistance)),cx=Math.max(0,num(o.longitudinalStiffness,11000)),cy=Math.max(0,num(o.corneringStiffness,55000));
 const alpha=clamp(num(o.slipAngle),-1.45,1.45),speed=num(o.forwardSpeed);
 const demandY=-cy*Math.tan(alpha),peakLimit=muPeak*load,rollingAtLoad=-crr*load*Math.tanh(speed/.6);
 return function evaluate(slip,longitudinalOnly=false){
   const demandX=cx*num(slip),demand=Math.hypot(demandX,demandY),q=demand/(3*peakLimit);
   let magnitude=0,limit=peakLimit;
   if(q<=1){
     magnitude=peakLimit*q*(3-q*(3-q));
   }else{
     const transition=Math.exp(-(((q-1)/.8)**2));
     limit=load*(muSlide+(muPeak-muSlide)*transition);magnitude=limit;
   }
   let fx=demand>0?magnitude*demandX/demand:0,fy=demand>0?magnitude*demandY/demand:0,rolling=rollingAtLoad;
   const combined=Math.hypot(fx+rolling,fy);
   if(combined>limit&&combined>0){
     const scale=limit/combined;fx*=scale;fy*=scale;rolling*=scale;
   }
   if(longitudinalOnly)return fx;
   const totalFx=fx+rolling,resultant=Math.hypot(totalFx,fy);
   return {fx,fy,rolling,totalFx,magnitude:resultant,limit,peakLimit,utilization:resultant/peakLimit,sliding:q>1,slipDemand:q};
 };
}
export function tireContactForces(o={}){return tireForceAtSlip(o)(o.slipRatio);}
