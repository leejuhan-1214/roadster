import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceFrame} from '../dist/js/frame-steps.js';

const step=.002;
function clock(cost){
  const state={time:0,steps:0,captures:[]};
  state.frame=(debt,budget,stopAt)=>advanceFrame(debt,step,budget,()=>{
    state.time+=cost;
    state.steps++;
    return state.steps!==stopAt;
  },()=>state.captures.push(state.steps),()=>state.captures.push(state.steps),()=>state.time);
  return state;
}
test('30 and 60 Hz render the same fixed-step timeline and only copy the final pair of poses',()=>{
  for(const hz of [30,60]){
    const state=clock(.05);
    let debt=0;
    for(let frame=0;frame<hz;frame++){
      const count=state.captures.length;
      debt=state.frame(debt+1/hz,8);
      assert.equal(state.captures.length-count,2);
      assert.deepEqual(state.captures.slice(-2),[state.steps-1,state.steps]);
    }
    assert.ok(Math.abs(state.steps*step+debt-1)<1e-12);
    assert.ok(debt<step);
  }
});
test('a slow contact frame retains debt while returning to the renderer',()=>{
  const state=clock(3);
  const debt=state.frame(.04,8);
  assert.deepEqual(state.captures,[3,4]);
  assert.ok(Math.abs(debt-.032)<1e-12);
  state.frame(debt,100,6);
  assert.equal(state.steps,6);
});

test('can repay an interrupted slow frame within the normal maximum steps per draw',()=>{
  const state=clock(2);
  let debt=state.frame(.1,8);
  assert.equal(state.steps,5);
  debt=state.frame(debt+.1,100);
  assert.equal(state.steps,55);
  debt=state.frame(debt,100);
  assert.ok(Math.abs(state.steps*step+debt-.2)<1e-12);
  assert.ok(debt<step);
});
