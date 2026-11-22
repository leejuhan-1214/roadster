const offsets=[0,6,-6,12,-12,18,-18,24,-24];

function onRoad(roads,x,z){
  return roads.some(road=>road.points.some((b,i)=>{
    if(!i)return false;
    const a=road.points[i-1],dx=b[0]-a[0],dz=b[1]-a[1];
    const fraction=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-a[0]-fraction*dx,z-a[1]-fraction*dz)<=road.width/2;
  }));
}

/** Prepare an actual, collision-free lane without modifying the current car or camera. */
export async function prepareWarpArrival(city,sim,point,{signal}={}){
  if(!point||![point.x,point.z,point.heading].every(Number.isFinite))
    throw new Error('워프 지점의 좌표가 잘못되었습니다.');
  if(signal?.aborted)throw new DOMException('Warp cancelled','AbortError');
  const stream=city.streaming,bounds=city.bounds;
  const areaReady=(x,z)=>stream?stream.areaReadyAt(x,z):
    x-8>=bounds.minX&&x+8<bounds.maxX&&z-8>=bounds.minZ&&z+8<bounds.maxZ;
  await stream?.prepareAt(point.x,point.z,signal);
  if(signal?.aborted)throw new DOMException('Warp cancelled','AbortError');
  const roads=city.roads.filter(road=>String(road.id)===point.roadId);
  const forwardX=Math.cos(point.heading),forwardZ=-Math.sin(point.heading);
  const {halfLength,halfWidth}=sim.parkingFootprint();
  for(const offset of offsets){
    const x=point.x+offset*forwardX,z=point.z+offset*forwardZ;
    if(!areaReady(x,z))continue;
    const corners=[];
    for(const longitudinal of [-halfLength,halfLength])for(const lateral of [-halfWidth,halfWidth]){
      const u=longitudinal-sim.cg.x,v=lateral-sim.cg.z;
      corners.push([x+u*forwardX-v*forwardZ,z+u*forwardZ+v*forwardX]);
    }
    if(!corners.every(([px,pz])=>onRoad(roads,px,pz)))continue;
    if(city.streetOverlay&&!corners.every(([px,pz])=>city.streetOverlay.prepareCellAt(px,pz)))continue;
    // Use the low road reference so that a building roof can never be chosen as ground.
    const surfaceY=sim.surfaceHeightAt(x,z,0);
    if(Number.isFinite(surfaceY)&&sim.parkingClearAt(x,z,point.heading,surfaceY))
      return {x,z,heading:point.heading,surfaceY};
  }
  throw new Error('선택한 도로에서 차량이 안전하게 설 공간을 찾지 못했습니다.');
}
