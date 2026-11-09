import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// Download the official CC0 1k glTF, its bin and textures from
// https://api.polyhaven.com/files/tree_small_02 before running.
// node scripts/prepare-city-tree.mjs SOURCE_DIRECTORY MESHOPT_SIMPLIFIER_MODULE
const source=path.resolve(process.argv[2]),out=path.resolve('dist/assets/trees');
const {MeshoptSimplifier:S}=await import(pathToFileURL(path.resolve(process.argv[3])).href);await S.ready;
const doc=JSON.parse(await fs.readFile(path.join(source,'tree_small_02_1k.gltf'),'utf8')),binary=await fs.readFile(path.join(source,'tree_small_02.bin'));
function read(i){const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],off=(v.byteOffset||0)+(a.byteOffset||0),stride={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],C={5125:Uint32Array,5123:Uint16Array,5126:Float32Array}[a.componentType];return new C(binary.buffer,binary.byteOffset+off,a.count*stride);}
const primitives=doc.meshes[0].primitives.map(p=>({positions:read(p.attributes.POSITION),normals:read(p.attributes.NORMAL),uv:read(p.attributes.TEXCOORD_0),uv1:read(p.attributes.TEXCOORD_1),indices:read(p.indices),material:p.material}));
const leaf=primitives[1],parents=new Uint32Array(leaf.positions.length/3);for(let i=0;i<parents.length;i++)parents[i]=i;
const find=i=>{let root=i;while(parents[root]!==root)root=parents[root];while(parents[i]!==i){const next=parents[i];parents[i]=root;i=next;}return root;};
for(let i=0;i<leaf.indices.length;i+=3){const a=find(leaf.indices[i]);parents[find(leaf.indices[i+1])]=a;parents[find(leaf.indices[i+2])]=a;}
const components=new Map();for(let i=0;i<parents.length;i++){const root=find(i);if(!components.has(root))components.set(root,[]);components.get(root).push(i);}
const hash=i=>{let n=Math.imul(i+1,374761393);n=Math.imul(n^(n>>>13),1274126177);return (n^(n>>>16))>>>0;};
// Fit alpha-cut cards to the source leaves' location, orientation and UVs.
const cards=[];
for(const [id,verts]of components){
 const mean=[0,0,0],uv=[0,0],min=[Infinity,Infinity],max=[-Infinity,-Infinity],normal=[0,0,0];
 for(const i of verts){for(let k=0;k<3;k++){mean[k]+=leaf.positions[i*3+k]/verts.length;normal[k]+=leaf.normals[i*3+k];}for(let k=0;k<2;k++){const v=leaf.uv[i*2+k];uv[k]+=v/verts.length;min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}}
 let uu=0,vv=0,uvv=0;const up=[0,0,0],vp=[0,0,0];
 for(const i of verts){const u=leaf.uv[i*2]-uv[0],v=leaf.uv[i*2+1]-uv[1];uu+=u*u;vv+=v*v;uvv+=u*v;for(let k=0;k<3;k++){up[k]+=u*(leaf.positions[i*3+k]-mean[k]);vp[k]+=v*(leaf.positions[i*3+k]-mean[k]);}}
 const det=uu*vv-uvv*uvv;if(Math.abs(det)<1e-12)continue;
 const a=up.map((v,k)=>(v*vv-vp[k]*uvv)/det),b=vp.map((v,k)=>(v*uu-up[k]*uvv)/det),len=Math.hypot(...normal);if(!len)continue;
 const width=Math.hypot(...a)*(max[0]-min[0]),height=Math.hypot(...b)*(max[1]-min[1]);
 if(Math.min(width,height)<.012||Math.max(width,height)>.8)continue;
 cards.push({id,mean,uv,min,max,a,b,normal:normal.map(n=>n/len)});
}
cards.sort((a,b)=>hash(a.id)-hash(b.id));
function leafLOD(count,scale){const pos=[],normals=[],uvs=[],indices=[];for(const c of cards.slice(0,count)){const offset=pos.length/3;for(const [u,v]of [[c.min[0],c.min[1]],[c.max[0],c.min[1]],[c.max[0],c.max[1]],[c.min[0],c.max[1]]]){for(let k=0;k<3;k++)pos.push(c.mean[k]+scale*(c.a[k]*(u-c.uv[0])+c.b[k]*(v-c.uv[1])));normals.push(...c.normal);uvs.push(u,v);}indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);}return {positions:new Float32Array(pos),normals:new Float32Array(normals),uv:new Float32Array(uvs),indices:new Uint32Array(indices),material:1};}
function woodLOD(p,target){const [indices,error]=S.simplify(new Uint32Array(p.indices),p.positions,3,target*3,.03,['Permissive']);const [remap,n]=S.compactMesh(indices);const positions=new Float32Array(n*3),normals=new Float32Array(n*3),uv=new Float32Array(n*2),sourceUV=p.material===0?p.uv1:p.uv;
 for(let i=0;i<remap.length;i++){const j=remap[i];if(j===0xffffffff)continue;positions.set(p.positions.subarray(i*3,i*3+3),j*3);normals.set(p.normals.subarray(i*3,i*3+3),j*3);uv.set(sourceUV.subarray(i*2,i*2+2),j*2);}console.log('wood',p.material,'triangles',indices.length/3,'error',error);return {positions,normals,uv,indices,material:p.material};}
const near=[woodLOD(primitives[0],1600),leafLOD(4400,1.5),woodLOD(primitives[2],1400)];
const far=[woodLOD(primitives[0],420),leafLOD(1200,2.4),woodLOD(primitives[2],400)];
const result={asset:{version:'2.0',generator:'Roadster CC0 foliage LOD preparation'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{mesh:0,name:'TreeSmall02_LOD0'},{mesh:1,name:'TreeSmall02_LOD1'}],meshes:[],materials:structuredClone(doc.materials),textures:[],images:[],samplers:[{wrapS:10497,wrapT:10497}],accessors:[],bufferViews:[],buffers:[],extensionsUsed:['KHR_texture_transform'],extensionsRequired:['KHR_texture_transform']};
result.materials.forEach((m,i)=>{delete m.normalTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;m.pbrMetallicRoughness.roughnessFactor=.9;const map={index:i};if(i===0)map.extensions=structuredClone(m.pbrMetallicRoughness.baseColorTexture.extensions);m.pbrMetallicRoughness.baseColorTexture=map;if(i===1){m.alphaMode='MASK';m.alphaCutoff=.42;}else{m.normalTexture={index:i===0?3:4};if(i===0)m.normalTexture.extensions=structuredClone(map.extensions);}});
for(const uri of ['branch-diff.jpg','leaves-rgba.png','trunk-diff.jpg','branch-normal.jpg','trunk-normal.jpg']){result.images.push({uri});result.textures.push({sampler:0,source:result.images.length-1});}
const chunks=[];let offset=0;
function attr(data,type,target){const chunk=Buffer.from(data.buffer,data.byteOffset,data.byteLength),vi=result.bufferViews.length;result.bufferViews.push({buffer:0,byteOffset:offset,byteLength:chunk.length,target});chunks.push(chunk);offset+=chunk.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}const stride={SCALAR:1,VEC2:2,VEC3:3}[type],ac={bufferView:vi,componentType:data instanceof Float32Array?5126:5125,count:data.length/stride,type};if(type==='VEC3'){ac.min=Array(stride).fill(Infinity);ac.max=Array(stride).fill(-Infinity);for(let i=0;i<data.length;i++){ac.min[i%stride]=Math.min(ac.min[i%stride],data[i]);ac.max[i%stride]=Math.max(ac.max[i%stride],data[i]);}}result.accessors.push(ac);return result.accessors.length-1;}
for(const [i,lod]of [near,far].entries()){const prims=[];for(const p of lod)prims.push({attributes:{POSITION:attr(p.positions,'VEC3',34962),NORMAL:attr(p.normals,'VEC3',34962),TEXCOORD_0:attr(p.uv,'VEC2',34962)},indices:attr(p.indices,'SCALAR',34963),material:p.material});result.meshes.push({name:'Tree Small 02 LOD '+i,primitives:prims});}
result.buffers.push({uri:'tree-small-02.bin',byteLength:offset});await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'tree-small-02.gltf'),JSON.stringify(result));await fs.writeFile(path.join(out,'tree-small-02.bin'),Buffer.concat(chunks));console.log(JSON.stringify({sourceTriangles:primitives.reduce((n,p)=>n+p.indices.length/3,0),sourceLeafComponents:components.size,eligibleLeafCards:cards.length,nearTriangles:near.reduce((n,p)=>n+p.indices.length/3,0),farTriangles:far.reduce((n,p)=>n+p.indices.length/3,0),binaryBytes:offset},null,2));
