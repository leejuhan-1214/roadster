// Physical observation interval, independent of the solver step. Includes the
// time integral of compliant contact forces plus any rigid-contact impulse.
// This is an average reaction, not a resolved crash pulse or injury criterion.
export const FORCE_WINDOW_SECONDS=.020;
export class ForceWindow {
  constructor(seconds=FORCE_WINDOW_SECONDS){this.seconds=seconds;this.clear();}
  clear(){this.entries=[];this.duration=0;this.impulse=0;}
  push(impulseNs,dt){
    if(!(dt>0)||!Number.isFinite(impulseNs))throw new RangeError('Finite impulse and positive step required.');
    this.entries.push({impulse:Math.max(0,impulseNs),dt});
    this.duration+=dt;this.impulse+=Math.max(0,impulseNs);
    while(this.duration>this.seconds+1e-12){
      const first=this.entries[0],trim=Math.min(first.dt,this.duration-this.seconds);
      const removed=first.impulse*trim/first.dt;
      this.duration-=trim;this.impulse-=removed;first.dt-=trim;first.impulse-=removed;
      if(first.dt<1e-12)this.entries.shift();
    }
    // Samples before the run began are zero; never divide by a short start-up window.
    return Math.max(0,this.impulse)/this.seconds;
  }
}
