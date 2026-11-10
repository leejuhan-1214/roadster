import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalLine, canonicalRing } from './seoul-geometry.mjs';

const root = path.resolve(import.meta.dirname, '..');
const sourceDir = path.resolve(process.env.SEOUL_SOURCE_DIR || path.join(import.meta.dirname, '../../../data/seoul-source'));
const outDir = path.join(root, 'dist/assets/city/seoul');
const source = JSON.parse(await fs.readFile(path.join(sourceDir, 'seoul-overpass.json'), 'utf8'));
const download = JSON.parse(await fs.readFile(path.join(sourceDir, 'download.json'), 'utf8'));
const core = JSON.parse(await fs.readFile(path.join(root, 'dist/assets/city/gangnam.json'), 'utf8'));
const origin = download.origin, tileSize = 512, extent = download.extent;
const bounds = { minX: -extent, maxX: extent, minZ: -extent, maxZ: extent };
const round = n => Math.round(n * 100) / 100;
const project = p => [round((p.lon - origin[1]) * 111320 * Math.cos(origin[0] * Math.PI / 180)), round(-(p.lat - origin[0]) * 111320)];
const coreSW = project({ lat: core.bbox[0], lon: core.bbox[1] }), coreNE = project({ lat: core.bbox[2], lon: core.bbox[3] });
const renderedCoreBuildings = core.buildings.filter(building => {
  const points = building.points.slice();
  if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const z = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return x >= coreSW[0] && x <= coreNE[0] && z >= coreNE[1] && z <= coreSW[1];
});
const coreIds = new Set(renderedCoreBuildings.map(b => b.id));
const coreRoadGeometry = new Map(core.roads.map(road => [canonicalLine(road.points), road]));
const coreBuildingGeometry = new Map(core.buildings.map(building => [canonicalRing(building.points), building]));
const renderedCoreBuildingGeometry = new Set(renderedCoreBuildings.map(building => canonicalRing(building.points)));
const coreBounds = { minX: coreSW[0], maxX: coreNE[0], minZ: coreNE[1], maxZ: coreSW[1] };
function sourceIdentity(e) {
  return { osmType: e.osmType ?? (typeof e.id === 'number' ? e.type : null), osmId: e.osmId ?? (typeof e.id === 'number' ? e.id : null), ...(e.providerFeatureId ? { providerFeatureId: e.providerFeatureId, sourceFeatureOrdinal: e.sourceFeatureOrdinal, sourceUrl: e.sourceUrl } : {}) };
}
const sha = s => createHash('sha256').update(s).digest('hex');
const geometry = e => (e.geometry || []).filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).map(project);
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
const closeRing = p => p.length >= 4 && equal(p[0], p.at(-1));
const polygonBounds = points => ({ minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])), minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])) });
const contains = (b, p) => p[0] >= b.minX && p[0] < b.maxX && p[1] >= b.minZ && p[1] < b.maxZ;
const overlaps = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
const inside = (p, ring) => {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
};
// Clip flat nature areas at build time so a long Han River relation is not
// downloaded in full for every small city tile. Building footprints stay whole.
function clipRing(input, box) {
  let points = input.slice(0, closeRing(input) ? -1 : undefined);
  for (const [axis, edge, minimum] of [[0, box.minX, true], [0, box.maxX, false], [1, box.minZ, true], [1, box.maxZ, false]]) {
    const output = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const aIn = minimum ? a[axis] >= edge : a[axis] <= edge;
      const bIn = minimum ? b[axis] >= edge : b[axis] <= edge;
      if (aIn) output.push(a);
      if (aIn !== bIn) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        const point = [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)];
        point[axis] = edge; output.push(point);
      }
    }
    points = output;
    if (points.length < 3) return [];
  }
  points = points.filter((p, i) => !i || !equal(p, points[i - 1]));
  if (points.length < 3) return [];
  if (!equal(points[0], points.at(-1))) points.push(points[0]);
  return points;
}
const centroid = points => {
  let area = 0, x = 0, z = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], c = a[0] * b[1] - b[0] * a[1];
    area += c; x += (a[0] + b[0]) * c; z += (a[1] + b[1]) * c;
  }
  if (Math.abs(area) > 0.001) return [round(x / (3 * area)), round(z / (3 * area))];
  return [round(points.reduce((s, p) => s + p[0], 0) / points.length), round(points.reduce((s, p) => s + p[1], 0) / points.length)];
};
// Merge relation members by exact OSM node coordinates, preserving inner rings.
function stitch(parts) {
  const todo = parts.filter(p => p.length >= 2).map(p => p.slice()), rings = [];
  while (todo.length) {
    const ring = todo.pop();
    let changed = true;
    while (!closeRing(ring) && changed) {
      changed = false;
      for (let i = 0; i < todo.length; i++) {
        let p = todo[i];
        if (equal(ring.at(-1), p[0])) ring.push(...p.slice(1));
        else if (equal(ring.at(-1), p.at(-1))) ring.push(...p.slice(0, -1).reverse());
        else if (equal(ring[0], p.at(-1))) ring.unshift(...p.slice(0, -1));
        else if (equal(ring[0], p[0])) ring.unshift(...p.slice(1).reverse());
        else continue;
        todo.splice(i, 1); changed = true; break;
      }
    }
    if (closeRing(ring)) rings.push(ring);
  }
  return rings;
}
const roads = [], buildings = [], water = [], landuse = [], relationMemberIds = new Set();
const roadTypes = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service']);
const omitted = { unclosedBuildingWays: 0, unclosedRelationOuters: 0, coreBuildings: 0, coreGeometryMatches: 0, outsideBuildingCentroids: 0, undergroundBuildings: 0 };
const numeric = value => Number.isFinite(Number.parseFloat(value)) ? Number.parseFloat(value) : null;
function addPolygon(e, points, holes = [], suffix = '') {
  const t = e.tags || {}, id = e.type === 'relation' ? `relation/${e.id}${suffix}` : suffix ? `way/${e.id}${suffix}` : e.id;
  const base = { id, ...sourceIdentity(e), name: t.name || t['name:en'] || '', points };
  if (holes.length) base.holes = holes;
  if (t.building && t.building !== 'no') {
    if (coreIds.has(e.id) && e.type === 'way') { omitted.coreBuildings++; return; }
    if (t.location === 'underground' || numeric(t.layer) < 0) { omitted.undergroundBuildings++; return; }
    const center = centroid(points);
    const ringKey = canonicalRing(points), knownCore = coreBuildingGeometry.get(ringKey);
    if (contains(coreBounds, center) || renderedCoreBuildingGeometry.has(ringKey)) { omitted.coreBuildings++; return; }
    if (knownCore) { base.id = knownCore.id; base.osmId = knownCore.id; base.osmType = 'way'; base.identitySource = 'exact-core-geometry-match'; omitted.coreGeometryMatches++; }
    if (!contains(bounds, center)) { omitted.outsideBuildingCentroids++; return; }
    buildings.push({ ...base, type: t.building, height: numeric(t.height), levels: numeric(t['building:levels']), minHeight: numeric(t.min_height), minLevel: numeric(t['building:min_level']), material: t['building:material'] || null, colour: t['building:colour'] || null, roofShape: t['roof:shape'] || null, layer: numeric(t.layer) || 0, center });
  } else if (t.natural === 'water' || t.waterway === 'riverbank') {
    water.push({ ...base, type: t.water || 'water' });
  } else {
    landuse.push({ ...base, type: t.landuse || t.natural || t.leisure || 'park' });
  }
}
for (const e of source.elements.filter(e => e.type === 'relation')) {
  if (e.polygons) {
    e.polygons.forEach((polygon, i) => addPolygon(e, geometry(polygon), (polygon.holes || []).map(ring => ring.map(project)), e.polygons.length > 1 ? `/${i}` : ''));
    continue;
  }
  const members = e.members || [];
  const outer = stitch(members.filter(m => m.type === 'way' && m.role !== 'inner').map(geometry));
  const inner = stitch(members.filter(m => m.type === 'way' && m.role === 'inner').map(geometry));
  if (!outer.length) { omitted.unclosedRelationOuters++; continue; }
  for (const member of members) if (member.type === 'way') relationMemberIds.add(member.ref);
  outer.forEach((p, i) => addPolygon(e, p, inner.filter(h => inside(h[0], p)), outer.length > 1 ? `/${i}` : ''));
}
for (const e of source.elements.filter(e => e.type === 'way')) {
  const t = e.tags || {}, points = geometry(e);
  if (roadTypes.has(t.highway) && t.area !== 'yes' && points.length >= 2) {
    const identity = sourceIdentity(e), knownCore = coreRoadGeometry.get(canonicalLine(points));
    if (knownCore) { identity.osmId = knownCore.id; identity.osmType = 'way'; identity.identitySource = 'exact-core-geometry-match'; }
    roads.push({ id: knownCore?.id ?? e.id, ...identity, type: t.highway, name: t.name || t['name:en'] || '', lanes: numeric(t.lanes), width: numeric(t.width), oneway: t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1', onewayDirection: t.oneway === '-1' ? -1 : 1, bridge: t.bridge || null, tunnel: t.tunnel || null, layer: numeric(t.layer) || 0, surface: t.surface || null, access: t.access || null, motorVehicle: t.motor_vehicle || null, maxspeed: t.maxspeed || null, points });
  }
  if ((t.building || t.natural || t.landuse || t.leisure) && !relationMemberIds.has(e.id)) {
    if (e.polygons) e.polygons.forEach((polygon, i) => addPolygon(e, geometry(polygon), (polygon.holes || []).map(ring => ring.map(project)), e.polygons.length > 1 ? `/${i}` : ''));
    else if (closeRing(points)) addPolygon(e, points);
    else if (t.building) omitted.unclosedBuildingWays++;
  }
}
// The bundled central extract can be newer than a mirror's regional snapshot.
// Keep its full known OSM ways on both sides of the central rectangle, retaining
// additional bridge/layer metadata from the larger extract when available.
const roadById = new Map(roads.map(road => [road.id, road]));
for (const road of core.roads) {
  const previous = roadById.get(road.id) || { bridge: null, tunnel: null, layer: 0, surface: null, access: null, motorVehicle: null, maxspeed: null, onewayDirection: 1 };
  roadById.set(road.id, { ...previous, ...road, osmType: 'way', osmId: road.id, geometrySource: 'gangnam-core', geometryTimestamp: core.sourceTimestamp });
}
roads.splice(0, roads.length, ...roadById.values());
const tiles = new Map();
for (let iz = -extent / tileSize; iz < extent / tileSize; iz++) for (let ix = -extent / tileSize; ix < extent / tileSize; ix++) {
  const key = `${ix}_${iz}`;
  tiles.set(key, { schemaVersion: 1, key, ix, iz, origin, bounds: { minX: ix * tileSize, maxX: (ix + 1) * tileSize, minZ: iz * tileSize, maxZ: (iz + 1) * tileSize }, buildingsOwned: true, roads: [], buildings: [], contextBuildings: [], water: [], landuse: [] });
}
function intersecting(points) {
  const b = polygonBounds(points), result = [];
  const low = -extent / tileSize, high = extent / tileSize - 1;
  for (let iz = Math.max(low, Math.floor(b.minZ / tileSize)); iz <= Math.min(high, Math.floor(b.maxZ / tileSize)); iz++) {
    for (let ix = Math.max(low, Math.floor(b.minX / tileSize)); ix <= Math.min(high, Math.floor(b.maxX / tileSize)); ix++) {
      const tile = tiles.get(`${ix}_${iz}`);
      if (tile && overlaps(tile.bounds, b)) result.push(tile);
    }
  }
  return result;
}
// Road polylines remain whole in each intersecting tile. Runtime clips polygons,
// keeping exact shared endpoints and a continuous dash phase at tile boundaries.
for (const road of roads) for (const tile of intersecting(road.points)) tile.roads.push(road);
for (const building of buildings) {
  const owner = tiles.get(`${Math.floor(building.center[0] / tileSize)}_${Math.floor(building.center[1] / tileSize)}`);
  owner?.buildings.push(building);
  for (const tile of intersecting(building.points)) if (tile !== owner) tile.contextBuildings.push({ id: building.id, points: building.points });
}
// Core outlines are context-only: landmarks/core renderer still own these.
for (const building of renderedCoreBuildings) for (const tile of intersecting(building.points)) tile.contextBuildings.push({ id: building.id, points: building.points });
for (const [polygons, field] of [[water, 'water'], [landuse, 'landuse']]) for (const polygon of polygons) for (const tile of intersecting(polygon.points)) {
  const points = clipRing(polygon.points, tile.bounds);
  if (points.length < 4) continue;
  const clipped = { ...polygon, points };
  if (polygon.holes) clipped.holes = polygon.holes.map(h => clipRing(h, tile.bounds)).filter(h => h.length >= 4);
  tile[field].push(clipped);
}
await fs.mkdir(path.join(outDir, 'tiles'), { recursive: true });
const manifest = {
  schemaVersion: 1, name: '서울 강남역 중심 실제 도로·건물', origin, tileSize, bounds, bbox: download.bbox,
  attribution: '© OpenStreetMap contributors', license: 'ODbL-1.0', licenseUrl: 'https://www.openstreetmap.org/copyright',
  sourceTimestamp: download.sourceTimestamp, downloadedAt: download.downloadedAt,
  sourceTimestamps: { regional: download.sourceTimestamp, core: core.sourceTimestamp },
  coreRoadGeometryPriority: true,
  coverageKm: [extent * 2 / 1000, extent * 2 / 1000],
  counts: { uniqueRoads: roads.length, uniqueBuildings: buildings.length, coreBuildings: renderedCoreBuildings.length, water: water.length, landuse: landuse.length, tiles: tiles.size },
  tiles: {},
};
let bytesTotal = 0;
for (const [key, tile] of tiles) {
  for (const list of ['roads', 'buildings', 'contextBuildings', 'water', 'landuse']) tile[list].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  const raw = JSON.stringify(tile), bytes = Buffer.byteLength(raw); bytesTotal += bytes;
  manifest.tiles[key] = { url: `tiles/${key}.json`, ix: tile.ix, iz: tile.iz, bounds: tile.bounds, bytes, sha256: sha(raw), counts: { roads: tile.roads.length, buildings: tile.buildings.length, water: tile.water.length, landuse: tile.landuse.length } };
  await fs.writeFile(path.join(outDir, 'tiles', `${key}.json`), raw);
}
manifest.bytesTotal = bytesTotal;
download.coreRoadGeometryPriority = { source: '../gangnam.json', sourceTimestamp: core.sourceTimestamp, roadCount: core.roads.length, rule: 'For an existing core OSM way ID, retain its full core polyline, width, lanes and basic road fields in all tiles; keep additional regional bridge/tunnel/layer metadata. Also retain known core roads absent in the older regional snapshot.' };
download.naturePolygonClipping = 'Water, park and vegetation rings/holes are clipped to each exact tile rectangle at build time to avoid repeatedly transferring very large relation geometry.';
download.coreGeometryMatching = { method: 'Exact centimetre-projected line geometry, invariant to reversal; building rings invariant to rotation/reversal.', buildingOwnership: 'Buildings with centroid inside the existing core, or exact geometry matching a building rendered by the core, are omitted from streamed ownership. Other exact matches to known core outlines retain their known OSM IDs.', sourceIds: 'BBBike features lacking original OSM IDs keep osmId:null and explicit providerFeatureId/source ordinal/source URL. A content hash is never labelled as an OSM ID.' };
await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'provenance.json'), JSON.stringify({ ...download, counts: manifest.counts, bytesTotal, omitted, coreSource: '../provenance.json', sourceDocumentation: ['https://wiki.openstreetmap.org/wiki/Overpass_API', 'https://dev.overpass-api.de/overpass-doc/en/preface/commons.html', 'https://www.openstreetmap.org/copyright'], transformations: ['Coordinates projected to the existing local x/z metre origin and rounded to centimetres.', 'Real road geometries retained with explicit original OSM IDs where available or provider content identifiers otherwise; full road geometry is indexed into every intersected tile.', 'Multipolygon member ways stitched into closed outer rings; inner rings retained as holes. Incomplete rings are omitted and counted.', 'Buildings assigned once by polygon centroid; complete footprints retained. Existing core building IDs omitted from streamed geometry and kept as tree avoidance context.', 'Road bridge, tunnel, layer, access, surface, lane, width, oneway and maxspeed metadata retained.', 'Actual water and park/vegetation outlines retained. No synthetic roads or building footprints are introduced.', 'Building height and facade defaults are renderer assumptions when absent in OSM; this is not a photogrammetric or cadastral dataset.'], license: 'Open Database License 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', attribution: '© OpenStreetMap contributors' }, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'LICENSE.txt'), 'Contains information from OpenStreetMap, made available under the Open Database License (ODbL) 1.0.\n© OpenStreetMap contributors\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\n\nThe tile JSON files are an adapted database of the bounded extract described in provenance.json.\n');
console.log(JSON.stringify({ ...manifest.counts, bytesTotal, omitted, largestTiles: Object.entries(manifest.tiles).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5).map(([key, v]) => ({ key, bytes: v.bytes })) }));
