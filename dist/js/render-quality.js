// DOM labels remain at native resolution; only the 3D buffer scales.
export function renderPixelRatio(width,height,deviceRatio=1,quality='smooth',budget=600000){
 const native=Math.min(1,Math.max(.1,deviceRatio));
 return quality==='detail'?native:Math.min(native,Math.sqrt(budget/Math.max(1,width*height)));
}
export class RenderBudget{
 constructor(){this.pixels=600000;this.elapsed=0;this.totalMs=0;this.frames=0;this.cooldown=.7;}
 observe(ms){
  // Keep sustained low frame rates in the feedback loop. A background-tab
  // pause or debugger stop should not lower resolution on its own.
  if(!Number.isFinite(ms)||ms<4||ms>=500)return false;
  ms=Math.min(ms,100);
  const seconds=ms/1000;if(this.cooldown>0){this.cooldown-=seconds;return false;}
  this.elapsed+=seconds;this.totalMs+=ms;this.frames++;
  if(this.elapsed<1.2||this.frames<9)return false;
  const mean=this.totalMs/this.frames;this.elapsed=0;this.totalMs=0;this.frames=0;
  const floor=mean>38?225000:360000;
  if(mean>21&&this.pixels>floor){this.pixels=Math.max(floor,Math.round(this.pixels*(mean>38?.68:.8)));this.cooldown=1.2;return true;}
  if(mean<17.2&&this.pixels<600000){this.pixels=Math.min(600000,Math.round(this.pixels*1.05));this.cooldown=10;return true;}
  return false;
 }
}
