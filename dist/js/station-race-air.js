export const AIR_CEILING = 24;
export const AIR_APPROACH = 105;
export const AIR_RESTART_RUNUP = 90;
export const AIR_GATE_LAYOUT=[
  {offset:-145,lateral:0,height:4.4},
  {offset:-80,lateral:-4.1,height:6.5},
  {offset:-18,lateral:.6,height:9.2},
  {offset:52,lateral:4.1,height:5.7},
  {offset:128,lateral:-.8,height:4.2}
].map(({offset,lateral,height})=>({offset,aperture:{lateral,halfWidth:3.45,minY:height-2.35,maxY:height+2.35}}));

export const RIVAL_COM_HEIGHT=.63;
const paths=new WeakMap();
function flightPath(layout){
  let path=paths.get(layout);
  if(!path){
    path=[{offset:layout[0].offset-AIR_APPROACH,height:0,lateral:0,blend:0},
      ...layout.map(({offset,aperture:a})=>({offset,height:(a.minY+a.maxY)/2-RIVAL_COM_HEIGHT,lateral:a.lateral,blend:1})),
      {offset:layout.at(-1).offset+95,height:0,lateral:0,blend:0}];
    paths.set(layout,path);
  }
  return path;
}
const ground=Object.freeze({height:0,slope:0,lateral:0,lateralSlope:0,blend:0,blendSlope:0});

// A zero slope through each timing plane gives the driver time to change
// thrust direction. The guide returns underbody height above the road.
export function rivalAirPath(distance, course) {
  const d=distance-course.airSectionDistance;
  const local=d-Math.round(d/course.length)*course.length;
  const path=flightPath(course.airLayout||AIR_GATE_LAYOUT);
  if(local<=path[0].offset||local>=path.at(-1).offset)return ground;
  let i=1;
  while(local>path[i].offset)i++;
  const a=path[i-1],b=path[i],span=b.offset-a.offset,t=(local-a.offset)/span;
  const smooth=t*t*(3-2*t),derivative=6*t*(1-t)/span;
  return {
    height:a.height+(b.height-a.height)*smooth,slope:(b.height-a.height)*derivative,
    lateral:a.lateral+(b.lateral-a.lateral)*smooth,lateralSlope:(b.lateral-a.lateral)*derivative,
    blend:a.blend+(b.blend-a.blend)*smooth,blendSlope:(b.blend-a.blend)*derivative
  };
}

export function insideRaceEnvelope(projection,y,course){
  return Number.isFinite(y) && y>=-.5 && projection.error<=course.width/2+1.5;
}

// The timing aperture is measured at the centre of mass, in world metres.
// Grade-separated overflights, reverse approaches and grounded cars cannot score.
export function throughAirGate(gate,lateral,y){
  if(!gate?.air)return false;
  const a=gate.aperture,halfHeight=(a.maxY-a.minY)/2;
  const side=(lateral-a.lateral)/a.halfWidth,up=(y-a.minY-halfHeight)/halfHeight;
  return side*side+up*up<=1+1e-9;
}
