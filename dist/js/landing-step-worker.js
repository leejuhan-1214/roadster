import {PhysicsSim} from './physics.js?v=20261122-wheel-repair';
import {LANDING_STEP,LANDING_AUDIT_STEPS,releaseLandingVehicle,recordLandingRelease,landingRunInput,updateLandingRun} from './landing-experiment.js?v=20261120-basemass';

// Use the frozen release and the planner's original trigger in each replay.
// The digital controller still samples the vehicle every 2 ms, with commands
// held between updates. The integrator and contact sensors run at the audit h.
export function replayLandingStep(source,step){
  if(!LANDING_AUDIT_STEPS.includes(step))throw new RangeError('지원하지 않는 계산 간격입니다.');
  const sim=new PhysicsSim(source.parameters);
  const config=releaseLandingVehicle(sim,{...source.config,physicsStep:step});
  const run=recordLandingRelease(sim,config,source.plan,null);
  const stepsPerCommand=Math.round(LANDING_STEP/step);
  let input;
  for(let i=0;!run.done;i++){
    if(i%stepsPerCommand===0)input=landingRunInput(run,sim);
    sim.step(step,input);
    updateLandingRun(run,sim,step);
  }
  return {
    step,status:run.status,initialMass:run.initialMass,initialGas:run.initialGas,
    speed:run.touchdownSpeed,impulse:run.contactEndTime===null?null:run.groundImpulseNs,
    peak:run.touchdownTime===null?null:run.peakEquivalentGroundForceN,
    autoBrakeTime:run.autoBrakeTime,contactTime:run.touchdownTime,contactEndTime:run.contactEndTime,gasUsed:run.gasUsed
  };
}

if(typeof WorkerGlobalScope!=='undefined'&&self instanceof WorkerGlobalScope){
  self.onmessage=({data})=>{
    try{
      const rows=[];
      for(const step of LANDING_AUDIT_STEPS){
        self.postMessage({step});
        rows.push(replayLandingStep(data,step));
      }
      self.postMessage({rows});
    }catch(error){
      self.postMessage({error:error.message});
    }
  };
}
