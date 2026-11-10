import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createHash } from 'node:crypto';
import xz from 'xz-decompress';
import { canonicalGeoJSON } from './seoul-geometry.mjs';
const { XzReadableStream } = xz;

const sourceDir = path.resolve(process.env.SEOUL_SOURCE_DIR || path.join(import.meta.dirname, '../../../data/seoul-source'));
const input = path.resolve(process.argv[2] || path.join(sourceDir, 'Seoul.osm.geojson.xz'));
const metadataFile = path.resolve(process.argv[3] || path.join(sourceDir, 'bbbike-download.json'));
const origin = [37.4979, 127.0276], extent = 5120, metreLon = 111320 * Math.cos(origin[0] * Math.PI / 180);
const bbox = [origin[0] - extent / 111320, origin[1] - extent / metreLon, origin[0] + extent / 111320, origin[1] + extent / metreLon];
const endpoint = 'https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz';
const roadTypes = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service']);
const natureTypes = new Set(['water', 'wood', 'scrub', 'grassland']), landuseTypes = new Set(['forest', 'grass', 'recreation_ground']);
let httpMetadata = {};
try { httpMetadata = JSON.parse(await fs.readFile(metadataFile, 'utf8')); } catch {}

// Incremental FeatureCollection scanner: JSON strings and nested geometry arrays
// are tracked, so feature line formatting and largest-file size do not matter.
async function* features(stream) {
  const decoder = new TextDecoder();
  let header = '', started = false, active = false, depth = 0, quoted = false, escaped = false, parts = [];
  for await (const chunk of stream) {
    let text = decoder.decode(chunk, { stream: true });
    if (!started) {
      header += text;
      const match = /"features"\s*:\s*\[/.exec(header);
      if (!match) { if (header.length > 8_000_000) throw new Error('Unexpected GeoJSON header'); continue; }
      text = header.slice(match.index + match[0].length); header = ''; started = true;
    }
    let partStart = active ? 0 : -1;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (!active) {
        if (char === ']') return;
        if (char !== '{') continue;
        active = true; depth = 1; quoted = false; escaped = false; partStart = i;
        continue;
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;
      if (!depth) {
        parts.push(text.slice(partStart, i + 1));
        const feature = JSON.parse(parts.join(''));
        if (feature.type !== 'Feature') throw new Error('Non-feature in GeoJSON array');
        yield feature;
        parts = []; active = false; partStart = -1;
      }
    }
    if (active && partStart >= 0) parts.push(text.slice(partStart));
  }
  if (active || !started) throw new Error('Incomplete GeoJSON source');
}

function sourceId(feature) {
  const p = feature.properties || {}, type = p['@type'] || p.osm_type, id = p['@id'] || p.osm_id;
  if (['node', 'way', 'relation'].includes(type) && id != null) return [type, Number(id)];
  const value = String(feature.id || '');
  let match = /^(node|way|relation)\/(\d+)$/.exec(value);
  if (match) return [match[1], Number(match[2])];
  match = /^([nwa])(\d+)$/.exec(value);
  if (match) {
    const n = Number(match[2]);
    if (match[1] === 'n') return ['node', n];
    if (match[1] === 'w') return ['way', n];
    return [n % 2 ? 'relation' : 'way', Math.floor(n / 2)];
  }
  if (id != null && feature.geometry?.type === 'LineString') return ['way', Number(id)];
  return [null, null];
}
function geometryBounds(value, b = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (typeof value?.[0] === 'number') {
    b[0] = Math.min(b[0], value[0]); b[1] = Math.min(b[1], value[1]); b[2] = Math.max(b[2], value[0]); b[3] = Math.max(b[3], value[1]);
  } else if (Array.isArray(value)) for (const child of value) geometryBounds(child, b);
  return b;
}
const toGeometry = ring => ring.map(([lon, lat]) => ({ lon, lat }));
const project = ([lon, lat]) => [Math.round((lon - origin[1]) * metreLon * 100) / 100, Math.round(-(lat - origin[0]) * 111320 * 100) / 100];
const digest = createHash('sha256');
for await (const chunk of createReadStream(input)) digest.update(chunk);
const compressedSha256 = digest.digest('hex'), compressedBytes = (await fs.stat(input)).size;
console.log(JSON.stringify({ input, compressedSha256, compressedBytes }));
const decompressed = new XzReadableStream(Readable.toWeb(createReadStream(input)));
const elements = new Map(); let scanned = 0, selected = 0;
for await (const feature of features(decompressed)) {
  scanned++;
  if (scanned % 100000 === 0) console.log(JSON.stringify({ scanned, selected }));
  const t = feature.properties || {}, geo = feature.geometry || {}, kind = geo.type;
  const road = roadTypes.has(t.highway) && t.area !== 'yes';
  const polygon = (t.building != null && t.building !== 'no') || natureTypes.has(t.natural) || landuseTypes.has(t.landuse) || t.leisure === 'park';
  if (!((kind === 'LineString' && road) || ((kind === 'Polygon' || kind === 'MultiPolygon') && polygon))) continue;
  const b = geometryBounds(geo.coordinates);
  if (b[0] > bbox[3] || b[2] < bbox[1] || b[1] > bbox[2] || b[3] < bbox[0]) continue;
  const [osmType, osmId] = sourceId(feature);
  if (osmId !== null && (!Number.isSafeInteger(osmId) || osmId <= 0 || !['way', 'relation'].includes(osmType))) throw new Error('Invalid original OSM geometry ID');
  const tags = Object.fromEntries(Object.entries(t).filter(([key, value]) => !key.startsWith('@') && !['osm_id', 'osm_type'].includes(key) && value != null).map(([key, value]) => [key, String(value)]));
  const stableTags = Object.fromEntries(Object.entries(tags).sort(([a], [b]) => a.localeCompare(b)));
  const providerFeatureId = 'bbbike:' + createHash('sha256').update(JSON.stringify([canonicalGeoJSON(geo, project), stableTags])).digest('hex');
  const type = osmType || 'way', id = osmId ?? providerFeatureId;
  const key = osmId === null ? providerFeatureId : `${type}/${id}`;
  const element = elements.get(key) || { type, id, osmType, osmId, providerFeatureId, sourceFeatureOrdinal: scanned, sourceUrl: endpoint, tags };
  Object.assign(element.tags, tags);
  if (kind === 'LineString') element.geometry = toGeometry(geo.coordinates);
  else {
    const polygons = kind === 'Polygon' ? [geo.coordinates] : geo.coordinates;
    element.polygons = polygons.filter(p => p.length).map(p => ({ geometry: toGeometry(p[0]), holes: p.slice(1).map(toGeometry) }));
    if (!element.geometry && element.polygons.length) element.geometry = element.polygons[0].geometry;
  }
  elements.set(key, element); selected++;
}
if (!elements.size) throw new Error('No selected Seoul features');
const sourceTimestamp = httpMetadata.sourceTimestamp || null;
const raw = JSON.stringify({ version: 0.6, generator: 'Roadster bounded import from BBBike Osmium GeoJSON', osm3s: { timestamp_osm_base: sourceTimestamp, copyright: '© OpenStreetMap contributors, ODbL 1.0' }, elements: Array.from(elements.values()).sort((a, b) => a.type.localeCompare(b.type) || String(a.id).localeCompare(String(b.id))) });
const downloadedAt = httpMetadata.downloadedAt || new Date().toISOString();
const sourceRecord = { kind: 'bbbike-geojson', url: endpoint, rawSha256: compressedSha256, rawBytes: compressedBytes, elementCount: elements.size, sourceTimestamp, downloadedAt, lastModified: httpMetadata.lastModified || httpMetadata['last-modified'] || null, httpMetadata, sourceRegion: [37.35, 126.58, 37.72, 127.31], bbox, idDocumentation: 'https://docs.osmcode.org/osmium/latest/osmium-export.html', snapshotNote: 'HTTP Last-Modified is file publication time, not an asserted OSM replication timestamp.' };
const metadata = { kind: 'bbbike-geojson', endpoint, bbox, origin, extent, downloadedAt, sourceTimestamp, rawSha256: createHash('sha256').update(raw).digest('hex'), rawBytes: Buffer.byteLength(raw), elementCount: elements.size, sources: [sourceRecord], sourceFeatureCount: scanned, selectedFeatureCount: selected, importNotes: ['Filtered complete source geometries to bounded region by intersection.', 'Original OSM IDs decoded from Osmium metadata/type_id; no generated map feature IDs.', 'Multipolygon geometry and inner holes assembled by source Osmium export, preserved without fabricated members.', 'All selected-feature OSM tags retained; geometric clipping and ownership happen in the tile builder.'] };
await fs.mkdir(sourceDir, { recursive: true });
metadata.featureIdentity = { originalOsmIdsAvailable: [...elements.values()].some(e => e.osmId !== null), providerFeatureId: 'bbbike:SHA256(canonical centimetre-projected geometry + sorted OSM tags)', sourceFeatureOrdinal: '1-based position in the original source FeatureCollection', knownCoreMatching: 'Known core OSM IDs are retained only after exact canonical geometry matching in the tile builder.' };
metadata.importNotes[1] = 'Source GeoJSON omits OSM IDs. Hash-based provider feature identifiers and source ordinals are explicit; osmId is null unless an actual source ID exists or exact core geometry matches.';
await fs.writeFile(path.join(sourceDir, 'seoul-overpass.json'), raw);
await fs.writeFile(path.join(sourceDir, 'download.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ complete: true, elements: elements.size, bytes: Buffer.byteLength(raw), scanned }));
