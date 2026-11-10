import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsSim} from '../dist/js/physics.js';
import {createLandingRun,landingRunInput,updateLandingRun,LANDING_STEP} from '../dist/js/landing-experiment.js';
import {landingBaselineComparison,LandingUI} from '../dist/js/landing-ui.js';
import {bindLandingLiftControls} from '../dist/js/landing-controls.js';

function trial(manual=false){
  const sim=new PhysicsSim(),run=createLandingRun(sim,{height:3,method:'free'});
  while(!run.done){
    sim.step(LANDING_STEP,landingRunInput(run,sim,manual&&run.elapsed>=.1&&run.elapsed<.6));
    updateLandingRun(run,sim);
  }
  return {...run.result,id:manual?'manual':'auto',groupId:'same',vehicleId:'roadster',groupSize:2};
}
test('Space changes free fall through finite thrust, logs fixed-step duration and restores free fall on release',()=>{
  const free=trial(),manual=trial(true);
  assert.equal(free.manualLiftUsed,false);assert.equal(free.gasUsed,0);
  assert.equal(manual.manualLiftUsed,true);assert.ok(Math.abs(manual.manualLiftDuration-.5)<.003);
  assert.ok(manual.gasUsed>0);assert.ok(manual.touchdownTime>free.touchdownTime);
  assert.ok(manual.samples.some(s=>s.manualLift===1&&s.thrustN>1000));
  assert.ok(manual.samples.some(s=>s.time>1&&s.manualLift===0&&s.thrustN<1));
  assert.ok(manual.samples.every(s=>s.gasKg>=0));
});
test('manual input overrides all three controllers only before touchdown; release restores selected controller',()=>{
  for(const method of ['free','brake','gentle']){
    const sim=new PhysicsSim(),run=createLandingRun(sim,{method,height:3,brakeHeight:3});
    const before=landingRunInput(run,sim),held=landingRunInput(run,sim,true);
    assert.equal(held.lift,1);assert.equal(held.stabilize,true);assert.equal(held.verticalAcceleration,undefined);
    assert.deepEqual(landingRunInput(run,sim,false),before);
    run.touchdownTime=0;assert.equal(landingRunInput(run,sim,true).lift,0);
    run.done=true;assert.equal(landingRunInput(run,sim,true).lift,0);
  }
});
test('manual trials cannot serve as automatic free baseline or automatic best result',()=>{
  const free=trial(),manual={...trial(true),status:'landed',settled:true,bodyStrike:false,bottomedOut:false,peakEquivalentGroundForceN:1};
  assert.equal(landingBaselineComparison(manual,[free,manual]),null);
  assert.equal(landingBaselineComparison({...free,method:'gentle'},[manual]),null);
  const elements=new Map(),element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',value:''});return elements.get(key);};
  LandingUI.prototype.renderResults.call({results:[free,manual],selectedGroup:'same',dialog:{querySelector:element},renderChart(){}});
  assert.match(element('#landing-result-rows').innerHTML,/수동 Space/);
  assert.ok(!element('#landing-best').textContent.includes('최소 등가반력:'));
});

class Target{
  listeners={};
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  setPointerCapture(){}
  emit(type,properties={}){
    const event={code:'Space',button:0,pointerId:1,target:{matches:()=>false},preventDefault(){this.prevented=true;},...properties};
    for(const fn of this.listeners[type]||[])fn(event);
    return event;
  }
}
test('keyboard/pointer sources release independently and pause/blur/editing cannot leave lift stuck',()=>{
  const window=new Target(),document=new Target(),button=new Target();let ready=true,held=false;
  const clear=bindLandingLiftControls({window,document,button,isReady:()=>ready,onChange:value=>held=value});
  assert.equal(window.emit('keydown').prevented,true);assert.equal(held,true);
  button.emit('pointerdown');window.emit('keyup');assert.equal(held,true);
  button.emit('pointerup');assert.equal(held,false);
  for(const cancel of [()=>clear(),()=>window.emit('blur'),()=>document.emit('visibilitychange'),()=>document.emit('focusin',{target:{matches:()=>true}})]){
    window.emit('keydown');assert.equal(held,true);cancel();assert.equal(held,false);
    window.emit('keydown',{repeat:true});assert.equal(held,false,'held key cannot restart on the next trial');
  }
  ready=false;window.emit('keydown');assert.equal(held,false);
  ready=true;window.emit('keydown',{target:{isContentEditable:true}});assert.equal(held,false);
  window.emit('keydown',{ctrlKey:true});assert.equal(held,false);
  button.emit('pointerdown');button.emit('pointercancel');assert.equal(held,false);
});
