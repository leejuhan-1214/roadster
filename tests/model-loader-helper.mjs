// Geometry-only Node loader for the actual shipped assets. Texture-backed
// materials are replaced by named neutral materials; mesh data is not mocked.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';

let dracoPromise;
async function nodeDraco(){
  if(!dracoPromise)dracoPromise=(async()=>{
    const dir=new URL('../node_modules/three/examples/jsm/libs/draco/gltf/',import.meta.url);
    const source=await readFile(new URL('draco_wasm_wrapper.js',dir),'utf8');
    // Execute the installed Three.js decoder glue, never any downloaded model
    // content. Supplying its WASM bytes avoids browser Worker and URL emulation.
    const factory=new Function('require','__dirname',source+';return DracoDecoderModule;')(createRequire(import.meta.url),fileURLToPath(dir));
    return factory({wasmBinary:new Uint8Array(await readFile(new URL('draco_decoder.wasm',dir)))});
  })();
  return dracoPromise;
}

const dracoShim={
  preload(){return this;},
  decodeDracoFile(buffer,callback,ids,types,colorSpace,onError){
    nodeDraco().then(draco=>{
      const decoder=new draco.Decoder(),mesh=new draco.Mesh();
      try{
        const bytes=new Int8Array(buffer),status=decoder.DecodeArrayToMesh(bytes,bytes.byteLength,mesh);
        if(!status.ok())throw Error(status.error_msg());
        const geometry=new THREE.BufferGeometry();
        const constants={Float32Array:'DT_FLOAT32',Int8Array:'DT_INT8',Int16Array:'DT_INT16',Int32Array:'DT_INT32',Uint8Array:'DT_UINT8',Uint16Array:'DT_UINT16',Uint32Array:'DT_UINT32'};
        for(const [name,id]of Object.entries(ids)){
          const attribute=decoder.GetAttributeByUniqueId(mesh,id),Type=globalThis[types[name]],count=mesh.num_points()*attribute.num_components(),length=count*Type.BYTES_PER_ELEMENT;
          const ptr=draco._malloc(length);
          try{decoder.GetAttributeDataArrayForAllPoints(mesh,attribute,draco[constants[types[name]]],length,ptr);geometry.setAttribute(name,new THREE.BufferAttribute(new Type(draco.HEAPF32.buffer,ptr,count).slice(),attribute.num_components()));}
          finally{draco._free(ptr);}
        }
        const count=mesh.num_faces()*3,ptr=draco._malloc(count*4);
        try{decoder.GetTrianglesUInt32Array(mesh,count*4,ptr);geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(draco.HEAPF32.buffer,ptr,count).slice(),1));}
        finally{draco._free(ptr);}
        callback(geometry);
      }finally{draco.destroy(mesh);draco.destroy(decoder);}
    }).catch(onError);
  },
};

export async function loadModelGeometry(profile){
  if(!globalThis.ProgressEvent)globalThis.ProgressEvent=class extends Event{constructor(type,init={}){super(type);Object.assign(this,init);}};
  let data,json;
  if(profile.id==='roadster'){
    const dir=new URL('../dist/assets/tesla-roadster-2020/',import.meta.url);
    json=JSON.parse(await readFile(new URL('scene.gltf',dir),'utf8'));
    for(const buffer of json.buffers)buffer.uri='data:application/octet-stream;base64,'+(await readFile(new URL(buffer.uri,dir))).toString('base64');
    data=JSON.stringify(json);
  }else{
    const bytes=await readFile(new URL('../dist/js/'+profile.url,import.meta.url));
    json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
    data=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  }
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(dracoShim).register(()=>({name:'node-named-materials',loadMaterial:index=>Promise.resolve(new THREE.MeshStandardMaterial({name:json.materials?.[index]?.name||''}))}));
  return loader.parseAsync(data,'');
}
