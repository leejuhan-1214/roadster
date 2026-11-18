import {economyInitialState,measureEconomyPlan} from './landing-economy.js?v=20261118-study150';
import {landingClearance,releaseLandingVehicle,recordLandingRelease} from './landing-experiment.js?v=20261118-city151';

// Reuse a warm worker between trials. Only numeric release conditions cross
// the thread boundary. The running vehicle remains on the simulation thread.
export class LandingPlanner{
  warm(){
    if(this.idleWorker)return;
    try{
      const worker=new Worker(new URL('./landing-plan-worker.js?v=20261118-study150',import.meta.url),{type:'module'});
      worker.onerror=event=>{
        event.preventDefault();
        if(this.idleWorker===worker)this.idleWorker=null;
        worker.terminate();
      };
      this.idleWorker=worker;
    }catch{/* The current page may not support module workers. */}
  }

  request(initial,targetSpeed,signal){
    signal.throwIfAborted();
    const key=JSON.stringify([initial,targetSpeed]);
    if(this.lastKey===key)return Promise.resolve({economy:this.lastPlan,elapsedMs:0});
    this.warm();
    const worker=this.idleWorker;
    if(!worker)return Promise.resolve(measureEconomyPlan(initial,targetSpeed));
    this.idleWorker=null;
    return new Promise((resolve,reject)=>{
      const detach=()=>{
        signal.removeEventListener('abort',abort);
        worker.onmessage=worker.onmessageerror=worker.onerror=null;
      };
      const abort=()=>{detach();worker.terminate();reject(signal.reason);};
      const recover=()=>{
        detach();worker.terminate();
        try{resolve(measureEconomyPlan(initial,targetSpeed));}catch(error){reject(error);}
      };
      signal.addEventListener('abort',abort,{once:true});
      worker.onmessage=({data})=>{
        detach();
        if(this.idleWorker)worker.terminate();else this.idleWorker=worker;
        this.lastKey=key;this.lastPlan=data.economy;
        resolve(data);
      };
      worker.onmessageerror=recover;
      worker.onerror=event=>{event.preventDefault();recover();};
      try{worker.postMessage({initial,targetSpeed});}catch{recover();}
    });
  }

  async prepare(sim,options,signal){
    signal.throwIfAborted();
    const config=releaseLandingVehicle(sim,options);
    const initial=economyInitialState(sim,landingClearance(sim));
    const {economy,elapsedMs}=await this.request(initial,config.targetSpeed,signal);
    signal.throwIfAborted();
    return recordLandingRelease(sim,config,economy,elapsedMs);
  }
}
