import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {pavedMedianMask} from '../dist/js/city-median.js';
import {createCityWorld} from '../dist/js/city-world.js';
import {buildCityTile} from '../dist/js/city-tile-builder.js';

test('the joined Gangnam bus lane near spawn contains neither generated trunks nor light masts',()=>{
  const data=JSON.parse(readFileSync(new URL('../dist/assets/city/gangnam.json',import.meta.url)));
  const paved=pavedMedianMask(data.roads);
  assert.equal(paved(10.16145230008799,22.642743060661104),true,'previous trunk 14.17 metres from the spawn');
  const city=createCityWorld(data);
  try{
    assert.ok(city.treePlacements.length>100);
    assert.ok(city.treePlacements.every(({x,z})=>!paved(x,z)));
    const poles=city.root.getObjectByName('streetlight poles'),matrix=new Matrix4(),pos=new Vector3();
    for(let i=0;i<poles.count;i++){
      poles.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix);
      assert.equal(paved(pos.x,pos.z),false);
    }
  }finally{city.dispose();}
});

test('streamed trees and their collision shapes are generated only off shared centre pavement',()=>{
  const road=(id,z,reverse)=>({id,name:'강남대로',type:'primary',width:13,oneway:true,
    points:reverse?[[120,z],[-120,z]]:[[-120,z],[120,z]]});
  const run=separation=>{
    const roads=[road(1,separation/2,false),road(2,-separation/2,true)];
    return {tile:buildCityTile({roads,buildings:[]},{bounds:{minX:-128,maxX:128,minZ:-128,maxZ:128}}),paved:pavedMedianMask(roads)};
  };
  const {tile,paved}=run(18);
  assert.ok(tile.trees.length>=6&&tile.trees.every(t=>!paved(t.x+tile.origin[0],t.z+tile.origin[1])));
  assert.equal(new Set(tile.obstacles.filter(o=>o.treeId).map(o=>o.treeId)).size,tile.trees.length);
  assert.ok(run(40).tile.trees.length>tile.trees.length,'the inner tree rows on a genuinely wide median remain');
});
