// Controlled educational rig. Effective drag areas are Cd times reference
// area (m²); the underside value is a model assumption, not an OEM test.
export const STANDARD_AIR_DENSITY = 1.225;
export const RIG_VERTICAL_DRAG_AREA = 3.4;

export function dragConstant(p) {
  if (!p.aeroEnabled) return 0;
  return .5 * (p.airDensity ?? STANDARD_AIR_DENSITY) *
    (p.verticalDragArea ?? RIG_VERTICAL_DRAG_AREA) * (p.dragScale ?? 1);
}

// Upright, constant-mass release from rest into still air, down positive.
// k = rho*Cd*A/(2m). expm1 and log1p preserve the short-drop limit.
export function freeDrop(height, gravity, k) {
  if (!(k > 0)) {
    const speed = Math.sqrt(height) * Math.sqrt(2 * gravity);
    return {speed, time: speed / gravity};
  }
  const kh = k * height;
  const fraction = Math.sqrt(-Math.expm1(-2 * kh));
  return {speed: Math.sqrt(gravity / k) * fraction,
    time: (kh + Math.log1p(fraction)) / Math.sqrt(gravity * k)};
}

// Freeze the commanded upward thrust and mass; the opposing drag decreases
// with downward speed. Integrate v/(a0+k*v²) from target to entry speed.
export function predictedBrakeDistance(entry, target, a0, k) {
  if (entry <= target) return 0;
  const difference = (entry - target) * (entry + target);
  if (!(k > 0)) return a0 > 0 ? difference / (2 * a0) : null;
  const endAcceleration = a0 + k * target ** 2;
  return endAcceleration > 0 ? Math.log1p(k * difference / endAcceleration) / (2 * k) : null;
}
