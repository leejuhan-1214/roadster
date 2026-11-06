import * as THREE from 'three';

// An independently authored visual prototype, not Tesla engineering geometry.
// Coordinate convention: +X nose, +Y roof, +Z right side. Metres throughout.
export function createVehicle() {
  const root = new THREE.Group();
  root.name = 'Roadster educational visual prototype';
  const parts = new Map();
  const paintMaterials = [];
  const makePaint = (color, roughness = .25) => {
    const m = new THREE.MeshPhysicalMaterial({ color, metalness: .78, roughness, clearcoat: 1, clearcoatRoughness: .12 });
    paintMaterials.push(m); return m;
  };
  const paint = makePaint('#c92338');
  const edgePaint = makePaint('#b32032', .3);
  const dark = new THREE.MeshStandardMaterial({ color: '#11161d', metalness: .6, roughness: .35 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#151c22', metalness: .48, roughness: .37 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#101316', metalness: .04, roughness: .85 });
  const silver = new THREE.MeshStandardMaterial({ color: '#9ca8b5', metalness: .94, roughness: .23 });
  const satin = new THREE.MeshStandardMaterial({ color: '#536273', metalness: .85, roughness: .34 });
  const black = new THREE.MeshStandardMaterial({ color: '#070b10', metalness: .15, roughness: .42 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#10242d', metalness: .38, roughness: .12, clearcoat: 1, transparent: true, opacity: .85, side: THREE.DoubleSide });
  const light = new THREE.MeshStandardMaterial({ color: '#d7faff', emissive: '#a8e8ff', emissiveIntensity: 3, toneMapped: false });
  const redLight = new THREE.MeshStandardMaterial({ color: '#ff3853', emissive: '#ff1439', emissiveIntensity: 3.2, toneMapped: false });
  const blue = new THREE.MeshStandardMaterial({ color: '#76cbde', emissive: '#32c8dd', emissiveIntensity: .35, metalness: .7, roughness: .28 });
  const caliper = new THREE.MeshStandardMaterial({ color: '#df3d32', metalness: .5, roughness: .3 });
  const interior = new THREE.MeshStandardMaterial({ color: '#222b33', metalness: .08, roughness: .85 });

  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#333d45'; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? '#202b32' : '#40505b';
      ctx.fillRect(x, y, 7, 7);
      ctx.fillStyle = '#56616a'; ctx.fillRect(x + 1, y + 1, 1, 5);
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(9, 9); tex.colorSpace = THREE.SRGBColorSpace;
    carbon.map = tex;
  }

  function part(id, explode = [0, 0, 0], position = [0, 0, 0]) {
    const group = new THREE.Group(); group.name = id;
    group.userData.partId = id;
    group.position.fromArray(position);
    group.userData.basePosition = group.position.clone();
    group.userData.explodeOffset = new THREE.Vector3(...explode);
    parts.set(id, group); root.add(group); return group;
  }
  function put(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const m = new THREE.Mesh(geometry, material);
    m.position.fromArray(position); m.rotation.set(...rotation);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, size, material, position, rotation) { return put(parent, new THREE.BoxGeometry(...size), material, position, rotation); }
  function tube(parent, points, radius, material, radial = 7) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return put(parent, new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, radial, false), material);
  }
  function quad(parent, points, material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
    return put(parent, g, material);
  }
  function sectionHull(parent, sections, material) {
    // Six hard contours per longitudinal station, intentionally faceted.
    const positions = [], indices = [];
    for (const s of sections) {
      const [x, width, lower, belt, top, topWidth = width * .88] = s;
      positions.push(x, lower, -width, x, belt, -width, x, top, -topWidth,
                     x, top, topWidth, x, belt, width, x, lower, width);
    }
    for (let i = 0; i < sections.length - 1; i++) for (let j = 0; j < 6; j++) {
      const a = i * 6 + j, b = i * 6 + (j + 1) % 6, c = b + 6, d = a + 6;
      indices.push(a,b,d,b,c,d);
    }
    for (let i = 1; i < 5; i++) indices.push(0, i + 1, i);
    const o = (sections.length - 1) * 6;
    for (let i = 1; i < 5; i++) indices.push(o, o + i, o + i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices);
    const flat = g.toNonIndexed(); flat.computeVertexNormals(); g.dispose();
    return put(parent, flat, material);
  }
  function cylinderBetween(parent, a, b, radius, material, radial = 12) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va);
    const m = put(parent, new THREE.CylinderGeometry(radius, radius, d.length(), radial), material);
    m.position.copy(va.add(vb).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
  }

  const body = part('body', [0, .72, 0]);
  sectionHull(body, [
    [-2.25,.77,-.30,-.02,.13,.70],[-2.02,.99,-.30,.10,.22,.89],
    [-1.35,1.00,-.29,.14,.28,.85],[-.65,.91,-.30,.07,.20,.77],
    [.45,.92,-.29,.04,.16,.78],[1.38,1.00,-.28,.01,.15,.88],
    [2.02,.94,-.25,-.04,.06,.83],[2.32,.79,-.21,-.11,-.035,.76]
  ], paint);
  // Rising side facets and inset carbon sills visually thin the body.
  for (const side of [-1,1]) {
    quad(body, [[-1.08,-.11,side*.935],[.95,-.11,side*.965],[.82,-.28,side*.955],[-.85,-.29,side*.94]], edgePaint);
    box(body,[2.1,.065,.10], carbon,[-.02,-.31,side*1.005]);
    // Side intake inset, side blade and door seam.
    quad(body,[[-1.08,-.05,side*.993],[-.44,.015,side*.926],[-.63,-.22,side*.93],[-1.02,-.22,side*.995]],black);
    tube(body, [[-.65,.16,side*.814],[-.86,.02,side*.928],[-.72,-.20,side*.941],[.72,-.20,side*.948],[.83,.05,side*.91]], .006, dark);
    box(body,[.24,.023,.025], satin,[-.56,.125,side*.91]);
    // Fenders defined by thin arch trim; wheel geometry remains visible outboard.
    for (const axle of [-1.4,1.4]) {
      const pts=[]; for(let i=0;i<=28;i++) {
        const ang=Math.PI*.05 + i/28*Math.PI*.9;
        pts.push([axle+.395*Math.cos(ang),-.23+.395*Math.sin(ang),side*1.014]);
      }
      tube(body,pts,.022,dark);
    }
  }
  // Sharp black nose, lower splitter and a discontinuous signature LED.
  box(body,[.11,.135,1.46],black,[2.29,-.14,0]);
  box(body,[.30,.035,1.85],carbon,[2.20,-.285,0]);
  for(const side of [-1,1]) {
    tube(body,[[2.30,-.02,side*.73],[2.27,.015,side*.47],[2.23,.034,side*.22]],.013,light,6);
    box(body,[.045,.047,.23],light,[2.315,-.085,side*.57]);
    box(body,[.28,.085,.22],black,[1.97,-.15,side*.82]);
    tube(body,[[1.96,-.24,side*.95],[1.76,-.24,side*1.02]],.019,carbon);
    // Hood crease converges on nose.
    tube(body,[[.77,.18,side*.50],[1.49,.15,side*.55],[2.13,.046,side*.44]],.005,edgePaint);
    box(body,[.45,.018,.10],black,[1.22,.17,side*.58],[0,0,-.035]);
  }
  // Deep rear diffuser, twin cold-gas exhaust ports, all combustion-free.
  box(body,[.10,.26,1.74],black,[-2.24,-.115,0]);
  box(body,[.38,.045,1.97],carbon,[-2.12,-.32,0]);
  for(let i=-3;i<=3;i++) box(body,[.48,.13,.018],carbon,[-2.06,-.30,i*.23],[0,0,-.06]);
  tube(body,[[-2.272,.06,-.78],[-2.285,.09,-.45],[-2.289,.095,0],[-2.285,.09,.45],[-2.272,.06,.78]],.014,redLight);
  box(body,[.016,.10,.34],satin,[-2.30,-.08,0]);
  for(let i=0;i<5;i++) box(body,[.012,.01,.05],dark,[-2.31,-.08,(i-2)*.055]);

  const cabin = part('cabin',[0,1.6,0]);
  // All glass is authored as a single coherent wedge with narrow pillars.
  sectionHull(cabin,[[-1.16,.66,.20,.25,.31,.59],[-.64,.73,.18,.27,.65,.58],[.27,.69,.16,.27,.65,.55],[.99,.61,.14,.18,.23,.55]],glass);
  quad(cabin,[[-.63,.659,-.57],[.27,.659,-.54],[.27,.659,.54],[-.63,.659,.57]],carbon);
  for(const side of [-1,1]) {
    tube(cabin,[[-1.15,.29,side*.62],[-.63,.66,side*.59],[.27,.66,side*.56],[.99,.23,side*.56]],.023,dark);
    tube(cabin,[[-.08,.27,side*.72],[-.08,.65,side*.57]],.018,carbon);
    tube(cabin,[[.98,.23,side*.56],[.36,.20,side*.83]],.022,carbon);
    // Narrow racing mirrors with reflective outer plane.
    cylinderBetween(cabin,[.54,.25,side*.69],[.55,.21,side*1.01],.018,carbon);
    const mirror=box(cabin,[.21,.08,.14],paint,[.58,.24,side*1.04],[0,side*.13,0]);
    box(cabin,[.015,.055,.11],silver,[.475,.24,side*1.04]);
    const seat=new THREE.Group(); cabin.add(seat); seat.position.set(-.29,.16,side*.34);
    box(seat,[.47,.075,.37],interior,[.04,0,0]);
    box(seat,[.10,.40,.37],interior,[-.19,.19,0],[0,0,-.18]);
    box(seat,[.10,.13,.24],interior,[-.24,.44,0],[0,0,-.18]);
    tube(seat,[[-.18,.02,-.18],[-.21,.28,-.18],[-.24,.44,-.12]],.012,edgePaint);
    tube(seat,[[-.18,.02,.18],[-.21,.28,.18],[-.24,.44,.12]],.012,edgePaint);
  }
  box(cabin,[.22,.12,1.15],dark,[.53,.25,0]);
  box(cabin,[.035,.14,.22],blue,[.49,.32,-.05],[0,0,.18]);
  // Yoke on driver side (left = -Z).
  tube(cabin,[[.25,.30,-.48],[.24,.25,-.48],[.24,.24,-.23],[.25,.30,-.23]],.019,black);

  const wheels=[];
  const wheelData=[['wheel-fl',1.4,-.94],['wheel-fr',1.4,.94],['wheel-rl',-1.4,-.94],['wheel-rr',-1.4,.94]];
  for(const [id,x,z] of wheelData) {
    const side=Math.sign(z); const w=part(id,[x*.30,-.05,side*.95],[x,-.23,z]);
    const spin=new THREE.Group(); w.add(spin); w.userData.spinGroup=spin;
    const tire=put(spin,new THREE.CylinderGeometry(.36,.36,.25,48,1),rubber,[0,0,0],[Math.PI/2,0,0]);
    for(const zz of [-.126,.126]) put(spin,new THREE.TorusGeometry(.282,.064,9,48),rubber,[0,0,zz]);
    // Three fine circumferential tread channels and sparse transverse grooves.
    for(const zz of [-.07,0,.07]) put(spin,new THREE.TorusGeometry(.361,.005,4,64),black,[0,0,zz]);
    const faceZ=side*.137;
    put(spin,new THREE.CylinderGeometry(.269,.269,.022,48),satin,[0,0,faceZ],[Math.PI/2,0,0]);
    put(spin,new THREE.TorusGeometry(.26,.017,8,48),silver,[0,0,faceZ+side*.018]);
    const brakeDisc=put(w,new THREE.CylinderGeometry(.203,.203,.018,40),silver,[0,0,side*.14],[Math.PI/2,0,0]);
    brakeDisc.material=silver;
    for(let j=0;j<5;j++) {
      const theta=j/5*Math.PI*2;
      const r=.155;
      const spoke=box(spin,[.24,.036,.026],silver,[Math.cos(theta)*r,Math.sin(theta)*r,faceZ+side*.033],[0,0,theta]);
      const spoke2=box(spin,[.18,.017,.026],satin,[Math.cos(theta+.10)*.155,Math.sin(theta+.10)*.155,faceZ+side*.034],[0,0,theta+.10]);
      const boltZ=faceZ+side*.053;
      put(spin,new THREE.CylinderGeometry(.013,.013,.014,8),dark,[Math.cos(theta)*.061,Math.sin(theta)*.061,boltZ],[Math.PI/2,0,0]);
    }
    put(spin,new THREE.CylinderGeometry(.072,.072,.032,24),dark,[0,0,faceZ+side*.04],[Math.PI/2,0,0]);
    put(spin,new THREE.CylinderGeometry(.033,.033,.035,16),silver,[0,0,faceZ+side*.055],[Math.PI/2,0,0]);
    box(w,[.076,.155,.075],caliper,[-.16,.035,side*.155],[0,0,-.15]);
    for(let j=0;j<24;j++) {
      const a=j/24*Math.PI*2;
      box(spin,[.012,.006,.19],dark,[Math.sin(a)*.36,Math.cos(a)*.36,0],[0,0,-a]);
    }
    wheels.push(w);
  }

  // Educational battery tray: illustrative packaging, not an OEM cell layout.
  const battery=part('battery',[.15,.28,2.20]);
  const batteryCase=new THREE.MeshStandardMaterial({color:'#34424c',metalness:.72,roughness:.34});
  const batteryModule=new THREE.MeshStandardMaterial({color:'#678590',metalness:.6,roughness:.38});
  box(battery,[2.85,.09,1.43],batteryCase,[0,-.335,0]);
  for(const z of [-.725,.725])box(battery,[2.91,.11,.035],silver,[0,-.315,z]);
  for(const x of [-1.445,1.445])box(battery,[.035,.11,1.48],silver,[x,-.315,0]);
  for(let i=0;i<8;i++)for(let j=0;j<3;j++){
    box(battery,[.30,.035,.40],batteryModule,[-1.22+i*.35,-.272,-.44+j*.44]);
    box(battery,[.016,.012,.32],satin,[-1.22+i*.35,-.248,-.44+j*.44]);
  }
  tube(battery,[[-1.1,-.25,.67],[-.2,-.25,.67],[.65,-.25,.67],[1.25,-.25,.55]],.014,caliper);
  box(battery,[.18,.055,.14],blue,[1.30,-.25,.52]);

  const tank=part('tank',[-.35,.3,0]);
  // Centreline COPV: illustrative tank, not an OEM internal arrangement.
  const tankMaterial=new THREE.MeshStandardMaterial({color:'#435865',metalness:.6,roughness:.32});
  const tankCore=put(tank,new THREE.CapsuleGeometry(.23,1.25,8,24),tankMaterial,[-.40,-.17,0],[0,0,Math.PI/2]);
  for(const x of [-.92,-.10]) {
    put(tank,new THREE.TorusGeometry(.237,.024,8,30),silver,[x,-.17,0],[0,Math.PI/2,0]);
    box(tank,[.09,.09,.57],carbon,[x,-.39,0]);
  }
  put(tank,new THREE.CylinderGeometry(.055,.055,.20,12),satin,[.43,-.17,0],[0,0,Math.PI/2]);
  put(tank,new THREE.TorusGeometry(.065,.012,6,16),blue,[.53,-.17,0],[0,Math.PI/2,0]);
  tube(tank,[[.55,-.17,0],[.65,-.24,0],[.65,-.26,.43],[-1.5,-.26,.43]],.012,silver);
  tube(tank,[[.65,-.26,0],[.65,-.26,-.43],[-1.5,-.26,-.43]],.012,silver);

  const suspension=part('suspension',[.1,.38,-1.85]);
  for(const [id,x,z] of wheelData) {
    const side=Math.sign(z);
    cylinderBetween(suspension,[x-.23,-.28,side*.45],[x,-.23,z],.019,silver);
    cylinderBetween(suspension,[x+.23,-.28,side*.45],[x,-.23,z],.019,silver);
    cylinderBetween(suspension,[x,.06,side*.72],[x,-.28,side*.91],.031,satin);
    // Small real helical mesh, clearly visible in exploded mode.
    const springPts=[];
    for(let i=0;i<=80;i++) {
      const u=i/80, a=u*5*Math.PI*2;
      springPts.push([x+.053*Math.cos(a),-.25+u*.25,side*(.89-u*.13)+.053*Math.sin(a)]);
    }
    tube(suspension,springPts,.009,caliper,6);
  }
  box(suspension,[3.4,.08,.93],carbon,[0,-.37,0]);

  const thrusters=part('thrusters',[-.2,.30,-3.25]);
  const jetMounts=[];
  for(const x of [-1.35,1.35]) for(const z of [-.69,.69]) {
    const nozzle=new THREE.Group(); nozzle.position.set(x,-.32,z);thrusters.add(nozzle);
    put(nozzle,new THREE.CylinderGeometry(.075,.13,.18,20,1,true),silver,[0,-.055,0]);
    put(nozzle,new THREE.TorusGeometry(.13,.018,8,24),dark,[0,-.145,0],[Math.PI/2,0,0]);
    put(nozzle,new THREE.CircleGeometry(.091,20),black,[0,-.14,0],[Math.PI/2,0,0]);
    box(nozzle,[.26,.07,.25],carbon,[0,.03,0]);
    jetMounts.push({pos:new THREE.Vector3(x,-.45,z),dir:new THREE.Vector3(0,1,0)});
  }
  for(const z of [-.54,.54]) {
    const nozzle=new THREE.Group(); nozzle.position.set(-2.29,-.14,z);nozzle.rotation.z=-Math.PI/2;thrusters.add(nozzle);
    put(nozzle,new THREE.CylinderGeometry(.08,.11,.20,24,1,true),satin,[0,-.02,0]);
    put(nozzle,new THREE.TorusGeometry(.108,.018,8,24),silver,[0,-.12,0],[Math.PI/2,0,0]);
    put(nozzle,new THREE.CircleGeometry(.08,20),black,[0,-.12,0],[Math.PI/2,0,0]);
    jetMounts.push({pos:new THREE.Vector3(-2.43,-.14,z),dir:new THREE.Vector3(1,0,0)});
  }
  const fans=[];
  for(const z of [-.44,.44]) {
    const fan=new THREE.Group();fan.position.set(-1.35,-.34,z);thrusters.add(fan);
    put(fan,new THREE.TorusGeometry(.20,.025,8,32),silver,[0,0,0],[Math.PI/2,0,0]);
    for(let i=0;i<8;i++) {
      const a=i/8*Math.PI*2;
      box(fan,[.15,.012,.045],satin,[Math.cos(a)*.10,0,Math.sin(a)*.10],[0,-a+.3,0]);
    }
    put(fan,new THREE.CylinderGeometry(.047,.047,.028,16),dark);
    fans.push(fan);
  }

  const wing=part('wing',[-.38,1.1,0]);
  for(const z of [-.65,.65]) box(wing,[.06,.29,.055],carbon,[-1.72,.33,z],[0,0,-.12]);
  const wingFoil=new THREE.Group();wingFoil.position.set(-1.76,.49,0);wing.add(wingFoil);
  sectionHull(wingFoil,[[-.20,.97,-.025,0,.026,.95],[.12,.98,-.025,.009,.025,.96]],carbon);
  for(const z of [-1.0,1.0]) box(wingFoil,[.36,.12,.024],carbon,[-.02,.035,z]);
  wing.userData.foil=wingFoil;

  root.traverse(o=>{
    if(o.isMesh) {
      let p=o.parent;while(p&&!p.userData.partId)p=p.parent;
      if(p)o.userData.partId=p.userData.partId;
      o.castShadow=true;o.receiveShadow=true;
    }
  });
  return {root,parts,paintMaterials,wheels,fans,wing,tank,battery,jetMounts,bounds:{length:4.7,width:2.2,height:1.27}};
}
