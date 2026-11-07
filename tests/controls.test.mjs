import test from 'node:test';
import assert from 'node:assert/strict';
import { manualInput, canSelectDirection } from '../dist/js/controls.js';

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

test('electric pedals separate braking from reverse and disable flight controls even airborne',()=>{
  for(const airborne of [false,true]){
    const drive=manualInput(new Set(['KeyW','KeyA','ShiftLeft','ArrowUp','KeyQ']),airborne,{driveMode:'electric',gear:'D'});
    assert.equal(drive.throttle,1);assert.equal(drive.steer,1);assert.equal(drive.regen,true);
    for(const key of ['lift','pitch','roll','yaw','airMoveForward','airMoveRight'])assert.equal(drive[key],0);
    for(const key of ['boost','fan','wing','altHold','stabilize'])assert.equal(drive[key],false);
    const reverse=manualInput(new Set(['KeyW']),airborne,{driveMode:'electric',gear:'R'});assert.equal(reverse.throttle,-1);
    for(const brakeKey of ['KeyS','KeyB','Space']){
      const braking=manualInput(new Set(['KeyW',brakeKey]),airborne,{driveMode:'electric',gear:'R'});
      assert.equal(braking.throttle,0);assert.equal(braking.brake,1);
    }
  }
  const released=manualInput(new Set(),false,{driveMode:'electric',regen:false});assert.equal(released.throttle,0);assert.equal(released.brake,0);assert.equal(released.regen,false);
});
test('direction interlock rejects moving, airborne and invalid speed states',()=>{
  assert.equal(canSelectDirection(0,4),true);assert.equal(canSelectDirection(.49,4),true);
  for(const speed of [.5,15,-2,Infinity,NaN])assert.equal(canSelectDirection(speed,4),false);
  assert.equal(canSelectDirection(0,0),false);
});
