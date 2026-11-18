"""Build the Seoul driving map from the simulator's mapped geometry (offline display).

Build tools: python -m pip install shapely==2.1.2 mapbox-vector-tile==2.2.0
Usage: python scripts/build-seoul-driving-map.py --bbbike Seoul.osm.geojson.xz --cache map-tiles
Source extract and the nine pinned water tiles are identified in driving-map-sources.json.
"""
import argparse
import gzip
import hashlib
import json
import lzma
import math
from pathlib import Path
from urllib.request import Request, urlopen

import mapbox_vector_tile
from shapely.geometry import LineString, Point, Polygon, box, shape
from shapely.ops import polygonize, transform, unary_union
from shapely.strtree import STRtree

ASSETS = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
CITY = ASSETS / 'city'
SEOUL = CITY / 'seoul'
MANIFEST = json.loads((SEOUL / 'manifest.json').read_text('utf-8'))
ORIGIN_LAT, ORIGIN_LON = MANIFEST['origin']
METRES_LON = 111320 * math.cos(math.radians(ORIGIN_LAT))
BOUNDS = MANIFEST['bounds']
REGION = box(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ'])
BRIDGE_IDS = dict(zip(['동작대교','반포대교','잠수교','한남대교','동호대교','성수대교','영동대교','청담대교'],
                       ['dongjak','banpo','jamsu','hannam','dongho','seongsu','yeongdong','cheongdam']))
ROAD_CLASSES = {'motorway','trunk','primary','secondary','tertiary','residential','unclassified','living_street'}
PLANET = 'https://tiles.openfreemap.org/planet/20261115_080022_pt'
BBBIKE = 'https://download.bbbike.org/osm/bbbike/Seoul/Seoul.osm.geojson.xz'
BBBIKE_HASH = '1636b1c963d8a6168ddff76d1ba5cb43470e0309b65b1090750040b1e2cee9af'
BANPO_PARK = 'https://hangang.seoul.go.kr/www/contents/663.do?mid=425'
JAMWON_PARK = 'https://hangang.seoul.go.kr/www/contents/657.do?mid=454'


def project(lon, lat):
    return ((lon - ORIGIN_LON) * METRES_LON, (ORIGIN_LAT - lat) * 111320)


def read(path):
    return json.loads(path.read_text('utf-8'))


def members(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from members(part, kind)


def vertices(coords):
    # Quantization is for drawing; it never changes the collision geometry.
    points = []
    for x, z in coords:
        pt = [round(x), round(z)]
        if not points or pt != points[-1]:
            points.append(pt)
    return points


def water_geometry(cache):
    waters, sources = [], []
    # z13 tiles intersecting the manifest's geographic bounds. Clip each buffer
    # to its own exact tile edges before dissolving shared shorelines.
    south, west, north, east = MANIFEST['bbox']
    zoom, count = 13, 2**13
    tx = lambda lon: math.floor((lon + 180) / 360 * count)
    ty = lambda lat: math.floor((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*count)
    cache.mkdir(parents=True, exist_ok=True)
    for x in range(tx(west), tx(east)+1):
        for y in range(ty(north), ty(south)+1):
            url = f'{PLANET}/{zoom}/{x}/{y}.pbf'
            file = cache / f'{x}-{y}.pbf'
            if not file.exists():
                file.write_bytes(urlopen(Request(url,headers={'User-Agent':'RoadsterLandingLab map build'}),timeout=45).read())
            raw = file.read_bytes()
            sources.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
            decoded = mapbox_vector_tile.decode(gzip.decompress(raw) if raw.startswith(b'\x1f\x8b') else raw,
                                                default_options={'y_coord_down':True})
            layer = decoded.get('water', {})
            extent = layer.get('extent', 4096)
            def tile_to_world(u, v):
                lon = (x + u/extent)/count*360-180
                lat = math.degrees(math.atan(math.sinh(math.pi*(1-2*(y+v/extent)/count))))
                return project(lon,lat)
            for feature in layer.get('features', []):
                local = shape(feature['geometry'])
                if not local.is_valid:
                    local = local.buffer(0)
                clipped = local.intersection(box(0,0,extent,extent))
                for poly in members(clipped, 'Polygon'):
                    waters.append(transform(tile_to_world,poly))
    # Tiny different floating-point rounding on one shared boundary should
    # not split a continuous river. Work at map scale (one-centimetre grid).
    from shapely import union_all
    geometry = union_all(waters,grid_size=.01).intersection(REGION)
    return sorted((p for p in members(geometry,'Polygon') if p.area>=1800),key=lambda p:-p.area), sources


def source_features(extract):
    with extract.open('rb') as raw:
        digest = hashlib.file_digest(raw, 'sha256').hexdigest()
    if digest!=BBBIKE_HASH:
        raise ValueError('Unexpected source snapshot. Verify the new extract before updating its checksum.')
    names = set(BRIDGE_IDS) | {'세빛섬','강남'}
    encoded = [s.encode('utf-8') for s in names]
    decks, points, evidence = {}, {}, {}
    with lzma.open(extract,'rb') as lines:
        for ordinal,line in enumerate(lines):
            if not any(term in line for term in encoded):
                continue
            f = json.loads(line.rstrip(b',\r\n'))
            t, geom = f['properties'], f['geometry']
            name = t.get('name')
            if name not in names: continue
            if name in BRIDGE_IDS and t.get('man_made')=='bridge' and geom['type'] in ('Polygon','MultiPolygon'):
                decks[name] = transform(project,shape(geom))
            elif name=='세빛섬' and geom['type'] in ('Polygon','MultiPolygon'):
                points[name] = transform(project,shape(geom)).representative_point()
            elif name=='강남' and t.get('railway')=='station' and t.get('operator')=='서울교통공사' and geom['type']=='Point':
                points[name] = transform(project,shape(geom))
            else: continue
            evidence[name] = ordinal
    if set(decks)!=set(BRIDGE_IDS) or set(points)!={'세빛섬','강남'}:
        raise ValueError('A named bridge or landmark is missing from the extract.')
    return decks, points, evidence


def bridge_path(geometry):
    deck = max(members(geometry, 'Polygon'),key=lambda p:p.area)
    corners = list(deck.minimum_rotated_rectangle.exterior.coords)
    a,b = max(zip(corners,corners[1:]),key=lambda pair:math.dist(*pair))
    length = math.dist(a,b)
    dx,dz = (b[0]-a[0])/length,(b[1]-a[1])/length
    centre = deck.centroid
    points = []
    for index in range(49):
        along = length*(((index+.04)/48.08)-.5)
        x,z = centre.x+along*dx,centre.y+along*dz
        cut = LineString([(x-600*dz,z+600*dx),(x+600*dz,z-600*dx)])
        spans = list(members(deck.intersection(cut),'LineString'))
        if spans:
            c = max(spans,key=lambda s:s.length).interpolate(.5,normalized=True)
            points.append(c.coords[0])
    return LineString(points).intersection(REGION).simplify(1.5)


def road_and_city_blocks():
    core = read(CITY / 'gangnam.json')
    roads = {str(o['id']):o for o in core['roads']}
    buildings = {str(o['id']):o for o in core['buildings']}
    for info in MANIFEST['tiles'].values():
        tile = read(SEOUL / info['url'])
        roads.update((str(r['id']),r) for r in tile['roads'])
        buildings.update((str(b['id']),b) for b in tile['buildings'])
    drawn, surface = [], []
    for r in roads.values():
        kind = r['type']
        if kind.removesuffix('_link') not in ROAD_CLASSES or r.get('tunnel') not in (None,'no',False): continue
        line = LineString(r['points']).intersection(REGION)
        for part in members(line,'LineString'):
            coords = vertices(part.simplify(2.4).coords)
            if len(coords)<2: continue
            drawn.append({'kind':kind,'points':coords})
            if r.get('bridge') in (None,'no',False) and r.get('layer',0)==0:
                surface.append(part)
    footprints = []
    for b in buildings.values():
        if len(b['points'])>=3:
            footprints.append(Polygon(b['points']).representative_point())
    buildings_index = STRtree(footprints)
    blocks = []
    for p in polygonize(unary_union(surface)):
        if not 1500<=p.area<=650000 or p.interiors or not len(buildings_index.query(p,predicate='contains')):
            continue
        # Leave enough room for streets at this scale; discard narrow traffic
        # islands. Each retained block encloses at least one mapped building.
        for inner in members(p.buffer(-2.5,join_style='mitre').simplify(3),'Polygon'):
            if inner.area>=1100: blocks.append(vertices(inner.exterior.coords))
    return drawn,blocks,buildings


def landmark(identifier,name,kind,point,source=None):
    x,z = vertices([point.coords[0]])[0]
    lon,lat=ORIGIN_LON+x/METRES_LON,ORIGIN_LAT-z/111320
    return {'id':identifier,'name':name,'kind':kind,'x':x,'z':z,'source':source or f'https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lon:.6f}#map=18/{lat:.6f}/{lon:.6f}'}


def landmarks(buildings,points):
    result = [landmark('gangnam','강남역','station',points['강남']),
              landmark('sebit','세빛섬','culture',points['세빛섬'],BANPO_PARK)]
    for identifier,name,source_name,kind,source in [
        ('coex','코엑스','코엑스','architecture','https://www.coex.co.kr/guide/directions/'),
        ('national-museum','국립중앙박물관','국립중앙박물관','culture','https://www.museum.go.kr/MUSEUM/contents/M0106010000.do?menuId=subway-map'),
        ('arts-center','예술의전당 음악당','예술의전당 음악당','culture','https://www.sac.or.kr/site/main/content/guide'),
        ('bongeunsa','봉은사 대웅전','봉은사 대웅전','temple',None),
        ('trade-tower','트레이드타워','트레이드타워','architecture',None),
        ('seoul-st-marys','서울성모병원','가톨릭대학교 서울성모병원','architecture',None)]:
        candidates = [Polygon(b['points']) for b in buildings.values() if b.get('name')==source_name]
        if not candidates: raise ValueError(f'Missing named footprint: {name}')
        result.append(landmark(identifier,name,kind,max(candidates,key=lambda p:p.area).representative_point(),source))
    regular=read(ASSETS/'city-buildings/manifest.json')['buildings']
    for b in regular:
        if b['name'] not in ('GT Tower East','삼성전자 서초사옥'): continue
        name = 'GT타워 이스트' if b['name']=='GT Tower East' else b['name']
        identifier = 'gt-tower' if b['name']=='GT Tower East' else 'samsung-seocho'
        result.append(landmark(identifier,name,'architecture',Point(b['modelFrame']['center'])))
    for b in read(ASSETS/'city-buildings/provenance-extra.json')['models']:
        result.append(landmark(b['key'],b['name'],'architecture',Point(b['center']),b['sourceFootprint']))
    return result


def generate(extract, cache):
    wet,sources=water_geometry(cache)
    river=wet[0]
    if river.area<4_000_000: raise ValueError('The Han River surface is incomplete.')
    decks,points,evidence=source_features(extract)
    roads,blocks,buildings=road_and_city_blocks()
    bridges=[]
    for name,deck in decks.items():
        line = max(members(bridge_path(deck),'LineString'),key=lambda g:g.length)
        crossings = list(members(line.intersection(river),'LineString'))
        if not crossings: raise ValueError(f'{name} does not cross the Han River')
        midpoint = max(crossings,key=lambda g:g.length).interpolate(.5,normalized=True)
        entry={'id':BRIDGE_IDS[name],'name':name,'points':vertices(line.coords),'label':vertices(midpoint.coords)[0]}
        if name in ('반포대교','잠수교'):
            entry['group']='banpo-crossing'
        if name=='잠수교':
            entry['source']='https://hangang.seoul.go.kr/www/contents/856.do?mid=849'
        elif name in ('동작대교','반포대교','한남대교'):
            entry['source']=BANPO_PARK
        elif name in ('동호대교','영동대교'):
            entry['source']=JAMWON_PARK
        elif name=='청담대교':
            entry['source']='https://hangang.seoul.go.kr/www/contents/656.do?mid=452'
        else:
            entry['source']=landmark(entry['id'],name,'bridge',midpoint)['source']
        bridges.append(entry)
    bridges.sort(key=lambda b:b['label'][0])
    river_labels=[]
    for west,east in [(-3600,-3290),(-1300,-650),(1600,2400)]:
        site = river.intersection(box(west,-5120,east,5120))
        p = max(members(site,'Polygon'),key=lambda g:g.area).representative_point()
        river_labels.append(vertices(p.coords)[0])
    water, islands = [], []
    for p in wet:
        clean=p.simplify(2,preserve_topology=True)
        water.append(vertices(clean.exterior.coords))
        islands.extend(vertices(r.coords) for r in clean.interiors if Polygon(r).area>=150)
    result={'bounds':BOUNDS,'water':water,'islands':islands,'bridges':bridges,'roads':roads,'blocks':blocks,
            'landmarks':landmarks(buildings,points),'riverLabels':river_labels,'riverLabel':river_labels[1]}
    print({key:len(value) for key,value in result.items() if isinstance(value,list)})
    (SEOUL/'driving-map.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
    attribution={'attribution':'OpenFreeMap © OpenMapTiles · Map data © OpenStreetMap contributors','license':'ODbL-1.0',
        'licenseUrl':'https://www.openstreetmap.org/copyright','openFreeMap':'https://openfreemap.org/','openMapTiles':'https://openmaptiles.org/',
        'projection':{'worldOriginLatLon':MANIFEST['origin'],'eastMetresPerDegree':METRES_LON,'northMetresPerDegree':111320,'northIsNegativeZ':True},
        'roadsAndBlocks':{'source':'provenance.json','coreSource':'../provenance.json','method':'Real road centrelines clipped to simulation coverage. Surface-road faces enclosing mapped buildings supply generalized urban blocks. These are not cadastral parcels. Underground roads are omitted from the surface map.'},
        'water':{'layer':'OpenMapTiles water, zoom 13','schema':'https://openmaptiles.org/schema/','tiles':sources,'method':'Tile buffers removed, shorelines dissolved and clipped to playable area, metre-rounded with holes retained.'},
        'bridgesAndPlaces':{'snapshot':BBBIKE,'sha256':BBBIKE_HASH,'originalSourceFeatureOrdinal':evidence,'method':'Bridge centre paths are sampled from mapped deck outlines. Jamsu sits on the lower level of Banpo. Bridge labels are positioned on the Han River crossing. Other landmark anchors lie on a named station point or building/site geometry.'},
        'locationReferences':[BANPO_PARK,JAMWON_PARK,'https://www.coex.co.kr/guide/directions/','https://www.sac.or.kr/site/main/content/guide','https://www.museum.go.kr/MUSEUM/contents/M0106010000.do?menuId=subway-map']}
    (SEOUL/'driving-map-sources.json').write_text(json.dumps(attribution,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbbike',type=Path,required=True)
    parser.add_argument('--cache',type=Path,required=True)
    args=parser.parse_args()
    generate(args.bbbike,args.cache)