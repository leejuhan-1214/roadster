import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3} from 'three';
import {createStreetDetails} from '../dist/js/city-facades.js';

function fixture(offset=0){
  const building={id:'district-4-block-2',center:[offset,0],height:30,points:[[-10+offset,-8],[10+offset,-8],[10+offset,8],[-10+offset,8]]};
  const road={a:[offset-30,-15],b:[offset+30,-15],dx:1,dz:0,length:60,road:{width:8}};
  return {building,road};
}
function dispose(root){
  const geometries=new Set(),materials=new Set();
  root.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.material)materials.add(node.material);});
  for(const item of [...geometries,...materials])item.dispose();
}

test('nearby facade storeys remain within the building-front visual envelope',()=>{
  const {building,road}=fixture();
  const root=createStreetDetails([building],[road]);
  try{
    assert.equal(root.userData.buildings,1);
    const glazing=root.getObjectByName('podium-glazing');
    assert.ok(glazing.count>5,'upper-storey panes supplement street-level glazing');
    const bounds=new Box3().setFromObject(root);
    assert.ok(bounds.min.z>=-8.1001,'new panels must not extend into the sidewalk');
    assert.ok(bounds.max.z<=8.001);
    assert.ok(root.children.length<=6,'storeys share the original batches');
    assert.ok(root.userData.instances<10000);
  }finally{dispose(root);}
});

test('streamed districts can centre facade detail on their local area',()=>{
  const {building,road}=fixture(10000);
  const distant=createStreetDetails([building],[road]);
  const nearby=createStreetDetails([building],[road],{detailCenter:[10000,0],detailRadius:100});
  try{
    assert.equal(distant.userData.buildings,0);
    assert.equal(nearby.userData.buildings,1);
    assert.ok(new Box3().setFromObject(nearby).min.x>9989);
  }finally{dispose(distant);dispose(nearby);}
});

test('moving between streets submits only nearby frontage instances and restores their tints',()=>{
  const left=fixture(),right=fixture(240);right.building.id='east';
  const root=createStreetDetails([left.building,right.building],[left.road,right.road]);
  try{
    const glazing=root.getObjectByName('podium-glazing'),initialCount=root.userData.instances;
    assert.ok(root.updateDetail(0,0,75));
    const count=glazing.count,tint=glazing.instanceColor.array.slice(0,count*3);
    assert.equal(root.userData.activeBuildings,1);assert.ok(root.userData.instances<initialCount);
    assert.equal(root.updateDetail(1,0,75),false);
    assert.ok(root.updateDetail(240,0,75));
    assert.ok(glazing.instanceMatrix.array[12]>225);
    assert.notDeepEqual(glazing.instanceColor.array.slice(0,count*3),tint);
    root.updateDetail(700,0,75);
    assert.equal(root.userData.drawCalls,0);assert.equal(root.userData.instances,0);
    root.updateDetail(0,0,75);
    assert.deepEqual(glazing.instanceColor.array.slice(0,count*3),tint);
    assert.ok(Math.abs(glazing.instanceMatrix.array[12])<15);
    assert.equal(glazing.count,count);assert.ok(root.userData.drawCalls<=6);
  }finally{dispose(root);}
});
