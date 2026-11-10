import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const dir = path.resolve(import.meta.dirname, '../dist/assets/city/seoul');
const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
const entries = await Promise.all(Object.entries(manifest.tiles).map(async ([key, record]) => {
  const raw = await fs.readFile(path.join(dir, record.url), 'utf8');
  return { key, record, raw, data: JSON.parse(raw) };
}));
const tileMap = new Map(entries.map(entry => [entry.key, entry.data]));
function assertSourceIdentity(feature) {
  if (feature.osmId === null) {
    assert.match(feature.providerFeatureId, /^bbbike:[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(feature.sourceFeatureOrdinal) && feature.sourceFeatureOrdinal > 0);
    assert.equal(feature.sourceUrl, 'https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz');
    assert.equal(feature.osmType, null);
  } else {
    assert.ok(Number.isSafeInteger(feature.osmId) && feature.osmId > 0);
    assert.ok(['way', 'relation'].includes(feature.osmType));
  }
}

test('real Seoul map is a complete bounded 10.24 km square with verified tile hashes', () => {
  assert.deepEqual(manifest.origin, [37.4979, 127.0276]);
  assert.equal(manifest.tileSize, 512);
  assert.deepEqual(manifest.bounds, { minX: -5120, maxX: 5120, minZ: -5120, maxZ: 5120 });
  assert.equal(entries.length, 400);
  for (let iz = -10; iz < 10; iz++) for (let ix = -10; ix < 10; ix++) assert.ok(tileMap.has(`${ix}_${iz}`));
  let bytes = 0;
  for (const { key, record, raw, data } of entries) {
    assert.equal(createHash('sha256').update(raw).digest('hex'), record.sha256, key);
    assert.equal(Buffer.byteLength(raw), record.bytes, key);
    assert.ok(record.bytes < 4_000_000, `Oversized tile ${key}: ${record.bytes}`);
    assert.equal(data.key, key);
    assert.deepEqual(data.bounds, { minX: data.ix * 512, maxX: (data.ix + 1) * 512, minZ: data.iz * 512, maxZ: (data.iz + 1) * 512 });
    bytes += record.bytes;
  }
  assert.equal(bytes, manifest.bytesTotal);
});

test('buildings have unique ownership, closed complete footprints and genuine source IDs', () => {
  const ids = new Set();
  for (const { data } of entries) for (const building of data.buildings) {
    assert.ok(!ids.has(building.id), `Duplicated building ${building.id}`);
    ids.add(building.id);
    assertSourceIdentity(building);
    assert.equal(Math.floor(building.center[0] / 512), data.ix);
    assert.equal(Math.floor(building.center[1] / 512), data.iz);
    for (const ring of [building.points, ...(building.holes || [])]) {
      assert.ok(ring.length >= 4);
      assert.deepEqual(ring[0], ring.at(-1));
      assert.ok(ring.every(point => point.length === 2 && point.every(Number.isFinite)));
    }
  }
  assert.equal(ids.size, manifest.counts.uniqueBuildings);
  assert.ok(ids.size > 5000, 'Expanded Seoul data should contain substantially more than the central extract');
});

test('tile boundaries preserve the identical real road polyline and layer metadata', () => {
  const roads = new Map(); let shared = 0, elevated = 0, underground = 0;
  for (const { data } of entries) for (const road of data.roads) {
    assertSourceIdentity(road);
    if (road.osmId !== null) assert.equal(road.osmId, road.id);
    assert.ok(Number.isFinite(road.layer));
    assert.ok(Object.hasOwn(road, 'bridge') && Object.hasOwn(road, 'tunnel'));
    const serialized = JSON.stringify(road);
    if (roads.has(road.id)) { assert.equal(serialized, roads.get(road.id)); shared++; }
    else { roads.set(road.id, serialized); if (road.bridge && road.bridge !== 'no') elevated++; if (road.tunnel && road.tunnel !== 'no') underground++; }
  }
  assert.equal(roads.size, manifest.counts.uniqueRoads);
  assert.ok(roads.size > 1000);
  assert.ok(shared > 100, 'Roads crossing tile edges must be indexed into neighbors');
  assert.ok(elevated > 0 && underground > 0, 'Real Seoul bridge/tunnel metadata must survive extraction');
  assert.ok([...roads.values()].some(value => value.includes('강남대로')));
  assert.ok([...roads.values()].some(value => value.includes('테헤란로')));
});

test('every road crossing a tile edge is present on both sides without invented connectors', () => {
  const checked = new Set();
  const tileRoadIds = new Map(entries.map(({ key, data }) => [key, new Set(data.roads.map(road => road.id))]));
  let crossings = 0;
  for (const { data } of entries) for (const road of data.roads) {
    if (checked.has(road.id)) continue;
    checked.add(road.id);
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      for (const axis of [0, 1]) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 0.001) continue;
        for (let grid = -9; grid <= 9; grid++) {
          const t = (grid * 512 - a[axis]) / delta;
          if (t <= 0 || t >= 1) continue;
          const keys = [Math.max(0, t - 1e-7), Math.min(1, t + 1e-7)].map(u => {
            const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
            return `${Math.floor(x / 512)}_${Math.floor(z / 512)}`;
          });
          if (keys.some(key => !tileRoadIds.has(key))) continue;
          for (const key of keys) assert.ok(tileRoadIds.get(key).has(road.id), `Road ${road.id} missing across ${key}`);
          crossings++;
        }
      }
    }
  }
  assert.ok(crossings > 100);
});

test('known central OSM ways keep the exact core geometry across the core rectangle seam', async () => {
  const core = JSON.parse(await fs.readFile(path.resolve(dir, '../gangnam.json'), 'utf8'));
  const roads = new Map(entries.flatMap(({ data }) => data.roads).map(road => [road.id, road]));
  for (const known of core.roads) {
    const actual = roads.get(known.id);
    assert.ok(actual, `Missing known central road ${known.id}`);
    assert.deepEqual(actual.points, known.points, `Core seam geometry changed: ${known.id}`);
    assert.equal(actual.width, known.width);
    assert.equal(actual.lanes, known.lanes);
    assert.equal(actual.name, known.name);
    assert.equal(actual.geometrySource, 'gangnam-core');
    assert.equal(actual.geometryTimestamp, core.sourceTimestamp);
  }
  assert.equal(manifest.coreRoadGeometryPriority, true);
  assert.equal(manifest.sourceTimestamps.core, core.sourceTimestamp);
});

test('actual nature polygons are bounded per tile and original download provenance is included', async () => {
  let waterCount = 0, parkCount = 0;
  for (const { data } of entries) for (const field of ['water', 'landuse']) for (const polygon of data[field]) {
    if (field === 'water') waterCount++; else parkCount++;
    assertSourceIdentity(polygon);
    for (const ring of [polygon.points, ...(polygon.holes || [])]) for (const [x, z] of ring) {
      assert.ok(x >= data.bounds.minX && x <= data.bounds.maxX);
      assert.ok(z >= data.bounds.minZ && z <= data.bounds.maxZ);
    }
  }
  assert.ok(waterCount > 0 && parkCount > 0);
  const provenance = JSON.parse(await fs.readFile(path.join(dir, 'provenance.json'), 'utf8'));
  assert.match(provenance.rawSha256, /^[a-f0-9]{64}$/);
  if (provenance.kind === 'bbbike-geojson') assert.equal(provenance.sources.length, 1);
  else assert.ok(provenance.sources.length >= 4, 'All four quadrants or their smaller subdivisions must be sourced');
  for (const part of provenance.sources) {
    assert.match(part.rawSha256, /^[a-f0-9]{64}$/);
    if (part.kind === 'bbbike-geojson') assert.equal(part.url, 'https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz');
    else assert.ok(part.query.includes('out geom;'));
    assert.ok(part.elementCount > 0);
  }
  assert.equal(manifest.license, 'ODbL-1.0');
});
