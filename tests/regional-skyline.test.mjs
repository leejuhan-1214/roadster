import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {gunzipSync} from 'node:zlib';
import {decodeRegionalPack} from '../dist/js/city-regional-packs.js';
import {buildCityTile} from '../dist/js/city-tile-builder.js';

const pack=(label)=>decodeRegionalPack(JSON.parse(gunzipSync(readFileSync(new URL(
  '../dist/assets/city/seoul/region/'+label+'.bin',import.meta.url)))));

function buildPart(b) {
  const xs=b.points.map(p=>p[0]), zs=b.points.map(p=>p[1]);
  const bounds={minX:Math.min(...xs)-1,maxX:Math.max(...xs)+1,minZ:Math.min(...zs)-1,maxZ:Math.max(...zs)+1};
  return buildCityTile({buildingsOwned:true,buildings:[b]},{bounds});
}

test('mapped towers keep surveyed top elevations and raised tiers in both walls and collision',()=>{
  const yeouido=pack('-5_-2').flatMap(c=>c.buildings);
  const parc=yeouido.find(b=>b.name==='파크원 타워1');
  assert.equal(parc.height,322);
  const lotte=pack('3_-1').flatMap(c=>c.buildings);
  const solids=lotte.filter(b=>b.buildingPart);
  assert.equal(solids.length,11);
  const core=solids.find(b=>b.id==='bb:630750'),crowns=solids.filter(b=>b.height===554.5);
  assert.equal(core.height,520);assert.equal(crowns.length,2);
  const tier=solids.find(b=>b.id==='bb:782274');
  assert.equal(tier.minLevel,107);assert.equal(tier.levels,118);
  // The 555 m observation point is not used as a height for a whole city block.
  assert.ok(crowns.every(c=>Math.max(...c.points.map(([x])=>x))-Math.min(...c.points.map(([x])=>x))<25));
  for(const [b,base,top] of [[parc,0,322],[core,0,520],...crowns.map(b=>[b,0,554.5]),
    [tier,107*520/123,118*520/123]]){
    const tile=buildPart(b),meshes=tile.meshes.filter(m=>m.kind==='wall'||m.kind==='glass');
    assert.ok(meshes.length>0&&tile.obstacles.length>0);
    assert.ok(Math.abs(Math.min(...meshes.map(m=>m.bounds.min[1]))-base)<.002);
    assert.ok(Math.abs(Math.max(...meshes.map(m=>m.bounds.max[1]))-top)<.002);
    for(const c of tile.obstacles){
      assert.ok(Math.abs(c.center[1]-c.size[1]/2-base)<.002);
      assert.ok(Math.abs(c.center[1]+c.size[1]/2-top)<.002);
    }
  }
});
