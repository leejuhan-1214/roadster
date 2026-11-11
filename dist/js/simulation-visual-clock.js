// Render effects follow simulated time. The camera continues to use wall time.
export class SimulationVisualClock {
  constructor(){this.reset();}
  reset(){this.solverTime=null;this.renderTime=null;this.time=0;}
  advance(renderTime,solverTime=renderTime){
    const solver=Number.isFinite(solverTime)?Math.max(0,solverTime):(this.solverTime??0);
    const render=Math.max(0,Math.min(Number.isFinite(renderTime)?renderTime:solver,solver));
    const reset=this.solverTime!==null&&solver<this.solverTime-1e-9;
    // A modal/pause can display alpha=1, then resume at a smaller interpolation
    // alpha before a new physics step. Hold FX there; this is not a trial reset.
    if(reset)this.renderTime=null;
    const dt=this.renderTime===null?0:Math.max(0,render-this.renderTime);
    this.renderTime=this.renderTime===null?render:Math.max(this.renderTime,render);
    this.solverTime=solver;this.time=this.renderTime;
    return {dt,time:this.time,reset};
  }
}