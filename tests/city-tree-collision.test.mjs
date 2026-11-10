import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {treeColliders} from '../dist/js/city-tree-collision.js';
import {containsFootprint} from '../dist/js/city-footprint.js';
import {buildCityTile} from '../dist/js/city-tile-builder.js';
import {PhysicsSim} from '../dist/js/physics.js';
import * as THREE from 'three';
import {createSpeciesGroves,createTreeLibrary,generateTreeCollisionGeometry,TREE_SPECIES,TREE_VARIANTS} from '../dist/js/city-tree-species.js';
import {resolveTreePlacement} from '../dist/js/city-tree-mix.js';

const dir=new URL('../dist/assets/trees/',import.meta.url);
const gltf=JSON.parse(await readFile(new URL('tree-small-02.gltf',dir),'utf8'));
const binary=await readFile(new URL('tree-small-02.bin',dir));
function positions(primitive){const a=gltf.accessors[primitive.attributes.POSITION],v=gltf.bufferViews[a.bufferView];return new Float32Array(binary.buffer,binary.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*3);}
const level=gltf.meshes[0].primitives,base=Math.min(...level.map(p=>gltf.accessors[p.attributes.POSITION].min[1]));
const height=Math.max(...level.map(p=>gltf.accessors[p.attributes.POSITION].max[1]))-base;
const trunk=positions(level.find(p=>gltf.materials[p.material].name.endsWith('_trunk')));
const leaves=positions(level.find(p=>gltf.materials[p.material].alphaMode==='MASK'));
const contains=(c,p)=>Math.abs(p[1]-c.center[1])<=c.size[1]/2+1e-6&&containsFootprint(c.footprint,p[0],p[2]);
function transform(p,placement,origin=[0,0]){const s=placement.height/height,c=Math.cos(placement.rotation),sn=Math.sin(placement.rotation);return [origin[0]+placement.x+(p[0]*c+p[2]*sn)*s,.006+(p[1]-base)*s,origin[1]+placement.z+(-p[0]*sn+p[2]*c)*s];}
const options={stabilize:false,coastRegen:false};

function scannedAsset(){return {height,levels:gltf.meshes.map(mesh=>mesh.primitives.map(p=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions(p).slice(),3));geometry.translate(0,-base,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,material:new THREE.MeshStandardMaterial({name:gltf.materials[p.material].name})};
}))};}
function libraryFixture(){
  const asset=scannedAsset(),library=createTreeLibrary({asset}),source=new Map();
  const geometryFor=(species,index)=>{if(species==='small')return asset.levels[0][2].geometry;const key=species+':'+index;if(!source.has(key))source.set(key,generateTreeCollisionGeometry(species,index).geometry);return source.get(key);};
  return {library,geometryFor,dispose(){library.dispose();for(const geometry of source.values())geometry.dispose();for(const parts of asset.levels)for(const part of parts){part.geometry.dispose();part.material.dispose();}}};
}
function renderedStems(library,placements){
  const root=createSpeciesGroves(library,placements);root.updateMatrixWorld(true);const stems=[];
  root.traverse(mesh=>{
    if(!mesh.isInstancedMesh||mesh.parent.name!=='tree LOD 0')return;
    const match=/tree LOD 0 (\w+) (\d+) part (\d+)/.exec(mesh.name);if(!match)return;
    const [,species,index,part]=match;if(species==='small'&&Number(part)!==2)return;
    for(let i=0;i<mesh.count;i++){const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);stems.push({species,index:Number(index),matrix});}
  });
  root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});root.clear();return stems;
}


// The old origin-centred .42m box missed curved trunk sections after scaling/yaw.
test('compound collisions contain every actual trunk/fork vertex at each tested scale and rotation',()=>{
  for(const placement of [{x:0,z:0,height:5.8,rotation:0},{x:31,z:-18,height:7.2,rotation:1.27},{x:-42,z:63,height:6.4,rotation:-2.31}]){
    const origin=[-1536,2048],pieces=treeColliders(placement,{origin,id:'tree-check'});
    assert.ok(pieces.length>1&&pieces.length<=40,'bounded compound tree profile');
    assert.equal(new Set(pieces.map(p=>p.id)).size,pieces.length);
    assert.ok(pieces.every(p=>p.treeId==='tree-check'&&p.kind==='prism'));
    for(let i=0;i<trunk.length;i+=3){const p=transform(trunk.slice(i,i+3),placement,origin);assert.ok(pieces.some(c=>contains(c,p)),'visible trunk vertex '+i/3+' is solid');}
    let openLeaves=0;
    for(let i=0;i<leaves.length;i+=3)if(!pieces.some(c=>contains(c,transform(leaves.slice(i,i+3),placement,origin))))openLeaves++;
    assert.ok(openLeaves>leaves.length/3*.5,'leaf canopy remains largely open instead of one invisible solid box');
  }
});

test('every streamed tree has world-space collisions across positive and negative tile origins',()=>{
  for(const [ix,iz]of [[0,0],[-3,-2],[2,-4]]){
    const bounds={minX:ix*512,maxX:(ix+1)*512,minZ:iz*512,maxZ:(iz+1)*512};
    const tile=buildCityTile({roads:[{id:'tree-road',width:13,type:'primary',points:[[bounds.minX-100,bounds.minZ+220],[bounds.maxX+100,bounds.minZ+220]]}],buildings:[]},{id:ix+'_'+iz,bounds});
    assert.ok(tile.trees.length>10);
    const groups=new Map();for(const c of tile.obstacles.filter(c=>c.treeId)){if(!groups.has(c.treeId))groups.set(c.treeId,[]);groups.get(c.treeId).push(c);}
    assert.equal(groups.size,tile.trees.length);
    const fixture=libraryFixture();
    try{
      for(const rendered of renderedStems(fixture.library,tile.trees)){
        const points=fixture.geometryFor(rendered.species,rendered.index).attributes.position;
        for(const index of [0,Math.floor(points.count/2),points.count-1]){
          const sample=new THREE.Vector3().fromBufferAttribute(points,index).applyMatrix4(rendered.matrix).add(new THREE.Vector3(tile.origin[0],0,tile.origin[1])).toArray();
          assert.ok(tile.obstacles.some(c=>c.treeId&&contains(c,sample)),'actual species instance has matching world-space collision');
        }
      }
    }finally{fixture.dispose();}
  }
});

test('neighbouring tiles own boundary trees once and keep their protruding colliders intact',()=>{
  const data={roads:[{id:9,width:13,type:'primary',points:[[5,200],[1100,200]]}],buildings:[]};
  const left=buildCityTile(data,{id:'0_0',bounds:{minX:0,maxX:512,minZ:0,maxZ:512}});
  const right=buildCityTile(data,{id:'1_0',bounds:{minX:512,maxX:1024,minZ:0,maxZ:512}});
  const points=[...left.trees.map(p=>[p.x+left.origin[0],p.z+left.origin[1]]),...right.trees.map(p=>[p.x+right.origin[0],p.z+right.origin[1]])];
  assert.equal(new Set(points.map(p=>p.map(n=>n.toFixed(6)).join(','))).size,points.length);
  // Exactly x512 is assigned to the right tile by the half-open ownership rule.
  assert.ok(right.trees.some(p=>Math.abs(p.x+right.origin[0]-512)<1e-8));
  assert.ok(right.obstacles.some(c=>c.treeId&&c.center[0]-c.size[0]/2<512&&c.center[0]+c.size[0]/2>512),'tree crossing owner edge is not clipped');
});

function impact(pieces,{x,z,y,speed=45}={}){
  const sim=new PhysicsSim({gravity:y==null?9.81:0,aeroEnabled:false});sim.setObstacles(pieces);
  sim.state.pos.set(x-10,y??sim.restHeight,z);sim.state.vel.set(speed,0,0);
  if(y==null)for(const wheel of sim.wheels)wheel.omega=speed/sim.params.wheelRadius;else sim.contactCount=0;
  const before=sim.state.vel.lengthSq();let contacted=false,first;
  for(let i=0;i<240;i++){sim.step(.002,options);if(sim.obstacleContacts.length){contacted=true;first??={x:sim.state.pos.x,count:sim.collisionCount};}}
  return {sim,contacted,first,before};
}

test('a high-speed ground hit registers one tree impact and cannot tunnel through its trunk',()=>{
  const placement={x:123,z:-456,height:7.2,rotation:1.1},pieces=treeColliders(placement,{id:'tree-roadside'});
  const target=transform([.07,.6,.05],placement);
  const {sim,contacted,first,before}=impact(pieces,{x:target[0],z:target[2]});
  assert.ok(contacted);assert.equal(sim.lastObstacleImpact.id,'tree-roadside');
  assert.equal(first.count,1,'multiple compound pieces are one logical tree impact');
  assert.ok(first.x<target[0],'contact happens before the chassis centre passes the tree');
  assert.ok(sim.state.vel.lengthSq()<before,'impact dissipates kinetic energy');
  assert.ok(sim.lastObstacleImpact.impulse>0&&sim.lastObstacleImpact.speed>1);
});

test('an elevated rotated fork outside the old fixed box records collision',()=>{
  const placement={x:-100,z:80,height:7.2,rotation:Math.PI/2},pieces=treeColliders(placement,{id:'tree-fork'});
  const fork=pieces.filter(c=>c.center[1]>2&&c.center[1]<5).sort((a,b)=>Math.hypot(b.center[0]-placement.x,b.center[2]-placement.z)-Math.hypot(a.center[0]-placement.x,a.center[2]-placement.z))[0];
  assert.ok(Math.hypot(fork.center[0]-placement.x,fork.center[2]-placement.z)>.5);
  const {sim,contacted}=impact(pieces,{x:fork.center[0],z:fork.center[2],y:fork.center[1]});
  assert.ok(contacted);assert.equal(sim.lastObstacleImpact.id,'tree-fork');
});

test('streamed tree removal and reload update collision recognition with no stale solid',()=>{
  const placement={x:6,z:0,height:6.5,rotation:0},pieces=treeColliders(placement,{id:'tree-streamed'});
  const sim=new PhysicsSim({gravity:0,aeroEnabled:false});sim.setObstacles([]);
  function run(){sim.reset();sim.state.pos.set(-4,sim.restHeight,0);sim.state.vel.set(40,0,0);sim.contactCount=0;for(let i=0;i<220;i++)sim.step(.002,options);}
  sim.setObstacleChunk('0_0',pieces);run();assert.equal(sim.lastObstacleImpact?.id,'tree-streamed');assert.ok(sim.collisionCount>=1);
  sim.removeObstacleChunk('0_0');run();assert.equal(sim.lastObstacleImpact,null);assert.equal(sim.collisionCount,0);assert.ok(sim.state.pos.x>10);
  sim.setObstacleChunk('0_0',pieces);run();assert.equal(sim.lastObstacleImpact?.id,'tree-streamed');assert.ok(sim.collisionCount>=1);
});


test('all thirty grown variants and the scanned tree match actual render scale, spread, tilt and yaw',()=>{
  const fixture=libraryFixture(),seen=new Set();
  try{
    for(const species of Object.keys(TREE_SPECIES)){
      const wanted=species==='small'?1:TREE_VARIANTS;
      for(let gx=-12;gx<12&&[...seen].filter(key=>key.startsWith(species+':')).length<wanted;gx++)for(const seed of [.137,.713]){
        const placement={x:gx*96+25,z:(gx%3)*96+17,species,seed,height:6,rotation:gx*.71+.3};
        const resolved=resolveTreePlacement(placement),key=species+':'+resolved.variantIndex;if(seen.has(key))continue;
        const origin=[1536,-2048],pieces=treeColliders(placement,{origin,id:'species-'+key});
        assert.ok(pieces.length>1&&pieces.length<=50,key+' has a bounded woody profile');
        const rendered=renderedStems(fixture.library,[placement]);assert.equal(rendered.length,1);
        assert.equal(rendered[0].species,species);assert.equal(rendered[0].index,resolved.variantIndex);
        const points=fixture.geometryFor(species,resolved.variantIndex).attributes.position;
        for(let i=0;i<points.count;i++){
          const p=new THREE.Vector3().fromBufferAttribute(points,i).applyMatrix4(rendered[0].matrix).add(new THREE.Vector3(origin[0],0,origin[1])).toArray();
          assert.ok(pieces.some(c=>contains(c,p)),key+' rendered stem/fork vertex '+i+' lies in collision geometry');
        }
        seen.add(key);
      }
      assert.equal([...seen].filter(key=>key.startsWith(species+':')).length,wanted,species+' every selected variant exercised');
    }
    assert.equal(seen.size,31);
  }finally{fixture.dispose();}
});


test('all six grown street species stop a grounded 45 m/s impact at the rendered trunk',()=>{
  const fixture=libraryFixture();
  try{
    for(const species of Object.keys(TREE_SPECIES).filter(id=>!TREE_SPECIES[id].asset)){
      const placement={x:100,z:-80,species,seed:.67,height:6,rotation:.9},id='impact-'+species;
      const rendered=renderedStems(fixture.library,[placement])[0],resolved=resolveTreePlacement(placement);
      const variant=fixture.library.variant(species,rendered.index),sourceY=.5/(resolved.height/variant.height);
      const target=new THREE.Vector3(0,sourceY,0).applyMatrix4(rendered.matrix);
      const pieces=treeColliders(placement,{id});
      const {sim,contacted,first,before}=impact(pieces,{x:target.x,z:target.z});
      assert.ok(contacted,species+' visible trunk is struck');assert.equal(sim.lastObstacleImpact?.id,id);
      assert.equal(first.count,1,species+' compounds share one impact identity');
      assert.ok(first.x<target.x,species+' registers before the car centre crosses the trunk');
      assert.ok(sim.state.pos.x<target.x,species+' cannot continue through the trunk');
      assert.ok(sim.state.vel.lengthSq()<before,species+' collision dissipates speed');
    }
  }finally{fixture.dispose();}
});
