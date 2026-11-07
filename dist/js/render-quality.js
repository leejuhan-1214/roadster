// DOM labels remain at native resolution; only the 3D buffer scales.
export function renderPixelRatio(width,height,deviceRatio=1,quality='smooth',budget=600000){
 const native=Math.min(1,Math.max(.1,deviceRatio));
 return quality==='detail'?native:Math.min(native,Math.sqrt(budget/Math.max(1,width*height)));
}
export class RenderBudget{
 constructor(){this.pixels=600000;this.elapsed=0;this.totalMs=0;this.frames=0;this.cooldown=2;}
 observe(ms){
  if(!Number.isFinite(ms)||ms<4||ms>100)return false;
  const seconds=ms/1000;if(this.cooldown>0){this.cooldown-=seconds;return false;}
  this.elapsed+=seconds;this.totalMs+=ms;this.frames++;
  if(this.elapsed<2)return false;
  const mean=this.totalMs/this.frames;this.elapsed=0;this.totalMs=0;this.frames=0;
  if(mean>21&&this.pixels>360000){this.pixels=Math.max(360000,Math.round(this.pixels*.8));this.cooldown=3;return true;}
  if(mean<17.2&&this.pixels<600000){this.pixels=Math.min(600000,Math.round(this.pixels*1.05));this.cooldown=10;return true;}
  return false;
 }
}
