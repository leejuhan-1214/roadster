import * as THREE from 'three';
import {createVehicle} from './vehicle.js';
import {createHypothesisCatalogEntry} from './parts-catalog.js';
import {ROCKET_PARAMS,ROCKET_THRUSTERS} from './rocket-layout.js?v=20261114-rocket1';

// Independently authored reference model, not Tesla CAD. The visible design is
// based on Tesla's October 2026 presentation and Q3 2026 update, pages 11–12.
// Unpublished dimensions and internal packaging remain illustrative. All ten
// visible outlets share their mount/direction data with the actual solver.
const SOURCE='https://assets-ir.tesla.com/tesla-contents/IR/TSLA-Q3-2026-Update.pdf';
const UP=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
const WHEEL_IDS=['wheel-fl','wheel-fr','wheel-rl','wheel-rr'];

export function createRoadster2026Vehicle(){
  const vehicle=createVehicle(),{root,parts}=vehicle;
  root.name='Roadster 2026 Rocket · independently authored reference';
  root.userData.source='Tesla October 2026 reveal / Tesla Q3 2026 update';
  root.userData.visualOnly=true;
  root.userData.alignment='Reference silhouette; dimensions and internal packaging are simulation assumptions, not OEM CAD.';
  const oldFans=vehicle.fans,compressor=vehicle.compressor;
  for(const fan of oldFans)fan.removeFromParent();
  compressor.removeFromParent();
  for(const id of ['body','cabin','wing','tank','thrusters']){
    const old=parts.get(id);old.removeFromParent();parts.delete(id);
    old.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
  }
  const paint=new THREE.MeshPhysicalMaterial({color:0xe9edf0,metalness:.55,roughness:.22,clearcoat:1,clearcoatRoughness:.12,side:THREE.DoubleSide});
  const accent=paint.clone();accent.roughness=.29;
  const carbon=new THREE.MeshStandardMaterial({color:0x141b22,metalness:.42,roughness:.4,side:THREE.DoubleSide});
  const black=new THREE.MeshStandardMaterial({color:0x060a0e,roughness:.42});
  const metal=new THREE.MeshStandardMaterial({color:0x697580,metalness:.85,roughness:.28});
  const paleMetal=new THREE.MeshStandardMaterial({color:0xaab4bb,metalness:.9,roughness:.2});
  const interior=new THREE.MeshStandardMaterial({color:0x171b20,roughness:.88});
  const glass=new THREE.MeshPhysicalMaterial({color:0x10212a,metalness:.26,roughness:.075,clearcoat:1,transparent:true,opacity:.94,side:THREE.DoubleSide,depthWrite:false});
  const red=new THREE.MeshStandardMaterial({color:0xff2840,emissive:0xff1430,emissiveIntensity:2.8,toneMapped:false});
  const white=new THREE.MeshStandardMaterial({color:0xe5f7ff,emissive:0xccefff,emissiveIntensity:2.5,toneMapped:false});
  vehicle.paintMaterials=[paint,accent];
  const catalog=[],detailParts=new Map();
  function group(id,parent=root){const g=new THREE.Group();g.name=id;g.userData.partId=id;g.userData.basePosition=g.position.clone();parent.add(g);return g;}
  function main(id){const g=group(id);parts.set(id,g);return g;}
  function part(id,title,category,parent){const g=group(id,parent);g.userData.sourceObjectKey=id;detailParts.set(id,g);catalog.push({id,title,category,categoryLabel:({exterior:'차체 외장',lighting:'등화 장치',glazing:'캐노피·유리',interior:'운전석'})[category]||'공개 형상 참고',kind:'model',lessonId:category==='wheels'?'wheels':category==='glazing'||category==='interior'?'cabin':'body',description:'공개 영상·사진의 외형을 참고해 작성한 모형입니다. 치수·내부 구조는 시뮬레이션 가정이며 실제 Tesla CAD가 아닙니다.',sourceName:title,sourceObjectName:id,sourceObjectKey:id,sourceAncestry:['Roadster2026Reference'],materialNames:[],sourceUrl:SOURCE,geometryNote:'독립 제작한 공개 형상 참고 모델 · 제조사 CAD 아님'});return g;}
  function mesh(parent,geometry,material,pos=[0,0,0],rotation=[0,0,0]){const m=new THREE.Mesh(geometry,material);m.position.fromArray(pos);m.rotation.set(...rotation);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const box=(p,s,m,v,r)=>mesh(p,new THREE.BoxGeometry(...s),m,v,r);
  function quad(p,pts,m){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return mesh(p,g,m);}
  function tube(p,pts,r,m){return mesh(p,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v))),Math.max(10,pts.length*4),r,6,false),m);}
  function beam(p,a,b,r,m){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va),o=mesh(p,new THREE.CylinderGeometry(r,r,delta.length(),12),m);o.position.copy(va.add(vb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(UP,delta.normalize());return o;}
  function slab(p,stations,m){
    const positions=[],indices=[];
    // x / half width / center height / shoulder height. A shallow faceted hood
    // gives real highlights without a solid slab occluding the wheel wells.
    for(const [x,w,y,e]of stations)positions.push(x,e,-w,x,y,-w*.58,x,y,w*.58,x,e,w);
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<3;j++){const a=i*4+j;indices.push(a,a+1,a+4,a+1,a+5,a+4);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return mesh(p,g,m);
  }
  const body=main('body'),cabin=main('cabin');
  const nose=part('reference-nose','전면 쐐기형 범퍼·스플리터','exterior',body);
  slab(nose,[[1.82,.99,.18,.12],[2.16,.96,.085,.055],[2.29,.88,.025,-.025]],paint);
  // The reveal has a broad dark front aperture, a thin straight light signature
  // and compact lamp modules at its ends rather than the 2017 curved eyes.
  quad(nose,[[2.29,.025,-.88],[2.29,.025,.88],[2.22,-.24,.82],[2.22,-.24,-.82]],paint);
  box(nose,[.024,.165,1.38],black,[2.299,-.128,0]);
  box(nose,[.28,.032,1.88],carbon,[2.19,-.315,0]);
  for(const side of [-1,1])quad(nose,[[2.305,-.045,side*.71],[2.31,-.24,side*.68],[2.23,-.245,side*.88],[2.285,-.04,side*.88]],accent);
  const lights=part('reference-front-lights','매립형 전조등·전면 라이트 바','lighting',body);
  box(lights,[.018,.017,1.68],white,[2.307,.018,0]);
  for(const side of [-1,1]){
    box(lights,[.035,.071,.25],black,[2.277,.057,side*.69]);
    for(let i=0;i<3;i++)box(lights,[.038,.031,.048],white,[2.299,.058,side*(.619+i*.061)]);
  }
  const hood=part('reference-hood','낮은 보닛·중앙 패널','exterior',body);
  slab(hood,[[.77,.79,.255,.21],[1.22,.86,.225,.20],[1.82,.83,.18,.14]],paint);
  for(const side of [-1,1])tube(hood,[[.84,.251,side*.61],[1.30,.223,side*.65],[1.78,.184,side*.64]],.004,accent);

  for(const side of [-1,1]){
    const sideName=side<0?'left':'right';
    const panel=part('reference-side-'+sideName,(side<0?'왼쪽':'오른쪽')+' 도어·측면 패널','exterior',body);
    // Side skin follows the tire openings instead of covering full circular tires.
    const outline=[[-2.19,-.035],[-2.02,.15],[-1.67,.30],[-1.17,.30],[-.66,.255],[.64,.225],[1.17,.26],[1.65,.24],[2.14,.07],[2.24,-.28],[1.81,-.34]];
    for(let i=0;i<=28;i++){const t=i/28*Math.PI;outline.push([1.4+.41*Math.cos(t),-.24+.41*Math.sin(t)]);}
    outline.push([.96,-.34],[-.96,-.34]);
    for(let i=0;i<=28;i++){const t=i/28*Math.PI;outline.push([-1.4+.41*Math.cos(t),-.24+.41*Math.sin(t)]);}
    outline.push([-1.83,-.34],[-2.18,-.28]);
    const shape=new THREE.Shape(outline.map(p=>new THREE.Vector2(...p))),g=new THREE.ExtrudeGeometry(shape,{depth:.028,bevelEnabled:false});
    const vertex=g.attributes.position;
    for(let i=0;i<vertex.count;i++){
      const x=vertex.getX(i),endTaper=.12*Math.max(0,Math.min(1,(Math.abs(x)-1.62)/.62));
      vertex.setZ(i,side*(1.023-endTaper-.028+vertex.getZ(i)));
    }
    vertex.needsUpdate=true;g.computeVertexNormals();mesh(panel,g,paint);
    box(panel,[1.87,.062,.10],carbon,[0,-.335,side*1.005]);
    tube(panel,[[-.77,.25,side*1.027],[-.76,-.24,side*1.027],[.78,-.24,side*1.027],[.87,.215,side*1.027]],.0045,black);
    box(panel,[.19,.016,.011],black,[-.50,.18,side*1.03]);
    quad(panel,[[-.83,.10,side*1.031],[-.98,.22,side*1.031],[-1.12,.13,side*1.031],[-1.04,-.06,side*1.031]],black);
    // Close the shoulder between the inset canopy and outer door skin. Without
    // these panels the bright ground is visible as triangular beltline gaps.
    const shoulder=[[-1.11,.294706],[-.66,.255],[.64,.225],[.98,.247453]];
    const edge=x=>{const t=(x+1.11)/2.09;return [x,.27-.03*t,side*(.815-.045*t)];};
    for(let i=0;i<shoulder.length-1;i++){
      const [a,ay]=shoulder[i],[b,by]=shoulder[i+1];
      quad(panel,[edge(a),edge(b),[b,by,side*1.023],[a,ay,side*1.023]],paint).name='closed window beltline shoulder';
    }
    for(const axle of [-1.4,1.4]){
      const fender=part('reference-fender-'+sideName+'-'+(axle>0?'front':'rear'),(side<0?'왼쪽 ':'오른쪽 ')+(axle>0?'앞':'뒤')+' 펜더','exterior',body);
      const points=[];for(let i=0;i<=32;i++){const t=i/32*Math.PI;points.push([axle+.417*Math.cos(t),-.24+.417*Math.sin(t),side*1.035]);}
      tube(fender,points,.016,carbon);
      const y=axle>0?.27:.33;
      quad(fender,[[axle-.43,y-.055,side*.79],[axle-.43,y-.10,side*1.012],[axle,y-.06,side*1.012],[axle,y,side*.79]],paint);
      quad(fender,[[axle,y,side*.79],[axle,y-.06,side*1.012],[axle+.43,y-.11,side*.985],[axle+.43,y-.06,side*.78]],paint);
    }
  }
  const deck=part('reference-rear-deck','후면 데크·측면 버트레스','exterior',body);
  slab(deck,[[-2.20,.90,.19,.14],[-1.82,.99,.29,.24],[-1.16,.89,.31,.27]],paint);
  for(const side of [-1,1]){
    quad(deck,[[-1.83,.27,side*.79],[-.70,.64,side*.58],[-1.11,.325,side*.82],[-1.73,.25,side*.99]],paint);
    tube(deck,[[-1.72,.267,side*.87],[-1.25,.32,side*.76],[-.70,.644,side*.58]],.006,accent);
  }
  const rear=part('reference-rear-fascia','후면 라이트 바·디퓨저','exterior',body);
  // Four rear outlets sit below the plate, above the bottom diffuser fins.
  box(rear,[.042,.135,1.82],paint,[-2.225,.09,0]);
  box(rear,[.045,.31,1.83],black,[-2.22,-.155,0]);
  box(rear,[.22,.025,1.94],carbon,[-2.14,-.35,0]);
  for(const z of [-.84,-.68,0,.68,.84])box(rear,[.35,.09,.016],carbon,[-2.12,-.315,z]);
  const taillight=part('reference-tail-light','전폭 후미등','lighting',body);
  box(taillight,[.027,.021,1.83],red,[-2.255,.14,0]);
  box(taillight,[.018,.068,.28],paleMetal,[-2.25,.045,0]);
  // A small, integrated trailing lip replaces the old tall generic rear wing.
  const wing=main('wing');slab(wing,[[-2.245,.94,.221,.21],[-2.06,.94,.216,.205]],accent);vehicle.wing=wing;

  const canopy=part('reference-canopy','일체형 다크 캐노피·유리','glazing',cabin);
  quad(canopy,[[1.015,.245,-.74],[1.015,.245,.74],[.20,.64,.575],[.20,.64,-.575]],glass);
  quad(canopy,[[-.73,.65,-.585],[-.73,.65,.585],[-1.28,.305,.75],[-1.28,.305,-.75]],glass);
  for(const side of [-1,1])quad(canopy,[[.98,.24,side*.77],[.20,.64,side*.575],[-.73,.65,side*.585],[-1.11,.27,side*.815]],glass);
  const roof=part('reference-roof','평탄한 루프·캐노피 프레임','exterior',cabin);
  quad(roof,[[.20,.651,-.585],[.20,.651,.585],[-.73,.66,.595],[-.73,.66,-.595]],carbon);
  for(const side of [-1,1]){
    const frame=[[1.02,.24,side*.75],[.20,.655,side*.588],[-.73,.665,side*.598],[-1.28,.306,side*.752]];
    for(let i=0;i<frame.length-1;i++)beam(roof,frame[i],frame[i+1],.014,paint);
  }
  tube(roof,[[1.02,.246,-.74],[1.02,.246,.74]],.011,black);
  const cockpit=part('reference-cockpit','단일 운전석·요크·계기 패널','interior',cabin);
  box(cockpit,[.52,.09,.43],interior,[-.12,-.005,-.37]);
  box(cockpit,[.11,.48,.40],interior,[-.40,.235,-.37],[0,0,-.17]);
  box(cockpit,[.12,.145,.25],interior,[-.445,.54,-.37],[0,0,-.17]);
  for(const z of [-.58,-.16])box(cockpit,[.47,.12,.065],carbon,[-.16,.07,z]);
  box(cockpit,[.22,.14,1.37],carbon,[.67,.22,0]);
  const display=new THREE.MeshBasicMaterial({color:0x355465});
  box(cockpit,[.027,.11,.28],display,[.546,.295,-.37],[0,0,-.12]);
  beam(cockpit,[.53,.24,-.37],[.30,.24,-.37],.023,metal);
  tube(cockpit,[[.29,.32,-.54],[.285,.21,-.53],[.285,.18,-.21],[.29,.32,-.20]],.021,black);
  box(cockpit,[.033,.065,.12],carbon,[.287,.245,-.37]);

  const tank=main('tank');vehicle.tank=tank;
  const vessel=new THREE.MeshStandardMaterial({color:0x39464f,metalness:.3,roughness:.49});
  // Two COPVs as announced. This is a packaging diagram, not volume-exact CAD.
  mesh(tank,new THREE.CapsuleGeometry(.25,1.04,8,24),vessel,[-.08,.18,.36],[0,0,Math.PI/2]).name='passenger-side COPV schematic';
  mesh(tank,new THREE.CapsuleGeometry(.21,.80,8,24),vessel,[-1.26,.12,0],[Math.PI/2,0,0]).name='transverse rear COPV schematic';
  for(const x of [-.49,.33])mesh(tank,new THREE.TorusGeometry(.255,.015,6,24),metal,[x,.18,.36],[0,Math.PI/2,0]);
  for(const z of [-.28,.28])mesh(tank,new THREE.TorusGeometry(.215,.015,6,24),metal,[-1.26,.12,z]);
  box(tank,[.20,.11,.18],metal,[.76,.14,.36]);
  tube(tank,[[.77,.14,.36],[.91,.14,.36],[.91,-.17,.48],[-1.27,-.17,.48],[-1.27,.12,.59]],.016,paleMetal);
  const lamp=mesh(tank,new THREE.SphereGeometry(.02,8,6),new THREE.MeshStandardMaterial({color:0x78ccd3,emissive:0x246e7a}),[.78,.205,.36]);tank.userData.supplyLamp=lamp;
  compressor.position.set(1.17,-.10,0);compressor.scale.setScalar(.65);tank.add(compressor);

  const rig=main('thrusters'),jetMounts=[],gimbalNozzles=[],valveIndicators=[],covers=[];
  for(let i=0;i<ROCKET_THRUSTERS.length;i++){
    const data=ROCKET_THRUSTERS[i],position=new THREE.Vector3(...data.position),direction=new THREE.Vector3(...data.direction),mount=group('rocket-mount-'+i,rig);
    mount.position.copy(position);mount.userData.nozzleIndex=i;
    const radius=i<4?.082:i<8?.079:.039,depth=i<4?.030:i<8?.18:.19;
    // Axis +Y denotes the thrust direction; the visible mouth faces opposite.
    const pivot=group('rocket-nozzle-'+i,mount);pivot.quaternion.setFromUnitVectors(UP,direction);
    mesh(pivot,new THREE.CylinderGeometry(radius*.54,radius,depth,24,1,true),metal,[0,-depth*.25,0]);
    mesh(pivot,new THREE.TorusGeometry(radius,.007,6,32),paleMetal,[0,-depth*.75,0],[Math.PI/2,0,0]);
    mesh(pivot,new THREE.CircleGeometry(radius*.88,24),black,[0,-depth*.76,0],[Math.PI/2,0,0]);
    pivot.userData.exitOffset=new THREE.Vector3(0,-depth*.75,0);
    if(i<4)gimbalNozzles.push(pivot);
    const exit=position.clone().addScaledVector(direction,-depth*.75);
    jetMounts.push({pos:exit,dir:direction.clone()});
    const status=mesh(mount,new THREE.BoxGeometry(.028,.02,.025),new THREE.MeshStandardMaterial({color:0x52777d,emissive:0x143440}),[0,.045,0]);valveIndicators.push(status);
    // Concealed corner ports have body-coloured flaps. The four aft circular
    // outlets remain visible as in the public reveal, inside the dark diffuser.
    if(i<4||i>=8){
      const size=i<4?.205:.11,frame=group('rocket-flush-cover-'+i,rig);
      frame.position.copy(exit).addScaledVector(direction,-.009);frame.quaternion.setFromUnitVectors(Z,direction.clone().negate());
      const hinge=group('rocket-cover-hinge-'+i,frame);hinge.position.x=-size/2;
      box(hinge,[size,size,.009],i<4?carbon:paint,[size/2,0,0]);
      covers.push({frame,hinge,index:i,opening:0});
    }
  }
  for(let i=0;i<oldFans.length;i++){const fan=oldFans[i];fan.position.set(-1.98,-.28,(i-1.5)*.32);fan.scale.setScalar(.58);rig.add(fan);}
  vehicle.fans=oldFans;vehicle.jetMounts=jetMounts;vehicle.gimbalNozzles=gimbalNozzles;vehicle.valveIndicators=valveIndicators;vehicle.nozzleCovers=covers;
  vehicle.fixedNozzleLayout=true;
  vehicle.nozzleFit={source:'shared rocket-layout.js',layoutProfile:'rocket2026'};
  // Retained wheel geometry is detailed and has a separate spin group/caliper.
  for(let i=0;i<vehicle.wheels.length;i++){
    const wheel=vehicle.wheels[i];wheel.position.y=-.24;wheel.userData.basePosition=wheel.position.clone();
    const id=WHEEL_IDS[i];detailParts.set(id,wheel);catalog.push({id,title:['앞 왼쪽 바퀴','앞 오른쪽 바퀴','뒤 왼쪽 바퀴','뒤 오른쪽 바퀴'][i],category:'wheels',categoryLabel:'바퀴·브레이크',kind:'model',lessonId:'wheels',description:'독립 제작한 회전 휠·타이어·고정 캘리퍼 형상입니다.',sourceName:id,sourceObjectName:id,sourceObjectKey:id,sourceAncestry:['Roadster2026Reference'],materialNames:[],sourceUrl:SOURCE,geometryNote:'공개 형상 참고·휠 치수 가정'});
  }
  for(const id of ['tank','battery','suspension','thrusters','wing','drive-front','drive-rear-left','drive-rear-right','power-electronics']){
    const p=parts.get(id);if(!p)continue;detailParts.set(id,p);const entry=createHypothesisCatalogEntry(id);
    if(id==='tank'){entry.title='2개 COPV·대기 압축기';entry.description='공개 발표의 두 탱크·합계 600 L 구조를 참고한 기능 도식입니다. 용기 형상·치수·패키징은 가정이며 용적에 맞춘 CAD가 아닙니다.';}
    if(id==='thrusters'){entry.title='후방 4개·하부 4개·측면 2개 분사구';entry.description='새 공개 배치에 맞춘 10개 분사구입니다. 후방 4개는 디퓨저 안에 한 줄로 배치합니다. 상세 치수·하부/측면 좌표·노즐 단면적은 모델 가정이며 물리 계산과 같은 좌표를 사용합니다.';}
    catalog.push(entry);
  }
  vehicle.detailParts=detailParts;vehicle.catalog=catalog;
  vehicle.geometryParams={...ROCKET_PARAMS,wheelRadius:.36,wheelbase:2.8,trackWidth:1.88,bodyLength:4.62,bodyWidth:2.10,bodyHeight:1.03,bodyCenterY:.155,inertiaRoll:900,inertiaYaw:3400,inertiaPitch:3500};
  vehicle.bounds={length:4.62,width:2.10,height:1.27};
  vehicle.internalParts=['suspension','battery','drive-front','drive-rear-left','drive-rear-right','power-electronics'].map(id=>parts.get(id));
  for(const p of vehicle.internalParts)p.visible=false;
  vehicle.actualRoadster=false;vehicle.referenceRoadster=true;vehicle.sourceMeshCount=0;vehicle.sourceObjectCount=catalog.filter(e=>e.kind==='model').length;
  vehicle.assetInfo={title:'Roadster 2026 Rocket · 공개 형상 참고',author:'프로젝트 독립 제작',license:'project-authored',yearScope:'2026 공개 차량 참고 · OEM CAD 아님',alignment:root.userData.alignment,objectCount:vehicle.sourceObjectCount};
  root.traverse(o=>{if(!o.isMesh)return;let p=o.parent;while(p&&!p.userData.partId)p=p.parent;if(p)o.userData.partId=p.userData.partId;});
  root.updateMatrixWorld(true);
  return vehicle;
}
