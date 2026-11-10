import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// A bounded, resumable offline extract. The application never queries Overpass.
const origin = [37.4979, 127.0276];
const extent = 5120;
const metreLat = 111320;
const metreLon = metreLat * Math.cos(origin[0] * Math.PI / 180);
const bbox = [origin[0] - extent / metreLat, origin[1] - extent / metreLon,
  origin[0] + extent / metreLat, origin[1] + extent / metreLon];
const endpoint = process.env.OSM_OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter';
const cacheDir = path.resolve(process.env.SEOUL_SOURCE_DIR || path.join(import.meta.dirname, '../../../data/seoul-source'));
const roadPattern = '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$';
await fs.mkdir(cacheDir, { recursive: true });
const sha = raw => createHash('sha256').update(raw).digest('hex');
const parts = [];
for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
  const b = [bbox[0] + (bbox[2] - bbox[0]) * iy / 2, bbox[1] + (bbox[3] - bbox[1]) * ix / 2,
    bbox[0] + (bbox[2] - bbox[0]) * (iy + 1) / 2, bbox[1] + (bbox[3] - bbox[1]) * (ix + 1) / 2];
  const box = b.join(',');
  const query = `[out:json][timeout:100][maxsize:134217728];(way["highway"~"${roadPattern}"]["area"!="yes"](${box});way["building"]["building"!="no"](${box});relation["building"]["type"="multipolygon"](${box});way["natural"~"^(water|wood|scrub|grassland)$"](${box});relation["natural"~"^(water|wood|scrub|grassland)$"]["type"="multipolygon"](${box});way["landuse"~"^(forest|grass|recreation_ground)$"](${box});relation["landuse"~"^(forest|grass|recreation_ground)$"]["type"="multipolygon"](${box});way["leisure"="park"](${box});relation["leisure"="park"]["type"="multipolygon"](${box}););out geom;`;
  parts.push({ key: `${ix}_${iy}`, bbox: b, query });
}
// Reuse completed quadrants; remaining dense districts use 2.56 km subregions.
const planned=[];
for(const part of parts){
 let cached=false;try{const meta=JSON.parse(await fs.readFile(path.join(cacheDir,'quadrant-'+part.key+'-download.json'),'utf8'));cached=meta.query===part.query;}catch{}
 if(cached){planned.push(part);continue;}
 const [s,w,n,e]=part.bbox;
 for(let iy=0;iy<2;iy++)for(let ix=0;ix<2;ix++){
  const b=[s+(n-s)*iy/2,w+(e-w)*ix/2,s+(n-s)*(iy+1)/2,w+(e-w)*(ix+1)/2];
  planned.push({key:part.key+'-'+ix+'_'+iy,bbox:b,query:part.query.replaceAll(part.bbox.join(','),b.join(','))});
 }
}
const elements = new Map(), sources = [];
for (const part of planned) {
  const rawFile = path.join(cacheDir, `quadrant-${part.key}.json`), metaFile = path.join(cacheDir, `quadrant-${part.key}-download.json`);
  let raw, metadata;
  if (!process.argv.includes('--force')) try {
    metadata = JSON.parse(await fs.readFile(metaFile, 'utf8'));
    if (metadata.query === part.query) raw = await fs.readFile(rawFile, 'utf8');
  } catch {}
  if (!raw) {
    console.log(JSON.stringify({ downloading: part.key, endpoint, bbox: part.bbox }));
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'RoadsterLandingLab/1.25 (+https://github.com/leejuhan-1214/roadster; educational offline map)' },
      body: new URLSearchParams({ data: part.query }), signal: AbortSignal.timeout(125000),
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    raw = await response.text();
    const data = JSON.parse(raw);
    if (data.remark || !data.elements?.length) throw new Error(`Incomplete Overpass response ${part.key}: ${data.remark || 'empty'}`);
    metadata = { ...part, endpoint, downloadedAt: new Date().toISOString(), sourceTimestamp: data.osm3s?.timestamp_osm_base || null, rawSha256: sha(raw), rawBytes: Buffer.byteLength(raw), elementCount: data.elements.length };
    await fs.writeFile(rawFile, raw);
    await fs.writeFile(metaFile, JSON.stringify(metadata, null, 2) + '\n');
  }
  const data = JSON.parse(raw);
  for (const element of data.elements) elements.set(`${element.type}/${element.id}`, element);
  sources.push(metadata);
  console.log(JSON.stringify({ complete: part.key, elements: data.elements.length, bytes: Buffer.byteLength(raw), sourceTimestamp: metadata.sourceTimestamp }));
}
const timestamps = sources.map(s => s.sourceTimestamp).filter(Boolean).sort();
const combined = JSON.stringify({ version: 0.6, generator: 'Roadster offline deduplicated bounded Overpass extracts', osm3s: { timestamp_osm_base: timestamps.at(-1), copyright: '© OpenStreetMap contributors, ODbL 1.0' }, elements: Array.from(elements.values()).sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id) });
const metadata = { endpoint, bbox, origin, extent, downloadedAt: new Date().toISOString(), sourceTimestamp: timestamps.at(-1), sourceTimestampRange: [timestamps[0], timestamps.at(-1)], rawSha256: sha(combined), rawBytes: Buffer.byteLength(combined), elementCount: elements.size, sources };
await fs.writeFile(path.join(cacheDir, 'seoul-overpass.json'), combined);
await fs.writeFile(path.join(cacheDir, 'download.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ complete: true, file: path.join(cacheDir, 'seoul-overpass.json'), elements: elements.size, bytes: metadata.rawBytes }));
