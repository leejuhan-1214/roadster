export const AIR_CEILING = 24;
export const AIR_APPROACH = 105;
export const AIR_GATE_SPACING = 14;
export const AIR_APERTURE = Object.freeze({lateral:0, halfWidth:6.7, minY:2.3, maxY:7.7});
export const AIR_RESTART_RUNUP = 90;

function aroundSector(distance, course) {
  const delta = distance - course.airSectionDistance;
  return delta - Math.round(delta / course.length) * course.length;
}

// Nominal AI underbody rise. A smoothstep reaches cruising height before the
// first ring and has horizontal tangents through the timing planes.
export function rivalAirPath(distance, course) {
  const x = aroundSector(distance, course);
  const half = AIR_GATE_SPACING + 3, rise = 85, fall = 76;
  if (x <= -half-rise || x >= half+fall) return {height:0, slope:0, lateral:0, blend:0};
  const climbing = x < -half;
  const u = climbing ? (x+half+rise)/rise : x > half ? (half+fall-x)/fall : 1;
  const blend = u*u*(3-2*u);
  const slope = u===1 ? 0 : 4 * 6*u*(1-u) * (climbing ? 1/rise : -1/fall);
  return {height:4*blend, slope, lateral:0, blend};
}

export function insideRaceEnvelope(projection,y,course){
  return Number.isFinite(y) && y>=-.5 && projection.error<=course.width/2+1.5;
}

// The timing aperture is measured at the centre of mass, in world metres.
// Grade-separated overflights, reverse approaches and grounded cars cannot score.
export function throughAirGate(gate,lateral,y){
  return !!gate?.air && y>=AIR_APERTURE.minY && y<=AIR_APERTURE.maxY
    && Math.abs(lateral-AIR_APERTURE.lateral)<=AIR_APERTURE.halfWidth;
}
