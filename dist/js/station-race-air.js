// Sporting gates measure the vehicle centre in metres above the flat circuit.
// The infield route opens only at flying altitude; the road remains continuous.
export const AIR_CEILING = 24;
export const AIR_GATES = [
  {index:5, lateral:-3.8, halfWidth:5.7, minY:2.5, maxY:9.5},
  {index:6, lateral:-11.0, halfWidth:6.1, minY:2.5, maxY:9.5},
  {index:7, lateral:-3.8, halfWidth:5.7, minY:2.5, maxY:9.5}
];

const guide = [
  {index:4.55,lateral:-2}, ...AIR_GATES, {index:7.45,lateral:-2}
];
export function airLaneOffset(distance,courseLength){
  const local = ((distance%courseLength)+courseLength)%courseLength;
  const station = local/courseLength*12;
  if(station<guide[0].index || station>guide[guide.length-1].index)return null;
  for(let i=1;i<guide.length;i++){
    const a=guide[i-1],b=guide[i];
    if(station>b.index)continue;
    const t=(station-a.index)/(b.index-a.index);
    return a.lateral+(b.lateral-a.lateral)*t*t*(3-2*t);
  }
  return null;
}

export function insideRaceEnvelope(projection,y,course){
  if(!Number.isFinite(y)||y<-.5)return false;
  if(projection.error<=course.width/2+1.5)return true;
  if(y<2.5||y>9.5)return false;
  const lane=airLaneOffset(projection.distance,course.length);
  return lane!==null && Math.abs(projection.lateral-lane)<=6.3;
}

export function throughAirGate(index,lateral,y){
  const gate=AIR_GATES.find(g=>g.index===index);
  return !!gate && y>=gate.minY && y<=gate.maxY && Math.abs(lateral-gate.lateral)<=gate.halfWidth;
}
