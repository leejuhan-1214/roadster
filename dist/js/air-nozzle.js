export const R = 287, GAMMA = 1.4, CV = R / (GAMMA - 1), CP = GAMMA * CV;
export const ATMOSPHERE = 101325;
const CRITICAL = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));

/** Ideal convergent nozzle, exit=throat. Pressure thrust is retained when choked.
 * Pa absolute; K; m². Inlet is the supplied stagnation state; feed-line loss is applied upstream (Cd=1).
 */
export function nozzle(pressure, temperature, area, ambient = ATMOSPHERE) {
  if (!(pressure > ambient) || !(temperature > 0) || !(area > 0))
    return { mdot: 0, force: 0, ve: 0, pe: ambient, regime: 'off', effectiveVelocity: 0 };
  const choked = ambient / pressure <= CRITICAL;
  const pe = choked ? pressure * CRITICAL : ambient;
  const te = choked ? temperature * 2 / (GAMMA + 1) : temperature * (ambient / pressure) ** ((GAMMA - 1) / GAMMA);
  const ve = choked ? Math.sqrt(GAMMA * R * te) : Math.sqrt(Math.max(0, 2 * CP * (temperature - te)));
  const mdot = area * pe * ve / (R * te);
  const force = mdot * ve + (pe - ambient) * area;
  return { mdot, force, ve, pe, regime: mdot > 0 ? (choked ? 'choked' : 'subsonic') : 'off', effectiveVelocity: mdot > 0 ? force / mdot : 0 };
}
