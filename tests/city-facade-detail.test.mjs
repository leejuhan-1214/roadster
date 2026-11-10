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
