import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=name=>JSON.parse(readFileSync(new URL('../dist/assets/city/seoul/'+name,import.meta.url),'utf8'));
const map=read('driving-map.json'), city=read('manifest.json');
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
  assert.deepEqual(new Set(map.bridges.map(b=>b.name)),new Set(['동작대교','반포대교','잠수교','한남대교','동호대교','성수대교','영동대교','청담대교']));
  for(const b of map.bridges){
    assert.ok(onRiver(b.label),b.name);
    assert.ok(b.points.length>=2&&b.source.startsWith('https://'));
  }
  const upper=map.bridges.find(b=>b.id==='banpo'),lower=map.bridges.find(b=>b.id==='jamsu');
  assert.equal(upper.group,lower.group);
  assert.notDeepEqual(upper.points,lower.points);
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