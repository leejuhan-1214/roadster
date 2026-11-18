import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMappedStreets} from '../dist/js/city-minimap.js';

test('mapped streets scroll in world coordinates and rebuild for a new tile or a distant position',t=>{
  let strokes=0;
  const layer={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;}};
  const canvas={getContext:()=>layer},doc={createElement:()=>canvas};
  Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
  t.after(()=>delete globalThis.document);
  const crops=[],context={canvas:{width:200,height:150},drawImage:(...args)=>crops.push(args)};
  const road={points:[[0,0],[150,50]],width:6},roads=[road];
  drawMappedStreets(context,roads,0,0);
  drawMappedStreets(context,roads,10,-10);
  assert.equal(strokes,1);
  assert.ok(Math.abs(crops[1][1]-crops[0][1]-5.3)<1e-9);
  assert.ok(Math.abs(crops[1][2]-crops[0][2]+5.3)<1e-9);
  const newRoads=[road,{points:[[25,30],[40,50]],width:4}];
  drawMappedStreets(context,newRoads,10,-10);
  assert.equal(strokes,3);
  drawMappedStreets(context,newRoads,140,-10);
  assert.equal(strokes,5);
  assert.deepEqual(crops[0].slice(1),crops.at(-1).slice(1));
});
