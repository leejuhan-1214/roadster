import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>JSON.parse(readFileSync(new URL('../dist/assets/city/seoul/'+name,import.meta.url),'utf8'));
const map=read('driving-map.json'), city=read('manifest.json');
const sources=read('driving-map-sources.json');
function inside(x,z,ring){
  let contained=false;
  for(let i=1;i<ring.length;i++){
    const [x0,z0]=ring[i-1],[x1,z1]=ring[i];
    if((z0>z)!==(z1>z)&&x<(x1-x0)*(z-z0)/(z1-z0)+x0)contained=!contained;
  }
  return contained;
}

test('the Seoul overview uses the playable bounds and its bridge labels are on the continuous river',()=>{
  assert.deepEqual(map.bounds,city.bounds);
  const [river]=map.water;
  const onRiver=([x,z])=>inside(x,z,river)&&!map.islands.some(r=>inside(x,z,r));
  assert.ok(map.riverLabels.every(onRiver));
  const names=new Set(map.bridges.map(b=>b.name));
  assert.equal(names.size,map.bridges.length);
  assert.ok(names.size>=30);
  for(const name of ['김포대교','가양대교','마포대교','동작대교','반포대교','잠수교','한남대교','동호대교','성수대교','영동대교','청담대교','잠실대교','고덕토평대교','강동대교']){
    assert.ok(names.has(name),name);
  }
  for(const b of map.bridges){
    assert.ok(onRiver(b.label),b.name);
    assert.ok(b.points.length>=2&&b.source.startsWith('https://'));
  }
  const upper=map.bridges.find(b=>b.id==='banpo'),lower=map.bridges.find(b=>b.id==='jamsu');
  assert.equal(upper.group,lower.group);
  assert.notDeepEqual(upper.points,lower.points);
});

test('the regional geography extends on all four sides with sourced roads, neighborhoods and landmarks',()=>{
  const {minX,maxX,minZ,maxZ}=map.bounds;
  assert.equal(maxX-minX,45056);
  assert.equal(maxZ-minZ,36864);
  assert.deepEqual(map.detailBounds,{minX:-5120,maxX:5120,minZ:-5120,maxZ:5120});
  const regions=[([x])=>x< -15000,([x])=>x>9000,([x,z])=>z< -14500,([x,z])=>z>6500];
  for(const hit of regions){
    assert.ok(map.roads.filter(r=>r.points.some(hit)).length>60,'regional road geometry');
    assert.ok(map.blocks.filter(r=>r.some(hit)).length>2,'regional built-up blocks');
  }
  // Independent approximate geographic references in degrees. A site polygon
  // is labeled at a point inside the facility (e.g. the Gimpo aerodrome).
  for(const [id,lat,lon,tolerance] of [
    ['city-hall',37.5666,126.9783,130],['gimpo-airport',37.5583,126.7906,600],
    ['lotte-tower',37.5125,127.1025,120],['namsan-tower',37.5512,126.9882,95],
    ['national-assembly',37.5323,126.9141,150],['dobong-office',37.6688,127.0471,130]
  ]){
    const s=map.landmarks.find(a=>a.id===id);
    assert.ok(s&&s.source.startsWith('https://'),id);
    const x=(lon-127.0276)*111320*Math.cos(37.4979*Math.PI/180),z=(37.4979-lat)*111320;
    assert.ok(Math.hypot(s.x-x,s.z-z)<tolerance,id);
  }
  const tiles=sources.water.tiles;
  assert.equal(tiles.length,42);
  assert.equal(new Set(tiles.map(t=>t.url)).size,tiles.length);
  assert.ok(tiles.every(t=>/^https:\/\/tiles\.openfreemap\.org\/[^?]+\/12\/\d+\/\d+\.pbf$/.test(t.url)&&/^[a-f\d]{64}$/.test(t.sha256)));
});

test('map landmarks use the world origin and local east/north orientation',()=>{
  const byId=id=>map.landmarks.find(f=>f.id===id);
  const gangnam=byId('gangnam'),coex=byId('coex'),museum=byId('national-museum');
  assert.ok(Math.hypot(gangnam.x,gangnam.z)<100);
  assert.ok(coex.x>2500&&coex.x<3050&&coex.z< -1350&&coex.z> -1800);
  assert.ok(museum.x< -3900&&museum.z< -2600);
  assert.ok(new Set(map.landmarks.map(l=>l.id)).size===map.landmarks.length);
  assert.ok(map.blocks.length>1000&&map.roads.length>3500);
});
