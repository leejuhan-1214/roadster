"""Extend the original OSM subway and signal points with the pinned BBBike extract.

Usage: python scripts/build-regional-street-points.py Seoul.osm.geojson.xz
The existing street-points file is the historical source for the central square.
Repeating the build retains those original records and regenerates the outskirts.
"""
import argparse
import hashlib
import json
import lzma
import math
from pathlib import Path

CITY=Path(__file__).resolve().parents[1]/'dist/assets/city'
ARCHIVE_HASH='1636b1c963d8a6168ddff76d1ba5cb43470e0309b65b1090750040b1e2cee9af'
ARCHIVE_URL='https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz'


def read(path):
    return json.loads(path.read_text('utf-8'))


def inside(x,z,b):
    return b['minX']<=x<b['maxX'] and b['minZ']<=z<b['maxZ']


def build(archive):
    with archive.open('rb') as file:
        if hashlib.file_digest(file,'sha256').hexdigest()!=ARCHIVE_HASH:
            raise ValueError('Unexpected source digest')
    manifest=read(CITY/'seoul/manifest.json')
    box=manifest['bounds'];detail=manifest['detailBounds']
    points_file=CITY/'street-points.json'
    metadata_file=CITY/'street-points.provenance.json'
    points=read(points_file);meta=read(metadata_file)
    original=meta.get('central',meta)
    lat,lon=manifest['origin'];metre_lon=111320*math.cos(math.radians(lat))
    exits=[e for e in points['entrances'] if inside(e[0],e[1],detail)]
    lights=[s for s in points['signals'] if inside(s[0],s[1],detail)]
    if (len(exits),len(lights))!=(original['counts']['entrances'],original['counts']['signals']):
        raise ValueError('Central point extract differs from its archived record')
    core_exits=len(exits);core_lights=len(lights)
    outer_exits={};outer_lights=set();stations=[]
    with lzma.open(archive,'rb') as features:
        for line in features:
            if b'"type":"Point"' not in line or not any(s in line for s in (b'"railway":"station"',b'"railway":"subway_entrance"',b'"highway":"traffic_signals"')):
                continue
            feature=json.loads(line.rstrip(b',\r\n'))
            t=feature['properties'];lng,lt=feature['geometry']['coordinates'][:2]
            x=round((lng-lon)*metre_lon,1);z=round((lat-lt)*111320,1)
            if t.get('railway')=='station' and t.get('name'):
                if box['minX']-420<=x<=box['maxX']+420 and box['minZ']-420<=z<=box['maxZ']+420:
                    stations.append((x,z,t['name']))
            elif inside(x,z,box) and not inside(x,z,detail):
                if t.get('railway')=='subway_entrance':
                    outer_exits[x,z]=str(t.get('ref',''))
                elif t.get('highway')=='traffic_signals':
                    outer_lights.add((x,z))
    unmatched=0
    for (x,z),ref in outer_exits.items():
        station='';best=420**2
        for sx,sz,name in stations:
            d=(sx-x)**2+(sz-z)**2
            if d<best:
                best=d;station=name
        if not station:
            unmatched+=1
        exits.append([x,z,ref,station])
    lights.extend(outer_lights);exits.sort();lights.sort(key=lambda point:(point[0],point[1]))
    points.update(name='서울 광역 주행 지하철 출입구·신호 위치',bounds=box,entrances=exits,signals=lights,
                  sourceTimestamp=None,sourceTimestamps={'centralOSM':original['sourceTimestamp'],'regionalOSM':None,'regionalArchiveLastModified':'2026-11-08T04:07:00Z'})
    payload=json.dumps(points,separators=(',',':'),ensure_ascii=False).encode()
    points_file.write_bytes(payload)
    metadata={'file':points_file.name,'sha256':hashlib.sha256(payload).hexdigest(),'bytes':len(payload),'bbox':manifest['bbox'],'origin':manifest['origin'],
              'counts':{'entrances':len(exits),'signals':len(lights)},'central':original,
              'regional':{'archive':ARCHIVE_URL,'rawSha256':ARCHIVE_HASH,'sourceTimestamp':None,'archiveLastModified':'2026-11-08T04:07:00Z','counts':{'entrances':len(exits)-core_exits,'signals':len(lights)-core_lights,'namedStationAnchors':len(stations),'unmatchedEntrances':unmatched}},
              'changes':'Keep the complete historical central point extract. Elsewhere retain mapped railway=subway_entrance and highway=traffic_signals nodes inside the driving extent. Assign the nearest named railway=station node strictly within 420 m; preserve mapped exit references. Station association is spatially inferred. Coordinates rounded to 0.1 metre. Signal mast shapes and nearby roadside gate poses are renderer estimates.',
              'license':original['license'],'licenseUrl':original['licenseUrl'],'attribution':original['attribution']}
    metadata_file.write_bytes((json.dumps(metadata,ensure_ascii=False,indent=2)+'\n').encode())
    print(metadata['counts'],metadata['regional']['counts'],len(payload))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive',type=Path)
    build(parser.parse_args().archive)
