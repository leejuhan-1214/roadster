"""Build offline 2.048 km packs of 512 m driving tiles from the pinned BBBike extract.

Requires Python 3.11+ and Shapely 2.1.2. Run prepare, then finish with the
projected water GeoJSON exported by build-seoul-driving-map.py --water-output.
Cache must be a dedicated build directory. Source ordinals refer to features in
the hash-verified archive. They are provider identities, not OSM way IDs.
"""
import argparse
from collections import Counter, defaultdict
from functools import lru_cache
import gzip
import hashlib
import json
import lzma
import math
from pathlib import Path
import re

from shapely.geometry import Polygon, box, shape

ASSETS = Path(__file__).resolve().parents[1] / 'dist/assets/city/seoul'
SOURCE_HASH = '1636b1c963d8a6168ddff76d1ba5cb43470e0309b65b1090750040b1e2cee9af'
SOURCE_URL = 'https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz'
LAT, LON = 37.4979, 127.0276
METRES_LON = 111320 * math.cos(math.radians(LAT))
SIZE, PACK = 512, 4
X0, X1, Z0, Z1 = -56, 32, -48, 24
BOUNDS = dict(minX=X0*SIZE, maxX=X1*SIZE, minZ=Z0*SIZE, maxZ=Z1*SIZE)
ROADS = set('motorway motorway_link trunk trunk_link primary primary_link secondary secondary_link tertiary tertiary_link unclassified residential living_street service'.split())
GREENS = {'park','garden','forest','grass','recreation_ground','wood','scrub','grassland','meadow'}


def compact(value):
    return json.dumps(value, separators=(',', ':'), ensure_ascii=False)


def project(p):
    return ((p[0]-LON)*METRES_LON, (LAT-p[1])*111320)


def centipoints(points):
    # Delta encoding is lossless at the existing 1 cm world precision.
    encoded, last_x, last_z = [], 0, 0
    for x, z in points:
        nx, nz = round(x*100), round(z*100)
        encoded.extend((nx-last_x, nz-last_z))
        last_x, last_z = nx, nz
    return encoded


def core(i, j):
    return -10 <= i < 10 and -10 <= j < 10


def grid(bounds, padding=0):
    x0,z0,x1,z1 = bounds
    for j in range(max(Z0, math.floor((z0-padding)/SIZE)),min(Z1, math.floor((z1+padding)/SIZE)+1)):
        for i in range(max(X0, math.floor((x0-padding)/SIZE)),min(X1, math.floor((x1+padding)/SIZE)+1)):
            yield i,j


def extent(points):
    xs,zs = zip(*points)
    return min(xs),min(zs),max(xs),max(zs)


def polygons(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == 'Polygon':
        yield geometry
    elif hasattr(geometry,'geoms'):
        for member in geometry.geoms:
            yield from polygons(member)


def rings(polygon):
    return [centipoints(r.coords) for r in (polygon.exterior,*polygon.interiors)]


def number(tag):
    m = re.match(r'-?\d+(?:\.\d+)?', str(tag or '').strip())
    return float(m[0]) if m else None


def attributes(tags, mapping, numbers=()):
    result = {}
    for src, dest in mapping.items():
        if src not in tags:
            continue
        value = number(tags[src]) if dest in numbers else tags[src]
        if value is not None:
            result[dest] = value
    return result


def cell_mask(i,j):
    return 1 << ((j % PACK)*PACK + i % PACK)


def prepare(args):
    with args.extract.open('rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest() != SOURCE_HASH:
            raise ValueError('Unexpected BBBike archive hash')
    args.cache.mkdir(parents=True, exist_ok=True)
    opened, initialized, counts = {},set(),Counter()
    def write(key, data):
        if key not in opened:
            if len(opened) == 32:
                opened.pop(next(iter(opened))).close()
            opened[key]=(args.cache/f'{key[0]}_{key[1]}.jsonl').open('a' if key in initialized else 'w', encoding='utf-8')
            initialized.add(key)
        opened[key].write(compact(data)+'\n')

    def index(kind, record, cells, owner=None):
        masks=defaultdict(int)
        for i,j in cells:
            if not core(i,j):
                masks[i//PACK,j//PACK] |= cell_mask(i,j)
        for key,mask in masks.items():
            owned = cell_mask(*owner) if owner and key==(owner[0]//PACK,owner[1]//PACK) and not core(*owner) else 0
            write(key, [kind,mask,owned,record])
        if masks:
            counts[kind]+=1

    def green(polygon, kind):
        if not polygon.is_valid:
            polygon=polygon.buffer(0)
        if polygon.is_empty:
            return
        for i,j in grid(polygon.bounds):
            if core(i,j):
                continue
            clipped=polygon.intersection(box(i*SIZE,j*SIZE,(i+1)*SIZE,(j+1)*SIZE))
            for part in polygons(clipped):
                if part.area>1:
                    write((i//PACK,j//PACK),['g',cell_mask(i,j),0,[kind,rings(part)]])
                    counts['g']+=1
    with lzma.open(args.extract,'rb') as lines:
        for ordinal,line in enumerate(lines):
            if ordinal%250000==0:
                print('features',ordinal,dict(counts),flush=True)
            if not line.startswith(b'{"type":"Feature"') or b'"type":"Point"' in line:
                continue
            f=json.loads(line.rstrip(b',\r\n')); t=f['properties']; geom=f['geometry']; geom_type=geom['type']; coords=geom.get('coordinates',[])
            highway=t.get('highway')
            if geom_type=='LineString' and highway in ROADS and t.get('area')!='yes' and len(coords)>1:
                pts=[project(p) for p in coords]; cover=set()
                # Include neighboring pavement and junction geometry, never index a
                # diagonal way into its entire rectangular bounding box.
                for a,b in zip(pts,pts[1:]):
                    cover.update(grid((min(a[0],b[0]),min(a[1],b[1]),max(a[0],b[0]),max(a[1],b[1])),32))
                if not any(not core(*cell) for cell in cover):
                    continue
                attr=attributes(t,{'highway':'type','name':'name','width':'width','lanes':'lanes','bridge':'bridge','tunnel':'tunnel','layer':'layer','surface':'surface','access':'access','motor_vehicle':'motorVehicle','maxspeed':'maxspeed'},('width','lanes','layer'))
                if t.get('oneway') in ('yes','1','-1'):
                    attr['oneway']=True
                    if t['oneway']=='-1':
                        attr['onewayDirection']=-1
                index('r',[ordinal,attr,centipoints(pts)],cover)
                continue
            if geom_type not in ('Polygon','MultiPolygon'):
                continue
            nature=next((t[k] for k in ['leisure','landuse','natural'] if t.get(k) in GREENS),None)
            building=t.get('building') and t['building']!='no' and t.get('location')!='underground' and (number(t.get('layer')) or 0)>=0
            if not (building or nature):
                continue
            for part,raw in enumerate([coords] if geom_type=='Polygon' else coords):
                if not raw or len(raw[0])<4:
                    continue
                outer=[project(p) for p in raw[0]]
                cells=list(grid(extent(outer)))
                if not any(not core(*cell) for cell in cells):
                    continue
                holes=[[project(p) for p in ring] for ring in raw[1:] if len(ring)>=4]
                outline=Polygon(outer,holes)
                if not building:
                    green(outline,nature)
                    continue
                center=Polygon(outer).centroid
                if center.is_empty:
                    continue
                owner=(math.floor(center.x/SIZE),math.floor(center.y/SIZE))
                attr=attributes(t,{'building':'type','name':'name','height':'height','building:levels':'levels','min_height':'minHeight','building:min_level':'minLevel','building:material':'material','building:colour':'colour','roof:shape':'roofShape'},('height','levels','minHeight','minLevel'))
                sid=ordinal if part==0 else f'{ordinal}/{part}'
                index('b',[sid,attr,[centipoints(ring) for ring in [outer,*holes]]],cells,owner)
    for handle in opened.values():
        handle.close()
    (args.cache/'prepared.json').write_text(compact({'counts':counts,'keys':sorted(initialized),'source':SOURCE_HASH}),'utf-8')
    print('prepared',dict(counts),flush=True)


def finish(args):
    prepared=json.loads((args.cache/'prepared.json').read_text('utf-8'))
    if prepared['source']!=SOURCE_HASH:
        raise ValueError('Cache source mismatch')
    water=json.loads(args.water.read_text('utf-8'))
    if water['type']=='FeatureCollection':
        shapes=[shape(f['geometry']) for f in water['features']]
    else:
        shapes=[shape(water.get('geometry',water))]
    wet=defaultdict(list); inner_wet=set()
    for geometry in shapes:
        for polygon in polygons(geometry):
            for i,j in grid(polygon.bounds):
                clipped=polygon.intersection(box(i*SIZE,j*SIZE,(i+1)*SIZE,(j+1)*SIZE))
                for part in polygons(clipped):
                    if part.area>0.2:
                        wet[i//PACK,j//PACK].append(['w', cell_mask(i,j),0,rings(part)])
                        if core(i,j):
                            inner_wet.add(f'{i}_{j}')
    out=ASSETS/'region';out.mkdir(exist_ok=True)
    checksums={}; totals=Counter(); metadata={}
    keys={tuple(k) for k in prepared['keys']}
    for pz in range(Z0//PACK,Z1//PACK):
        for px in range(X0//PACK,X1//PACK):
            key=(px,pz); label=f'{px}_{pz}'
            entries=[]
            if key in keys:
                with (args.cache/(label+'.jsonl')).open(encoding='utf-8') as stream:
                    entries=[json.loads(line) for line in stream]
            entries.extend(wet[key])
            if not entries:
                continue
            payload=gzip.compress(compact(entries).encode(),compresslevel=6,mtime=0)
            checksums[label]=hashlib.sha256(payload).hexdigest()
            (out/(label+'.bin')).write_bytes(payload)
            totals['bytes']+=len(payload)
            for kind,_,owner,_ in entries:
                totals[kind+'Records']+=1
                if kind=='b' and owner:
                    totals['ownedBuildings']+=1
            metadata[label]=checksums[label][:12]
    manifest_path=ASSETS/'manifest.json';m=json.loads(manifest_path.read_text('utf-8'))
    m['detailBounds']={'minX':-5120,'maxX':5120,'minZ':-5120,'maxZ':5120}
    m['bounds']=BOUNDS
    m['bbox']=[LAT-BOUNDS['maxZ']/111320,LON+BOUNDS['minX']/METRES_LON,LAT-BOUNDS['minZ']/111320,LON+BOUNDS['maxX']/METRES_LON]
    m['coverageKm']=[(X1-X0)*SIZE/1000,(Z1-Z0)*SIZE/1000]
    m['regional']={'schema':1,'packTiles':PACK,'tileCount':(X1-X0)*(Z1-Z0)-len(m['tiles']),'packs':metadata,'waterOverrides':sorted(inner_wet),'source':'regional-provenance.json'}
    manifest_path.write_bytes((json.dumps(m,ensure_ascii=False,indent=2)+'\n').encode())
    provenance={'bounds':BOUNDS,'source':SOURCE_URL,'archiveSha256':SOURCE_HASH,'waterSource':'driving-map-sources.json','waterGeometrySha256':hashlib.sha256(args.water.read_bytes()).hexdigest(),'license':'ODbL-1.0','attribution':'© OpenStreetMap contributors, © OpenMapTiles, OpenFreeMap','units':'World x east, z south, metres. Vertices encoded as signed centimetre deltas. Four by four 512 m cells share one gzip JSON pack.','featureIdentity':'R and B identify the original one-based BBBike FeatureCollection ordinal, including component suffix for multipolygons; original OSM IDs are unavailable.','method':'Mapped surface roads and centered building footprints outside the detailed area. Full footprints, courtyards and lane tags retained. Height is estimated only when OSM has no height/level. Water and mapped green surfaces are clipped to each cell. No generated streets or building outlines.','uniqueRoadsTouchingOuterCells':prepared['counts'].get('r',0),'totals':totals,'archivedAt':'2026-11-10','packHashes':checksums}
    (ASSETS/'regional-provenance.json').write_bytes((json.dumps(provenance,ensure_ascii=False,indent=2)+'\n').encode())
    print('published packs',len(metadata),dict(totals),'central water cells',len(inner_wet),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=['prepare','finish'])
    parser.add_argument('--extract',type=Path)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--water',type=Path)
    args=parser.parse_args()
    if args.stage=='prepare':
        prepare(args)
    else:
        finish(args)
