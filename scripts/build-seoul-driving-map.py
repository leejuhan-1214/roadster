"""Build the Seoul driving map from the simulator's mapped geometry (offline display).

Build tools: python -m pip install shapely==2.1.2 mapbox-vector-tile==2.2.0
Usage: python scripts/build-seoul-driving-map.py --bbbike Seoul.osm.geojson.xz --cache map-tiles
The specific input tiles and extract checksums are recorded in driving-map-sources.json.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import json
import lzma
import math
from pathlib import Path
from urllib.request import Request, urlopen

import mapbox_vector_tile
from mapbox_vector_tile.Mapbox import vector_tile_pb2
import numpy as np
from shapely import line_merge, set_precision, union_all
from shapely.geometry import LineString, Point, Polygon, box, shape, mapping
from shapely.ops import polygonize, transform, unary_union
from shapely.strtree import STRtree

ASSETS = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
CITY = ASSETS / 'city'
SEOUL = CITY / 'seoul'
MANIFEST = json.loads((SEOUL / 'manifest.json').read_text('utf-8'))
ORIGIN_LAT, ORIGIN_LON = MANIFEST['origin']
METRES_LON = 111320 * math.cos(math.radians(ORIGIN_LAT))
DETAIL_BOUNDS = {'minX':-5120,'maxX':5120,'minZ':-5120,'maxZ':5120}
DETAIL = box(-5120,-5120,5120,5120)
BOUNDS = {'minX':-28672,'maxX':16384,'minZ':-24576,'maxZ':12288}
REGION = box(BOUNDS['minX'], BOUNDS['minZ'], BOUNDS['maxX'], BOUNDS['maxZ'])
BRIDGE_IDS = dict(zip(['동작대교','반포대교','잠수교','한남대교','동호대교','성수대교','영동대교','청담대교'],
                       ['dongjak','banpo','jamsu','hannam','dongho','seongsu','yeongdong','cheongdam']))
BRIDGE_IDS.update(dict(zip(
    '김포대교 행주대교 방화대교 마곡대교 가양대교 월드컵대교 성산대교 양화대교 당산철교 서강대교 마포대교 원효대교 한강철교 한강대교 잠실대교 잠실철교 올림픽대교 천호대교 광진교 구리암사대교 고덕토평대교 강동대교'.split(),
    'gimpo haengju banghwa magok gayang worldcup seongsan yanghwa dangsan seogang mapo wonhyo hangang-rail hangang jamsil jamsil-rail olympic cheonho gwangjin guri-amsa godeok-topyeong gangdong'.split())))
# Feature ordinals disambiguate nearby stations, buildings and similarly named
# businesses in the SHA-pinned extract. The build also checks their source names.
REGIONAL_PLACES = {
    155962:('lotte-tower','롯데월드타워','롯데월드타워','architecture',98),
    280200:('olympic-park','올림픽공원','올림픽공원','park',70),
    280835:('worldcup-stadium','서울월드컵경기장','서울월드컵경기장','culture',89),
    280985:('gyeongbokgung','근정전','경복궁 근정전','culture',94),
    281999:('city-hall','서울특별시청','서울시청','architecture',91),
    312298:('national-assembly','국회의사당','국회의사당','architecture',86),
    332777:('heunginjimun','흥인지문','흥인지문','culture',55),
    374119:('changdeokgung','인정전','창덕궁 인정전','culture',61),
    374401:('dobong-office','도봉구청','도봉구청','architecture',74),
    374415:('nowon-office','노원구청','노원구청','architecture',70),
    430497:('botanic-park','서울식물원','서울식물원','park',82),
    519948:('gimpo-airport','김포국제공항','김포국제공항','transport',99),
    610296:('ddp','동대문디자인플라자','동대문디자인플라자','architecture',83),
    662619:('yeouido-park','여의도공원','여의도공원','park',88),
    1187946:('seoul-forest','서울숲','서울숲','park',74),
    1368204:('sungnyemun','숭례문','숭례문','culture',60),
}
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


def polygon_rings(poly):
    # Independent vertex rounding can make two near-touching banks cross.
    # Snap the surface topology as a whole to the atlas's one-metre grid.
    for part in members(set_precision(poly,1),'Polygon'):
        if part.area>=1:
            yield part


def regional_layers(cache):
    waters, roads, development, sources = [], [], [], []
    zoom, count = 12, 2**12
    south = ORIGIN_LAT-BOUNDS['maxZ']/111320
    north = ORIGIN_LAT-BOUNDS['minZ']/111320
    west = ORIGIN_LON+BOUNDS['minX']/METRES_LON
    east = ORIGIN_LON+BOUNDS['maxX']/METRES_LON
    tx = lambda lon: math.floor((lon + 180) / 360 * count)
    ty = lambda lat: math.floor((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*count)
    cache = cache / f'z{zoom}'
    cache.mkdir(parents=True, exist_ok=True)
    outer = REGION.difference(DETAIL)
    for x in range(tx(west), tx(east)+1):
        for y in range(ty(north), ty(south)+1):
            url = f'{PLANET}/{zoom}/{x}/{y}.pbf'
            file = cache / f'{x}-{y}.pbf'
            if not file.exists():
                file.write_bytes(urlopen(Request(url,headers={'User-Agent':'RoadsterLandingLab map build'}),timeout=45).read())
            raw = file.read_bytes()
            sources.append({'url':url,'sha256':hashlib.sha256(raw).hexdigest()})
            packet = vector_tile_pb2.tile()
            packet.ParseFromString(gzip.decompress(raw) if raw.startswith(b'\x1f\x8b') else raw)
            selected = vector_tile_pb2.tile()
            selected.layers.extend(l for l in packet.layers if l.name in ('water','transportation','landuse'))
            decoded = mapbox_vector_tile.decode(selected.SerializeToString(), default_options={'y_coord_down':True})
            def tile_to_world(u, v):
                lon = (x + np.asarray(u)/extent)/count*360-180
                lat = np.degrees(np.arctan(np.sinh(math.pi*(1-2*(y+np.asarray(v)/extent)/count))))
                return project(lon,lat)
            for key,layer in decoded.items():
                extent = layer.get('extent',4096)
                tile_rect = box(0,0,extent,extent)
                for feature in layer['features']:
                    props = feature['properties']
                    kind = props.get('class')
                    if key=='transportation' and (kind not in ('motorway','trunk','primary','secondary','tertiary') or props.get('brunnel')=='tunnel'):continue
                    if key=='landuse' and kind not in ('residential','commercial','retail','industrial'):continue
                    local = shape(feature['geometry'])
                    if not local.is_valid:local=local.buffer(0)
                    # Remove each tile's rendering buffer before joining features,
                    # so neighboring tiles do not duplicate the same road or bank.
                    geo = transform(tile_to_world,local.intersection(tile_rect))
                    if key=='water':
                        waters.extend(members(geo,'Polygon'))
                    elif key=='landuse':
                        development.extend(members(geo.intersection(outer),'Polygon'))
                    else:
                        for line in members(geo.intersection(outer),'LineString'):
                            points=vertices(line.simplify(5).coords)
                            if len(points)>=2:
                                roads.append({'kind':kind+'_link' if props.get('ramp') else kind,'points':points})
    # Tiny different floating-point rounding on one shared boundary should
    # not split a continuous river. Work at map scale (one-centimetre grid).
    geometry = union_all(waters,grid_size=.01).intersection(REGION)
    wet = sorted((p for p in members(geometry,'Polygon') if p.area>=1800),key=lambda p:-p.area)
    return wet, roads, development, sources


def regional_blocks(roads,development):
    # These are generalized built-up blocks. Require a closed real-road face
    # and a representative point in mapped residential/commercial land use.
    areas = STRtree(development)
    lines = [LineString(r['points']) for r in roads]
    result = []
    for p in polygonize(union_all(lines,grid_size=1)):
        if not 10000<=p.area<=1250000 or p.interiors:continue
        if not len(areas.query(p.representative_point(),predicate='within')):continue
        for inner in polygon_rings(p.buffer(-4,join_style='mitre').simplify(5)):
            if inner.area>=7500:result.append(vertices(inner.exterior.coords))
    return result


def compact_roads(roads):
    # Tile seams and changes to non-visual OSM attributes can split a
    # continuous line into dozens of tiny features. Merge equal-style end
    # points, retaining branches at real junctions and leaving bridges intact.
    from shapely.geometry import MultiLineString
    by_kind = defaultdict(list)
    for r in roads:
        by_kind[r['kind']].append(r['points'])
    merged = []
    for kind,lines in sorted(by_kind.items()):
        for part in members(line_merge(MultiLineString(lines)),'LineString'):
            points = vertices(part.simplify(3).coords)
            if len(points)>=2:merged.append({'kind':kind,'points':points})
    return merged


def source_features(extract):
    with extract.open('rb') as raw:
        digest = hashlib.file_digest(raw, 'sha256').hexdigest()
    if digest!=BBBIKE_HASH:
        raise ValueError('Unexpected source snapshot. Verify the new extract before updating its checksum.')
    names = set(BRIDGE_IDS) | {'세빛섬','강남'}
    encoded = [s.encode('utf-8') for s in names]
    decks, points, evidence, places = {}, {}, {}, []
    with lzma.open(extract,'rb') as lines:
        for ordinal,line in enumerate(lines):
            if ordinal not in REGIONAL_PLACES and b'Q69134' not in line and not any(term in line for term in encoded):
                continue
            f = json.loads(line.rstrip(b',\r\n'))
            t, geom = f['properties'], f['geometry']
            name = t.get('name')
            if ordinal in REGIONAL_PLACES or (t.get('wikidata')=='Q69134' and geom['type'] in ('Polygon','MultiPolygon')):
                ident,source_name,label,kind,priority = REGIONAL_PLACES.get(ordinal,('namsan-tower',name,'남산서울타워','architecture',93))
                if name!=source_name:raise ValueError(f'Expected {source_name}, got {name}')
                point = transform(project,shape(geom)).representative_point()
                if not REGION.covers(point):raise ValueError(f'Place outside coverage: {name}')
                if not any(site['id']==ident for site in places):
                    source = t.get('website','')
                    if ident=='namsan-tower':source='https://english.visitseoul.net/City-Hall-Area/Namsan-Seoul-Tower/ENP000036'
                    places.append({**landmark(ident,label,kind,point,source if source.startswith('https://') else None),'priority':priority})
                    evidence[label]=ordinal
                continue
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
        raise ValueError(f'Missing source feature(s): {set(BRIDGE_IDS)-set(decks)}, {set(("세빛섬","강남"))-set(points)}')
    if len(places)<len(REGIONAL_PLACES):raise ValueError('A regional site could not be resolved.')
    return decks, points, places, evidence


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
        line = LineString(r['points']).intersection(DETAIL)
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
        for inner in polygon_rings(p.buffer(-2.5,join_style='mitre').simplify(3)):
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


def generate(extract, cache, water_output):
    wet,regional_roads,development,sources=regional_layers(cache)
    if water_output:
        water_output.parent.mkdir(parents=True,exist_ok=True)
        features=[{'type':'Feature','properties':{},'geometry':mapping(p.simplify(1.5))} for p in wet]
        water_output.write_text(json.dumps({'type':'FeatureCollection','coordinates':'projected simulator x,z metres','features':features},separators=(',',':'))+'\n',encoding='utf8')
    print(f'Regional vector geometry: {len(wet)} water bodies, {len(regional_roads)} major roads, {len(development)} mapped land-use faces',flush=True)
    river=wet[0]
    if river.area<4_000_000: raise ValueError('The Han River surface is incomplete.')
    decks,points,places,evidence=source_features(extract)
    roads,blocks,buildings=road_and_city_blocks()
    blocks.extend(regional_blocks(regional_roads,development))
    roads.extend(compact_roads(regional_roads))
    bridges=[]
    for name,deck in decks.items():
        if not deck.intersects(REGION):continue
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
    for west,east in [(-24300,-23000),(-17500,-16000),(-10700,-9400),(-3600,-3290),(-1300,-650),(1600,2400),(8000,8600),(13200,14300)]:
        site = river.intersection(box(west,BOUNDS['minZ'],east,BOUNDS['maxZ']))
        p = max(members(site,'Polygon'),key=lambda g:g.area).representative_point()
        river_labels.append(vertices(p.coords)[0])
    water, islands = [], []
    surfaces=sorted((q for p in wet for q in polygon_rings(p.simplify(2))),key=lambda q:-q.area)
    for clean in surfaces:
        water.append(vertices(clean.exterior.coords))
        islands.extend(vertices(r.coords) for r in clean.interiors if Polygon(r).area>=150)
    core_places=landmarks(buildings,points)
    for site in core_places:
        site['priority']={'gangnam':100,'coex':76,'arts-center':79}.get(site['id'],40)
    result={'bounds':BOUNDS,'detailBounds':DETAIL_BOUNDS,'water':water,'islands':islands,'bridges':bridges,'roads':roads,'blocks':blocks,
            'landmarks':core_places+places,'riverLabels':river_labels,'riverLabel':river_labels[4]}
    print({key:len(value) for key,value in result.items() if isinstance(value,list)})
    (SEOUL/'driving-map.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
    attribution={'attribution':'OpenFreeMap © OpenMapTiles · Map data © OpenStreetMap contributors','license':'ODbL-1.0',
        'licenseUrl':'https://www.openstreetmap.org/copyright','openFreeMap':'https://openfreemap.org/','openMapTiles':'https://openmaptiles.org/',
        'projection':{'worldOriginLatLon':MANIFEST['origin'],'eastMetresPerDegree':METRES_LON,'northMetresPerDegree':111320,'northIsNegativeZ':True},
        'bounds':BOUNDS,'detailBounds':DETAIL_BOUNDS,
        'roadsAndBlocks':{'source':'provenance.json','coreSource':'../provenance.json','method':'The central 10.24 km square preserves real street centrelines and road faces enclosing mapped buildings. The regional overview adds mapped motorway to tertiary streets and larger road faces enclosing residential, industrial or commercial land use. Local street detail outside the core streams with the driving scene. These generalized blocks are not cadastral parcels. Underground streets are omitted from the surface map.'},
        'water':{'layer':'OpenMapTiles water, transportation and landuse, zoom 12','schema':'https://openmaptiles.org/schema/','tiles':sources,'method':'Map tile buffers removed, shorelines dissolved and clipped to playable area, metre-rounded with holes retained.'},
        'bridgesAndPlaces':{'snapshot':BBBIKE,'sha256':BBBIKE_HASH,'originalSourceFeatureOrdinal':evidence,'method':'Bridge centre paths are sampled from mapped deck outlines. Jamsu sits on the lower level of Banpo. Bridge labels are positioned on the Han River crossing. Other landmark anchors lie on a named station point or building/site geometry.'},
        'locationReferences':[BANPO_PARK,JAMWON_PARK,'https://www.coex.co.kr/guide/directions/','https://www.sac.or.kr/site/main/content/guide','https://www.museum.go.kr/MUSEUM/contents/M0106010000.do?menuId=subway-map','https://english.seoul.go.kr/service/amusement/hangang/overview/','https://english.seoul.go.kr/yanghwadaegyo-bridge/','https://english.seoul.go.kr/wp-content/uploads/2026/03/seoulguidebook_eng.pdf','https://english.visitseoul.net/City-Hall-Area/Namsan-Seoul-Tower/ENP000036']}
    (SEOUL/'driving-map-sources.json').write_text(json.dumps(attribution,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbbike',type=Path,required=True)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--water-output',type=Path,help='Optional water FeatureCollection in simulator x,z metres for the 3D tile builder.')
    args=parser.parse_args()
    generate(args.bbbike,args.cache,args.water_output)
