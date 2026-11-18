import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {indexRegionalTiles,decodeRegionalPack,createRegionalPackLoader} from '../dist/js/city-regional-packs.js';
import {buildCityTile} from '../dist/js/city-tile-builder.js';

const dir=new URL('../dist/assets/city/seoul/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',dir),'utf8'));
const proof=JSON.parse(await readFile(new URL('regional-provenance.json',dir),'utf8'));
const packed=Object.keys(manifest.regional.packs);
const roadRecord=['r',3,0,[1234,{type:'secondary',name:'테스트'},[51200,0,5000,2000]]];
const buildingRecord=['b',3,2,[77,{levels:5},[[51200,0,0,2500,2500,0,-2500,-2500]]]];

test('two neighboring cells share the way but assign the building and collision to a single cell',()=>{
  const [a,b]=decodeRegionalPack([roadRecord,buildingRecord]);
  assert.deepEqual(a.roads[0].points,[[512,0],[562,20]]);
  assert.equal(a.roads[0],b.roads[0]);
  assert.equal(a.contextBuildings[0],b.buildings[0]);
  assert.equal(a.buildings.length,0);
  assert.equal(b.contextBuildings.length,0);
});

test('aborting one of two regional tile loads keeps the shared pack request and its decoded cache',async()=>{
  let finish,calls=0;
  const response=new Promise(resolve=>{finish=resolve;});
  const load=createRegionalPackLoader({fetchPack:async()=>{calls++;return response;}});
  const a=new AbortController(),b=new AbortController();
  const canceled=load('region',0,a.signal),other=load('region',1,b.signal);
  a.abort();finish(new Response(gzipSync(JSON.stringify([roadRecord]))));
  await assert.rejects(canceled,{name:'AbortError'});
  assert.equal((await other).roads.length,1);
  assert.equal((await load('region',0,b.signal)).roads.length,1);
  assert.equal(calls,1);
});

test('the regional pack network is bounded by source coverage and its published bytes match provenance',async()=>{
  assert.deepEqual(manifest.bounds,{minX:-28672,maxX:16384,minZ:-24576,maxZ:12288});
  assert.deepEqual(manifest.coverageKm,[45.056,36.864]);
  assert.equal(manifest.regional.tileCount,5936);
  assert.ok(proof.uniqueRoadsTouchingOuterCells>80000);
  assert.ok(proof.totals.ownedBuildings>100000);
  const m=structuredClone(manifest);indexRegionalTiles(m);
  for(const key of ['-57_0','32_0','0_-49','0_24'])assert.equal(m.tiles[key],undefined,key);
  for(const key of ['-56_0','31_0','0_-48','0_23'])assert.ok(m.tiles[key],key);
  assert.equal(m.tiles['-11_-11'].cell,5);
  let total=0;
  for(const key of packed){
    const bytes=await readFile(new URL('region/'+key+'.bin',dir));
    total+=bytes.length;
    const digest=createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest,proof.packHashes[key],key);
    assert.equal(digest.slice(0,12),m.regional.packs[key]);
  }
  assert.equal(total,proof.totals.bytes);
});

test('mapped western, northern and eastern neighborhoods build roads and collision footprints in 3D',async()=>{
  const m=structuredClone(manifest);indexRegionalTiles(m);
  for(const [x,z] of [[-17922,-6050],[-6665,-9605],[7420,-1630]]){
    const i=Math.floor(x/512),j=Math.floor(z/512);
    const key=i+'_'+j,entry=m.tiles[key];
    assert.ok(entry.pack,key);
    const bytes=await readFile(new URL(entry.pack.split('?')[0],dir));
    const cell=decodeRegionalPack(JSON.parse(gunzipSync(bytes)))[entry.cell];
    assert.ok(cell.roads.length>0,key);
    assert.ok(cell.buildings.length>0,key);
    const payload=buildCityTile(cell,{bounds:entry.bounds,id:key});
    assert.ok(payload.meshes.some(mesh=>mesh.kind==='road'),key);
    assert.ok(payload.stats.buildings>0&&payload.obstacles.length>0,key);
  }
});
