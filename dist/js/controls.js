/** Vehicle-relative inputs. Air movement requests a bounded nozzle direction through
 * the finite-gas controller; this module never changes position or velocity. */
export function manualInput(keys, airborne, settings = {}) {
  const pressed = code => keys.has(code) ? 1 : 0;
  const forward = pressed('KeyW') - pressed('KeyS');
  const right = pressed('KeyD') - pressed('KeyA');
  const lift = pressed('Space');
  return {
    throttle: airborne || pressed('KeyB') ? 0 : forward,
    steer: airborne ? 0 : -right,
    airMoveForward: airborne ? forward : 0,
    airMoveRight: airborne ? right : 0,
    brake: pressed('KeyB'), boost: !!(pressed('ShiftLeft') || pressed('ShiftRight')),
    lift,
    pitch: pressed('ArrowDown') - pressed('ArrowUp'),
    roll: pressed('ArrowRight') - pressed('ArrowLeft'),
    yaw: pressed('KeyQ') - pressed('KeyE'),
    stabilize: settings.stabilize !== false,
    altHold: !!settings.altHold && !lift,
    targetHeight: settings.targetHeight ?? .8,
    fan: !!settings.fan, wing: !!settings.wing,
  };
}
