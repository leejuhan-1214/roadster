import assert from 'node:assert/strict';
import test from 'node:test';
import {BufferGeometry, Float32BufferAttribute, Group, Mesh, InstancedMesh, BoxGeometry, MeshBasicMaterial, Matrix4, Color} from 'three';
import {createRoadDrawRanges} from '../dist/js/city-road-detail.js';

test('road display keeps intersecting long triangles, restores both ends, and follows newly loaded tiles',()=>{
  const vertices=[];
  for(const x of [0,1800]){
    for(let i=0;i<300;i++)vertices.push(x,0,i*.01,x+1,0,i*.01,x,0,i*.01+1);
  }
  vertices.push(10,0,0,1950,0,0,1950,0,1);
  const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(vertices,3));
  const road=new Mesh(geometry);road.name='OSM road network';
  const root=new Group();root.add(road);
  const tile=new Group(),markings=new Mesh();markings.name='lane markings and crossings';tile.add(markings);
  const streaming={chunks:new Map(),manifest:{tiles:{east:{bounds:{minX:1550,maxX:2100,minZ:-10,maxZ:10}}}},revision:0};
  const update=createRoadDrawRanges({root,streaming});
  const submitted=()=>Array.from(geometry.index.array.slice(0,geometry.drawRange.count));
  update(0,0,0);
  assert.equal(submitted().length,903);
  assert.ok(submitted().includes(1800));
  assert.ok(!submitted().includes(900));
  streaming.chunks.set('east',{root:tile});streaming.revision++;
  update(0,0,0);assert.equal(tile.visible,false);
  update(1000,0,0);assert.equal(tile.visible,true);assert.equal(markings.visible,false);
  update(1800,0,0);assert.equal(markings.visible,true);assert.ok(submitted().includes(900));assert.ok(!submitted().includes(0));
  update(1800,0,0,true);assert.equal(submitted().length,1803);
  update(0,0,0);assert.ok(submitted().includes(0));assert.equal(tile.visible,false);
});

test('lamp instances retain their original transforms and colour on returning',()=>{
  const lights=new InstancedMesh(new BoxGeometry(),new MeshBasicMaterial(),2);
  lights.name='streetlight poles';
  lights.setMatrixAt(0,new Matrix4().makeTranslation(4,3,6));
  lights.setMatrixAt(1,new Matrix4().makeTranslation(800,3,6));
  lights.setColorAt(0,new Color(0xffccaa));lights.setColorAt(1,new Color(0x88aabb));
  const root=new Group();root.add(lights);
  const update=createRoadDrawRanges({root}),color=new Color(),matrix=new Matrix4();
  update(800,6,0);assert.equal(lights.count,1);
  lights.getColorAt(0,color);assert.equal(color.getHex(),0x88aabb);
  lights.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],800);
  update(4,6,0);lights.getColorAt(0,color);assert.equal(color.getHex(),0xffccaa);
  update(4,6,0,true);assert.equal(lights.count,2);
  assert.ok(lights.boundingSphere.radius>397);
});
