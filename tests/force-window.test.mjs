import test from 'node:test';
import assert from 'node:assert/strict';
import {ForceWindow} from '../dist/js/force-window.js';
test('same physical impulse has the same20ms average at0.5,1and2ms resolution',()=>{
 for(const dt of [.0005,.001,.002]){const window=new ForceWindow();let peak=0;
 for(let i=0;i<Math.round(.1/dt);i++)peak=Math.max(peak,window.push(i===Math.round(.04/dt)?100:0,dt));
 assert.ok(Math.abs(peak-5000)<1e-8);assert.ok(Math.abs(window.push(0,.02))<1e-8);}
});
test('constant support force converges toN and excludes samples outside20ms',()=>{
 const window=new ForceWindow();let value;for(let i=0;i<20;i++)value=window.push(40,.002);
 assert.ok(Math.abs(value-20000)<1e-8);assert.ok(Math.abs(window.push(0,.01)-10000)<1e-7);
 assert.ok(Math.abs(window.push(0,.02))<1e-8);window.clear();assert.equal(window.duration,0);
});
