// Hysteresis prevents alternation between two facade levels near a boundary.
// Measure to the footprint rather than the centre of a long podium.
export function distanceSelection(areas,onChange){
  let previousX=Infinity,previousZ=Infinity,previousRadius=-1;
  const selected=new Uint8Array(areas.length);
  return (x,z,radius=105)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(radius))return false;
    radius=Math.max(0,radius);
    const first=previousRadius<0;
    if(!first&&radius===previousRadius&&(x-previousX)**2+(z-previousZ)**2<64)return false;
    previousX=x;previousZ=z;previousRadius=radius;
    let changed=first;
    for(let i=0;i<areas.length;i++){
      const a=areas[i],dx=Math.max(a.minX-x,0,x-a.maxX),dz=Math.max(a.minZ-z,0,z-a.maxZ);
      const limit=radius+(selected[i]?12:0),near=Number(dx*dx+dz*dz<=limit*limit);
      if(selected[i]!==near){selected[i]=near;changed=true;}
    }
    if(changed)onChange(selected);
    return changed;
  };
}

export function footprintBounds(points){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const [x,z] of points){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  return {minX,maxX,minZ,maxZ};
}

export function uploadPrefix(attribute,count){
  attribute.clearUpdateRanges();
  if(count>0){attribute.addUpdateRange(0,count);attribute.needsUpdate=true;}
}
