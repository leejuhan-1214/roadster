// DOM labels remain at native resolution; only the 3D buffer scales.
export function renderPixelRatio(width,height,deviceRatio=1,quality='smooth',budget=600000,mode='city'){
 const native=Math.min(2,Math.max(.1,deviceRatio));
 const area=Math.max(1,width*height);
 // Use the actual display density for the small lab and inspection scenes.
 // A city frame may shed pixels under load, but keep at least 80% of its
 // CSS width on an ordinary desktop. Cap very large displays by total area.
 const nativeRatio=Math.min(native,Math.sqrt(4200000/area));
 if(quality==='detail'||mode==='lab'||mode==='inspect')return nativeRatio;
 const loadScale=Math.sqrt(Math.max(225000,budget)/600000);
 return Math.min(nativeRatio,Math.max(.8,Math.min(1.5,native)*loadScale),Math.sqrt(3000000/area));
}
export function useDistantExterior(length, distance, viewportHeight, projectionY, wasDistant){
 const screenLength=length*viewportHeight*projectionY/(2*Math.max(.01,distance));
 return screenLength<(wasDistant?270:220);
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
