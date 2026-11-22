import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SEOUL_WARP_POINTS} from '../dist/js/seoul-warp-points.js';

test('warp destinations span the Seoul road network and retain unique ids for map selection', () => {
  const points=SEOUL_WARP_POINTS;
  assert(points.length>=45);
  assert.equal(new Set(points.map(p=>p.id)).size,points.length);
  const groups=new Set(points.map(p=>p.group));
  for(const group of ['도심권','동북권','서북권','서남권','동남권','한강 다리'])assert(groups.has(group),group);
  assert(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>30000);
  assert(Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z))>19000);
  for(const point of points){
    assert(point.roadId && point.roadName && point.name,point.id);
    assert(Number.isFinite(point.heading) && Math.abs(point.heading)<=Math.PI,point.id);
  }
});

test('the published catalog reproduces from clear surface lanes around mapped Seoul destinations', () => {
  const script=fileURLToPath(new URL('../scripts/build-seoul-warp-points.mjs',import.meta.url));
  execFileSync(process.execPath,[script,'--check','--physics'],{stdio:'pipe'});
});
