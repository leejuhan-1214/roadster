// Bound GPU work by pixel count, while keeping DOM labels at native resolution.
export function renderPixelRatio(width,height,deviceRatio=1,quality='smooth'){
 const native=Math.min(1,Math.max(.1,deviceRatio));
 return quality==='detail'?native:Math.min(native,Math.sqrt(600000/Math.max(1,width*height)));
}
