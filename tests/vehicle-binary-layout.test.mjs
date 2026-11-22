import test from 'node:test';
import assert from 'node:assert/strict';
import {open} from 'node:fs/promises';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';

// Check the attributes as delivered to WebGL, before Three.js has been able
// to unpack and repair them. A geometry-only Node render can mask bad strides.
const componentBytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};

test('vehicle vertex attributes and animation samplers use portable GLB layouts',async()=>{
 for(const profile of VEHICLES.filter(p=>p.url)){
  const file=await open(new URL('../dist/js/'+profile.url,import.meta.url));
  try{
   const header=Buffer.alloc(20);
   await file.read(header,0,20,0);
   const chunk=Buffer.alloc(header.readUInt32LE(12));
   await file.read(chunk,0,chunk.length,20);
   const doc=JSON.parse(chunk.toString('utf8'));
   for(const mesh of doc.meshes){
    for(const primitive of mesh.primitives){
     for(const id of Object.values(primitive.attributes)){
      const a=doc.accessors[id],view=doc.bufferViews[a.bufferView];
      if(!view)continue; // e.g. Draco supplies this attribute during decoding.
      const size=count[a.type]*componentBytes[a.componentType];
      assert.equal(((view.byteOffset||0)+(a.byteOffset||0))%4,0,profile.id+' vertex start');
      assert.equal((view.byteStride||size)%4,0,profile.id+' vertex stride');
     }
    }
   }
   for(const animation of doc.animations||[]){
    for(const sampler of animation.samplers){
     for(const id of [sampler.input,sampler.output]){
      const view=doc.bufferViews[doc.accessors[id].bufferView];
      if(view)assert.equal(view.byteStride,undefined,profile.id+' animation accessor');
     }
    }
   }
  }finally{await file.close();}
 }
});
