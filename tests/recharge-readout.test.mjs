import test from 'node:test';
import assert from 'node:assert/strict';
import {RechargeReadout,formatRechargeTime} from '../dist/js/recharge-readout.js';

test('charging estimate cache counts down without running solver every frame and resets on state changes',()=>{
 let calls=0;const readout=new RechargeReadout(()=>{calls++;return {seconds:90,reason:'ready'};});
 const state={time:10,gas:100},params={compressorPowerKW:300},options={enabled:true,capacityKg:250};
 assert.match(readout.update(state,params,options).text,/1분 30초/);
 state.time=11;assert.equal(readout.update(state,params,options).seconds,89);assert.equal(calls,1);
 state.time=12;readout.update(state,params,options);assert.equal(calls,2);
 state.time=0;readout.update(state,params,options);assert.equal(calls,3);
 readout.update(state,{compressorPowerKW:60},options);assert.equal(calls,4);
 assert.equal(readout.update(state,params,{...options,enabled:false}),null);
 readout.update(state,params,options);assert.equal(calls,5);
});
test('charging readout separates operational completion and blocked charging without fabricating time',()=>{
 const readout=new RechargeReadout(()=>{throw Error('No prediction while blocked');});
 const params={compressorTargetFraction:.99},options={enabled:true,capacityKg:250};
 assert.match(readout.update({gas:247.5,time:0},params,options).text,/99%/);
 assert.match(readout.update({gas:100,time:0},params,{...options,status:'moving'}).text,/정차/);
 assert.match(readout.update({gas:100,time:0},params,{...options,status:'battery'}).text,/배터리/);
 assert.equal(formatRechargeTime(61.1),'1분 2초');assert.equal(formatRechargeTime(8),'8초');
});
