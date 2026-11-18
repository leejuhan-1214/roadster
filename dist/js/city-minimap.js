// Rasterize the nearby mapped streets with a margin. Driving within that
// margin only moves the crop; the heading marker still follows the vehicle.
const scale=.53;
const roadBounds=new WeakMap();
let streetLayer;

function boundsFor(road){
  let bounds=roadBounds.get(road);
  if(!bounds){
    bounds={minX:Infinity,minZ:Infinity,maxX:-Infinity,maxZ:-Infinity};
    for(const [x,z] of road.points){
      bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
      bounds.minZ=Math.min(bounds.minZ,z);bounds.maxZ=Math.max(bounds.maxZ,z);
    }
    roadBounds.set(road,bounds);
  }
  return bounds;
}

export function drawMappedStreets(ctx,roads,x,z){
  const {width,height}=ctx.canvas,margin=64;
  const offsetX=streetLayer?(x-streetLayer.x)*scale:Infinity,offsetZ=streetLayer?(z-streetLayer.z)*scale:Infinity;
  if(!streetLayer || streetLayer.roads!==roads || streetLayer.width!==width || streetLayer.height!==height ||
     Math.abs(offsetX)>margin-1 || Math.abs(offsetZ)>margin-1){
    const canvas=streetLayer?.canvas??document.createElement('canvas');
    canvas.width=width+margin*2;canvas.height=height+margin*2;
    const layer=canvas.getContext('2d'),cx=canvas.width/2,cz=canvas.height/2;
    layer.fillStyle='#142029';layer.fillRect(0,0,canvas.width,canvas.height);
    for(const road of roads){
      if(!road.points?.length)continue;
      const b=boundsFor(road),pad=road.width;
      if(b.maxX<x-cx/scale-pad || b.minX>x+cx/scale+pad || b.maxZ<z-cz/scale-pad || b.minZ>z+cz/scale+pad)continue;
      layer.beginPath();layer.strokeStyle=road.width>14?'#839197':'#4e626d';
      layer.lineWidth=Math.max(1.5,road.width*scale*.6);
      for(let i=0;i<road.points.length;i++){
        const [rx,rz]=road.points[i],px=cx+(rx-x)*scale,pz=cz+(rz-z)*scale;
        if(i)layer.lineTo(px,pz);else layer.moveTo(px,pz);
      }
      layer.stroke();
    }
    streetLayer={canvas,roads,x,z,width,height};
  }
  ctx.drawImage(streetLayer.canvas,margin+(x-streetLayer.x)*scale,margin+(z-streetLayer.z)*scale,width,height,0,0,width,height);
}
