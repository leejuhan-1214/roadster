/** Vehicle-relative inputs. Air movement requests a bounded attitude through
 * the finite-gas controller; this module never changes position or velocity. */
export function manualInput(keys, airborne, settings = {}) {
  const pressed = code => keys.has(code) ? 1 : 0;
  if(settings.driveMode==='electric') {
    const brake=pressed('KeyS')||pressed('KeyB')||pressed('Space');
    return {
      throttle:brake?0:pressed('KeyW')*(settings.gear==='R'?-1:1),
      steer:pressed('KeyA')-pressed('KeyD'),brake,regen:settings.regen!==false,
      airMoveForward:0,airMoveRight:0,lift:0,boost:false,pitch:0,roll:0,yaw:0,
      stabilize:false,altHold:false,fan:false,wing:false,
    };
  }
  const forward = pressed('KeyW') - pressed('KeyS');
  const right = pressed('KeyD') - pressed('KeyA');
  const lift = pressed('Space');
  return {
    throttle: airborne ? 0 : forward,
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

// Simulator interlock: choose direction only near a stop; this is not a Roadster calibration.
export function canSelectDirection(horizontalSpeed,contactCount) {
  return Number.isFinite(horizontalSpeed)&&Math.abs(horizontalSpeed)<.5&&contactCount>0;
}
