import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createTreeGroves,createTreeWind,updateTreeWind} from '../dist/js/city-trees.js';
import {createSpeciesGroves,createTreeLibrary,generateTree,SPECIES_LOD_DISTANCES,SPECIES_TILE_SIZE,TREE_SPECIES,TREE_VARIANTS} from '../dist/js/city-tree-species.js';
import {STREET_SPECIES,AVENUE_SPECIES,TREE_HEIGHTS,speciesForRoad,speciesAt,treeSeed} from '../dist/js/city-tree-mix.js';
import {createCityWorld} from '../dist/js/city-world.js';
import {buildCityTile} from '../dist/js/city-tile-builder.js';

const grown=Object.keys(TREE_SPECIES).filter(id=>!TREE_SPECIES[id].asset);
const watch=(grove,x)=>{const camera=new THREE.PerspectiveCamera();camera.position.set(x,4,grove.position.z);camera.updateMatrixWorld(true);grove.update(camera);return grove.getCurrentLevel();};
const release=root=>{root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});root.clear();};
const scanned=()=>({height:4.6,levels:[0,1].map(()=>[{geometry:new THREE.BoxGeometry(1,4.6,1),material:new THREE.MeshStandardMaterial()}])});

test('every species grows leafy trees, and no two seeds grow the same tree',()=>{
 assert.deepEqual(grown.slice().sort(),['cherry','ginkgo','metasequoia','pine','plane','zelkova']);
 const proportion={};
 for(const id of grown){
  const trees=Array.from({length:TREE_VARIANTS},(_,seed)=>generateTree(id,seed));
  for(const tree of trees){
   assert.ok(tree.height>7&&tree.height<17,id+' height '+tree.height);assert.ok(tree.branchCount>60&&tree.leafCount>500,id+' has a branched, leafy crown');
   const [near,middle]=tree.levels,p=near.attributes.position.array,uv=near.attributes.uv.array,sway=near.attributes.sway.array,index=near.index.array;
   assert.ok(p.every(Number.isFinite));assert.ok(uv.every(v=>v>=0&&v<=1),'atlas coordinates');assert.ok(sway.every(v=>v>=0&&v<=1));
   assert.ok(index.every(i=>i<p.length/3));assert.equal(near.attributes.color.count,near.attributes.position.count);
   assert.equal(near.userData.leafCards,tree.leafCount);assert.ok(near.userData.triangles>3000&&near.userData.triangles<12000,id+' near triangles '+near.userData.triangles);
   assert.ok(middle.userData.triangles<near.userData.triangles*.28,'the middle distance is much lighter');assert.ok(middle.userData.leafCards>100);
   near.computeBoundingBox();assert.ok(near.boundingBox.min.y>-.2,'nothing grows below the pavement');
   assert.ok(tree.crownBase>1.2,id+' keeps a clear trunk: crown base '+tree.crownBase);
  }
  // Same seed, same tree; another seed, another tree.
  const again=generateTree(id,0);assert.deepEqual(Array.from(again.levels[0].attributes.position.array.slice(0,300)),Array.from(trees[0].levels[0].attributes.position.array.slice(0,300)));
  const signatures=new Set(trees.map(t=>t.branchCount+':'+t.leafCount+':'+t.height.toFixed(3)+':'+t.reach.toFixed(3)));
  assert.equal(signatures.size,TREE_VARIANTS,id+' variants differ in branching, size and spread');
  proportion[id]=trees.reduce((sum,t)=>sum+t.reach/t.height,0)/trees.length;
  for(const tree of [...trees,again])for(const g of tree.levels)g.dispose();
 }
 // Habit: a dawn redwood is a narrow spire, a cherry spreads wider than a ginkgo.
 assert.ok(proportion.metasequoia<.42,'metasequoia '+proportion.metasequoia);assert.ok(proportion.cherry>proportion.ginkgo+.12);assert.ok(proportion.zelkova>proportion.metasequoia+.1);
 assert.throws(()=>generateTree('small',0),RangeError);
});

test('groves mix variants, give every tree its own stance and thin out with distance',()=>{
 const library=createTreeLibrary(),placements=[];
 for(let i=0;i<14;i++)placements.push({x:4+i*3.6,z:6+(i%2)*40,species:i%5===4?'zelkova':'ginkgo',seed:(i*.137+.05)%1,height:6,rotation:i});
 placements.push({x:900,z:0,species:'pine',seed:.3,height:6,rotation:1});
 const groves=createSpeciesGroves(library,placements);
 try{
  assert.equal(groves.children.length,2);assert.equal(groves.userData.treeCount,15);
  const grove=groves.children[0];groves.updateMatrixWorld(true);
  assert.equal(grove.levels.length,4);assert.deepEqual(grove.levels.map(l=>l.distance),SPECIES_LOD_DISTANCES);
  assert.ok(SPECIES_TILE_SIZE/2*Math.SQRT2<SPECIES_LOD_DISTANCES[1]-80,'a tree within 80 m of the camera is always at full detail');
  assert.equal(watch(grove,grove.position.x),0);
  const nearMeshes=grove.levels[0].object.children,geometries=new Set(nearMeshes.map(m=>m.geometry));
  assert.ok(nearMeshes.every(m=>m.isInstancedMesh&&m.castShadow&&m.receiveShadow&&m.customDepthMaterial===library.depthMaterial));
  assert.ok(geometries.size>=3,'two ginkgo variants and a zelkova share one grove');
  assert.equal(nearMeshes.reduce((sum,m)=>sum+m.count,0),14);
  // No two trees stand alike: size, lean, turn and tint differ per instance.
  const stances=new Set(),matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),color=new THREE.Color();
  for(const m of nearMeshes)for(let i=0;i<m.count;i++){m.getMatrixAt(i,matrix);matrix.decompose(p,q,s);m.getColorAt(i,color);stances.add([s.x,s.y,q.x,q.y,color.r].map(v=>v.toFixed(4)).join(','));assert.ok(Math.abs(q.x)+Math.abs(q.z)<.06,'a slight lean only');}
  assert.equal(stances.size,14);
  assert.equal(watch(grove,grove.position.x+SPECIES_LOD_DISTANCES[1]+30),1);
  const middle=grove.levels[1].object.children;assert.equal(middle.reduce((sum,m)=>sum+m.count,0),14);
  assert.ok(middle.every((m,i)=>m.geometry.index.count<nearMeshes[i].geometry.index.count*.3));
  assert.equal(watch(grove,grove.position.x+SPECIES_LOD_DISTANCES[2]+60),2);
  const far=grove.levels[2].object.children;assert.equal(far.length,1,'a distant grove is one draw');assert.equal(far[0].count,14);assert.ok(far[0].geometry.index.count/3<60);
  assert.equal(watch(grove,grove.position.x+SPECIES_LOD_DISTANCES[3]+90),3);assert.equal(grove.levels[3].object.children.length,0);
  assert.equal(library.resolve('small'),'cherry','without the scanned model a grown species stands in');
  // A season change recolours the distant crowns that exist, and only while they exist.
  assert.equal(library.farCrowns.size,2);const before=new THREE.Color();far[0].getColorAt(0,before);
  assert.equal(library.setSeason('autumn'),true);assert.equal(library.season,'autumn');assert.equal(library.setSeason('winter'),false);
  const after=new THREE.Color();far[0].getColorAt(0,after);assert.ok(after.r>before.r+.2&&after.r>after.b*2,'an autumn ginkgo is yellow');
 }finally{release(groves);assert.equal(library.farCrowns.size,0,'released groves leave the season registry');library.dispose();}
});

test('heights come from the species, and closed woodland switches to light crowns early',()=>{
 const library=createTreeLibrary();
 const row=createSpeciesGroves(library,[{x:10,z:10,species:'metasequoia',seed:.2,height:6,rotation:0},{x:20,z:10,species:'cherry',seed:.2,height:6,rotation:0}]);
 const tall=[];row.traverse(o=>{if(o.isInstancedMesh&&o.parent.name==='tree LOD 0'){const m=new THREE.Matrix4(),box=o.geometry.boundingBox.clone();o.getMatrixAt(0,m);tall.push(box.applyMatrix4(m).max.y);}});
 assert.ok(Math.max(...tall)>=TREE_HEIGHTS.metasequoia[0]-.5&&Math.min(...tall)<=TREE_HEIGHTS.cherry[1]+.5,'a dawn redwood stands well above a cherry: '+tall);
 assert.ok(Math.max(...tall)>Math.min(...tall)+4);release(row);
 const wood=Array.from({length:40},(_,i)=>({x:2+(i%8)*7,z:2+Math.floor(i/8)*9,species:['zelkova','pine','cherry'][i%3],seed:(i*.091)%1,height:6,rotation:i}));
 const dense=createSpeciesGroves(library,wood),grove=dense.children[0];dense.updateMatrixWorld(true);
 try{
  assert.equal(grove.levels.length,3,'near, small crowns, nothing');assert.equal(grove.levels[1].distance,SPECIES_LOD_DISTANCES[1]);
  assert.equal(watch(grove,grove.position.x+SPECIES_LOD_DISTANCES[1]+30),1);assert.equal(grove.levels[1].object.children[0].count,40);
  const triangles=grove.levels[0].object.children.reduce((sum,m)=>sum+m.geometry.index.count/3*m.count,0);
  assert.ok(triangles<40*1800,'forty close trees stay light: '+triangles);
 }finally{release(dense);library.dispose();}
});

test('the scanned tree becomes one kind among seven and shares its wind clock',()=>{
 const asset=scanned(),wind=createTreeWind();asset.wind=wind;
 // Without a library the original single-model grove is unchanged.
 const plain=createTreeGroves(asset,[{x:0,z:0,height:6,rotation:0},{x:5,z:10,height:7,rotation:1}]);
 assert.equal(plain.name,'Poly Haven Tree Small 02 · CC0');assert.equal(plain.children[0].levels.length,3);release(plain);
 asset.library=createTreeLibrary({asset,wind}).warm();
 assert.equal(asset.library.variantCount,grown.length*TREE_VARIANTS+1,'every variant is grown before driving');
 assert.equal(asset.library.wind,wind);updateTreeWind(asset,12.5,3,0);assert.equal(asset.library.wind.time.value,12.5);assert.equal(asset.library.wind.strength.value,2);
 const placements=[{x:0,z:0,height:6,rotation:0,species:'small',seed:.4},{x:8,z:4,height:6,rotation:1,species:'plane',seed:.7},{x:16,z:8,height:6,rotation:2}];
 const groves=createTreeGroves(asset,placements);
 try{
  assert.equal(groves.name,'street and park trees by species');assert.equal(groves.userData.treeCount,3);
  const near=groves.children[0].levels[0].object.children;
  assert.ok(near.some(m=>m.geometry===asset.levels[0][0].geometry),'the scanned model is still planted');
  assert.ok(near.some(m=>m.material===asset.library.material),'grown species stand beside it');
  assert.equal(near.reduce((sum,m)=>sum+m.count,0),3,'a placement without a species still gets a tree');
 }finally{release(groves);asset.library.dispose();for(const level of asset.levels)for(const part of level){part.geometry.dispose();part.material.dispose();}}
});

test('one species lines each street, in the district mix, in the core and in streamed tiles',async()=>{
 const total=STREET_SPECIES.reduce((sum,[,weight])=>sum+weight,0);assert.ok(Math.abs(total-1)<1e-9);
 // Gangnam-gu street trees: ginkgo 31.3 %, London plane 27.7 %, zelkova 13.8 % (2023 survey).
 assert.deepEqual(STREET_SPECIES.slice(0,3),[['ginkgo',.31],['plane',.28],['zelkova',.14]]);
 for(const [id]of STREET_SPECIES){assert.ok(TREE_SPECIES[id],id);assert.ok(TREE_HEIGHTS[id][1]>TREE_HEIGHTS[id][0]);}
 assert.equal(speciesForRoad({id:1,name:'테헤란로'}),speciesForRoad({id:2,name:'테헤란로'}),'every way of one street carries one species');
 // Avenues carry only the large street trees; the small scanned tree stays on lesser streets.
 assert.ok(Math.abs(AVENUE_SPECIES.reduce((sum,[,weight])=>sum+weight,0)-1)<1e-9);
 const avenue=new Set(AVENUE_SPECIES.map(([id])=>id));assert.ok(!avenue.has('small')&&!avenue.has('cherry'));
 for(let i=0;i<60;i++)assert.ok(avenue.has(speciesForRoad({name:'대로'+i,type:'primary'})));
 assert.ok(new Set(Array.from({length:200},(_,i)=>speciesForRoad({name:'길'+i,type:'residential'}))).has('small'));
 const names=['강남대로','테헤란로','서초대로','역삼로','논현로','봉은사로','도산대로','언주로','선릉로','삼성로','영동대로','남부순환로','사평대로','반포대로','양재대로','개포로'];
 assert.ok(new Set(names.map(name=>speciesForRoad({name}))).size>=4,'different streets are lined with different species');
 assert.equal(speciesAt(10,10),speciesAt(60,90));assert.ok(treeSeed(3,4)>=0&&treeSeed(3,4)<1&&treeSeed(3,4)!==treeSeed(3.5,4));
 const mix=await readFile(new URL('../dist/js/city-tree-mix.js',import.meta.url),'utf8');
 assert.ok(!/^import /m.test(mix),'the tile worker can load the species mix without the renderer');
 const data=JSON.parse(await readFile(new URL('../dist/assets/city/gangnam.json',import.meta.url),'utf8')),city=createCityWorld(data);
 try{
  assert.ok(city.treePlacements.length>100);const kinds=new Set(STREET_SPECIES.map(([id])=>id)),used=new Set();
  for(const t of city.treePlacements){assert.ok(kinds.has(t.species));assert.ok(t.seed>=0&&t.seed<1);used.add(t.species);}
  assert.ok(used.size>=4,'the core district is not a monoculture: '+[...used]);
 }finally{city.dispose();}
 // A streamed tile: an avenue long enough to be planted on both sides.
 const tile=buildCityTile({key:'t',roads:[{id:7,type:'primary',name:'시험대로',points:[[-240,0],[240,0]]}],buildings:[]},{bounds:{minX:-256,maxX:256,minZ:-256,maxZ:256}});
 assert.ok(tile.trees.length>=8,'trees along the avenue: '+tile.trees.length);
 for(const t of tile.trees){assert.equal(t.species,speciesForRoad({id:7,name:'시험대로',type:'primary'}));assert.ok(t.seed>=0&&t.seed<1);}
});
