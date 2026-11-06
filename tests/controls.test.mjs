import test from 'node:test';
import assert from 'node:assert/strict';
import { manualInput } from '../dist/js/controls.js';

test('WASD uses tire controls on ground and attitude requests in air', () => {
  const keys = new Set(['KeyW','KeyA']);
  const ground=manualInput(keys,false),air=manualInput(keys,true);
  assert.equal(ground.throttle,1);assert.equal(ground.steer,1);
  assert.equal(ground.airMoveForward,0);assert.equal(ground.airMoveRight,0);
  assert.equal(air.throttle,0);assert.equal(air.steer,0);
  assert.equal(air.airMoveForward,1);assert.equal(air.airMoveRight,-1);
  assert.equal(manualInput(new Set(['KeyS','KeyD']),true).airMoveForward,-1);
  assert.equal(manualInput(new Set(['KeyS','KeyD']),true).airMoveRight,1);
});
test('Space takes manual thrust priority over altitude hold and release restores it',()=>{
  const settings={altHold:true,targetHeight:3,stabilize:true};
  const active=manualInput(new Set(['Space']),true,settings);
  assert.equal(active.lift,1);assert.equal(active.altHold,false);
  const released=manualInput(new Set(),true,settings);
  assert.equal(released.lift,0);assert.equal(released.altHold,true);assert.equal(released.targetHeight,3);
});
test('opposite direction keys cancel and released input has no movement request',()=>{
  const out=manualInput(new Set(['KeyW','KeyS','KeyA','KeyD']),true);
  assert.equal(out.airMoveForward,0);assert.equal(out.airMoveRight,0);
  const released=manualInput(new Set(),true);
  for(const key of ['airMoveForward','airMoveRight','lift','pitch','roll','yaw'])assert.equal(released[key],0);
});
