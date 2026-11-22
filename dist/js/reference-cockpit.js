import * as THREE from 'three';
import {RoundedBoxGeometry} from '../vendor/addons/geometries/RoundedBoxGeometry.js';
import {createGrandPrixCockpit,isOpenGrandPrix} from './grand-prix-cockpit.js?v=20261122-garage';

const clamp=THREE.MathUtils.clamp;
const UP=new THREE.Vector3(0,1,0);

/** Reference-derived interiors for assets without a usable cabin; not OEM CAD. */
export function referenceCockpitFamily(vehicle={}){
  if(isOpenGrandPrix(vehicle))return 'open-grand-prix';
  const key=(vehicle.profileId||vehicle.id||'').toLowerCase();
  const id=[key,vehicle.title,vehicle.assetInfo?.title].filter(Boolean).join(' ').toLowerCase();
  if(/urus/.test(id))return 'urus';
  if(key==='bmw'||/\be30\b/.test(id))return 'e30';
  if(/beetle/.test(id))return 'beetle';
  if(/prius/.test(id))return 'prius';
  if(/porsche.?911|\b930\b/.test(id))return '911';
  if(/ferrari.?458/.test(id)||key==='ferrari')return '458';
  if(key==='roadster'||/tesla roadster/.test(id))return 'roadster';
  if(key==='alfa-romeo-giulia'||key==='toyota-mr2-w20')return 'classic';
  if(key==='ferrari-portofino'||key==='subaru-brz')return 'sports';
  if(key==='byd-seal')return 'electric';
  if(/supra/.test(id)&&!/gr-supra|a90|mk5/.test(id))return 'supra';
  if(/cybertruck/.test(id))return 'cybertruck';
  if(key==='tesla-model'||/model.?3/.test(id))return 'model3';
  if(/miata|mx-5|mx5|countach|f40|240z|rx-7|rx7|skyline|silvia|ae86|classic|e34|e39|volvo-v40|camaro.?\(1970|fiat-uno|ford-escort|civic-eg|civic eg6|corolla.?\(ke80|peugeot-205|clio williams|nsx.?\(1990/.test(id))return 'classic';
  if(/versa|tiida|206|peugeot-205|impreza|azera|i30|camry|audi-a3|320i|pt-cruiser|forester|duster/.test(id))return 'touring';
  if(/defender|q3|q7|x6|cr-v|tucson|sportage|velar|countryman/.test(id))return 'utility';
  if(/mclaren|koenigsegg|bugatti|lamborghini|pagani|alfa-romeo-4c|lotus-elise|audi-r8|918-spyder/.test(id))return 'sports';
  if(/tesla|ioniq|ev6|taycan/.test(id))return 'electric';
  return 'modern';
}

function leatherGrain(){
  const size=64,data=new Uint8Array(size*size*4);let seed=72837;
  for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=165+(seed>>>27);data.set([n,n,n,255],i*4);}
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,4);texture.needsUpdate=true;return texture;
}

export function createReferenceCockpit(vehicle={},seat={width:1.9,eye:new THREE.Vector3(0,.8,-.44)}){
  const family=referenceCockpitFamily(vehicle);
  if(family==='open-grand-prix')return createGrandPrixCockpit(vehicle,seat);
  const period=['e30','supra','classic','beetle','911','touring'].includes(family);
  const classic=['e30','supra','classic','touring'].includes(family);
  const minimal=['cybertruck','model3','roadster'].includes(family);
  const sports=['458','911','sports','roadster','supra'].includes(family);
  const upright=['beetle','utility','urus','cybertruck'].includes(family);
  const angular=['urus','cybertruck','roadster','sports','458'].includes(family);
  const root=new THREE.Group();root.name=`reference interior / ${family}`;root.userData.layout=family;root.userData.fidelity='reference-derived approximation';
  const textures=new Set(),materials=new Set(),geometries=new Set();let disposed=false;
  const grain=leatherGrain();textures.add(grain);
  const material=(options)=>{const m=new THREE.MeshStandardMaterial(options);materials.add(m);return m;};
  const leather=material({color:0x17191b,roughness:.88,bumpMap:grain,bumpScale:.0014});
  const lower=material({color:family==='urus'?0x232426:0x24272a,roughness:.8,bumpMap:grain,bumpScale:.0018});
  const rubber=material({color:0x07090a,roughness:.95});
  const satin=material({color:classic?0x3b3e40:0x737b82,roughness:.34,metalness:.8});
  const glossy=material({color:0x11161b,roughness:.25,metalness:.24});
  const stitch=material({color:family==='urus'?0xc6aa76:0x656666,roughness:.78});
  const accent=material({color:family==='urus'?0xb1a283:0x70797e,metalness:.5,roughness:.46});
  const painted=material({color:0xb51627,roughness:.3,metalness:.58});
  const wood=material({color:0x8c6544,roughness:.65,bumpMap:grain,bumpScale:.0006});
  const displayMaterial=()=>{const m=new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false});materials.add(m);return m;};
  const mesh=(geometry,mat,pos,parent=root,name='')=>{geometries.add(geometry);const m=new THREE.Mesh(geometry,mat);if(pos)m.position.set(...pos);m.name=name;m.receiveShadow=true;parent.add(m);return m;};
  const box=(size,pos,mat=leather,parent=root,r=.012,name='')=>mesh(new RoundedBoxGeometry(...size,2,Math.min(r,...size.map(n=>n*.22))),mat,pos,parent,name);
  const rod=(a,b,r=.004,mat=satin,parent=root)=>{const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const m=mesh(new THREE.CylinderGeometry(r,r,d.length(),8),mat,null,parent);m.position.copy(av).add(bv).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,d.normalize());return m;};
  const curve=(points,r,mat,parent=root,closed=false)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),closed,'centripetal'),Math.max(24,points.length*5),r,6,closed),mat,null,parent);
  const plane=(width,height,pos,mat,parent=root,name='')=>{const p=mesh(new THREE.PlaneGeometry(width,height),mat,pos,parent,name);p.rotation.y=-Math.PI/2;return p;};
  // Successive closed cross sections form continuous upholstered and moulded
  // surfaces. Shared indices smooth the contour across each intermediate section.
  function shell(sections,mat,name){
    const points=sections.flat(2),indices=[],n=sections[0].length;
    for(let row=1;row<sections.length;row++){
      for(let j=0;j<n;j++){
        const a=(row-1)*n+j,b=(row-1)*n+(j+1)%n;
        indices.push(a,b,a+n,b,b+n,a+n);
      }
    }
    for(let j=1;j<n-1;j++)indices.push(0,j+1,j,(sections.length-1)*n,(sections.length-1)*n+j,(sections.length-1)*n+j+1);
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return mesh(geometry,mat,null,root,name);
  }
  const width=clamp(seat.width||1.9,1.3,2.7)*.88,center=-(seat.eye?.z??-.44),left=center-width/2,right=center+width/2;
  const dashSections=[],trimPath=[];
  for(let i=0;i<=24;i++){
    const u=i/12-1,z=center+u*width/2;
    const recess=Math.exp(-Math.pow((z-center)/.27,2));
    const front=(upright?.715:.735)+(minimal?.035:sports?.145:.092)*recess-.04*u*u;
    const lip=(minimal?-.31:period?-.335:-.315)-.025*recess;
    dashSections.push([[front,-.49,z],[front-.008,lip-.05,z],[front+.012,lip-.018,z],
      [front+.06,lip,z],[1.00,lip+.064,z],[1.18,-.239-.021*u*u,z],[1.34,-.279,z],
      [1.30,-.58,z],[front+.035,-.54,z]].reverse());
    trimPath.push([front-.007,lip-.069,z]);
  }
  shell(dashSections,leather,'sculpted dashboard');
  box([.15,.18,width*.97],[.861,-.49,center],lower,root,.026,'lower dashboard fascia');
  // Seams are one instanced draw call, rather than many separate stitch meshes.
  const seamGeo=new THREE.BoxGeometry(.003,.0025,.008);geometries.add(seamGeo);const seam=new THREE.InstancedMesh(seamGeo,stitch,56);const matrix=new THREE.Matrix4();
  const edge=new THREE.CatmullRomCurve3(trimPath.map(p=>new THREE.Vector3(...p)));
  for(let i=0;i<56;i++){const p=edge.getPoint((i+.5)/56);matrix.makeTranslation(p.x-.002,p.y+.012,p.z);seam.setMatrixAt(i,matrix);}root.add(seam);
  const belt=curve(trimPath,family==='model3'?.012:.005, family==='model3'?wood:period?rubber:satin);
  belt.name='continuous dashboard trim';

  // The outer vehicle is hidden in driver view. Continue the dash through the
  // windshield base to a painted hood so the driver can judge the front corners.
  // Positions are relative to the eye, as are the rest of the reference cabin.
  const hoodRear=1.27,hoodFront=clamp((seat.length||4.6)*.5-(seat.eye?.x||0),1.68,3.55);
  const hoodHeight=(t,lateral)=>{
    const x=THREE.MathUtils.lerp(hoodRear,hoodFront,t);
    const panelDrop=(angular?.085:.028)*t*t;
    return Math.min(-.295-panelDrop,-.15*x-.018)-.038*lateral*lateral;
  };
  const hoodHalfWidth=t=>width*.5*(1.04-.16*t*t);
  const hoodVertices=[],hoodIndices=[];
  const lateralSections=[-1,-.84,-.53,0,.53,.84,1],rows=5;
  for(let i=0;i<rows;i++){
    const t=i/(rows-1),x=THREE.MathUtils.lerp(hoodRear,hoodFront,t);
    for(const lateral of lateralSections){
      hoodVertices.push(x-.085*t*lateral*lateral,hoodHeight(t,lateral),center+hoodHalfWidth(t)*lateral);
    }
  }
  const columns=lateralSections.length;
  for(let i=0;i<rows-1;i++)for(let j=0;j<columns-1;j++){
    const a=i*columns+j;
    hoodIndices.push(a,a+1,a+columns,a+1,a+columns+1,a+columns);
  }
  const hoodPanel=new THREE.BufferGeometry();
  hoodPanel.setAttribute('position',new THREE.Float32BufferAttribute(hoodVertices,3));
  hoodPanel.setIndex(hoodIndices);hoodPanel.computeVertexNormals();
  mesh(hoodPanel,painted,null,root,'painted hood beyond windshield');
  box([.092,.024,width*1.03],[hoodRear,-.283,center],rubber,root,.005,'windshield base');
  for(const offset of [-.23,.22]){
    const z=center+width*offset;
    const blade=box([.017,.012,width*.37],[hoodRear+.008,-.264,z],rubber,root,.003,'parked wiper blade');
    blade.rotation.y=.045;
    rod([hoodRear+.007,-.275,z+width*.14],[hoodRear+.006,-.263,z-width*.055],.0045,satin);
  }

  // One aperture defines the headliner, tapered pillars, door tops and mirror
  // attachment. A low coupe and an upright cab have different glass rakes.
  const headerX=upright?.54:sports?.21:.36;
  const headerY=upright?.315:sports?.22:.275;
  const pillarFoot=1.23,roofInset=width*(upright?.032:sports?.082:.057);
  const lining=material({color:period?0x706b60:sports?0x434548:0x777976,roughness:.96});
  const passengerWidth=Math.min(.46,width*.30);
  for(const [z,sign] of [[left-.055,1],[right+.055,-1]]){
    const sillPoints=[],doorSections=[];
    for(let i=0;i<=12;i++){
      const fraction=i/12,x=-.91+fraction*1.94,end=(2*fraction-1)**2;
      const y=-.239+.036*end+.018*fraction,zin=z+sign*(.030+.022*end);
      const section=[[x,y,zin],[x,y-.016,zin+sign*.037],[x,y-.067,zin+sign*.053],
        [x,-.51,zin+sign*.033],[x,-.65,zin+sign*.059],[x,-.735,zin+sign*.032],[x,-.75,zin-sign*.034],[x,y-.003,zin-sign*.032]];
      doorSections.push(sign===1?section:section.reverse());
      sillPoints.push([x,y+.002,zin+sign*.008]);
    }
    shell(doorSections,lower,'door inner panel');
    curve(sillPoints,.012,rubber).name='window sill';
    box([.70,.083,.13],[-.15,-.46,z+sign*.055],leather,root,.026,'door armrest');
    box([.27,.026,.025],[.20,-.345,z+sign*.063],satin,root,.008,'door pull handle');
    if(family==='beetle'){
      rod([.12,-.41,z+sign*.048],[.075,-.444,z+sign*.075],.007,satin);
      mesh(new THREE.SphereGeometry(.011,10,8),rubber,[.075,-.444,z+sign*.079],root,'window crank');
    }else{
      box([.16,.022,.055],[-.24,-.405,z+sign*.1],glossy);
      for(let j=0;j<2;j++)box([.047,.008,.024],[-.28+j*.065,-.390,z+sign*.1],satin,root,.002,'window switch');
    }
    curve([[.62,-.31,z+sign*.051],[.22,-.34,z+sign*.06],[-.42,-.365,z+sign*.06]],.003,stitch);
    const footZ=z+sign*.024,topZ=z+sign*roofInset;
    const pillarSections=[];
    for(let i=0;i<=8;i++){
      const t=i/8,x=THREE.MathUtils.lerp(pillarFoot,headerX,t),y=THREE.MathUtils.lerp(-.237,headerY,t),midZ=THREE.MathUtils.lerp(footZ,topZ,t);
      const depth=.033+.025*(1-t)**3+.01*t*t,thickness=period?.015:.021;
      const ring=[];
      for(let j=0;j<10;j++){const a=2*Math.PI*j/10;ring.push([x+Math.cos(a)*depth,y+Math.cos(a)*depth*.5,midZ+Math.sin(a)*thickness]);}
      pillarSections.push(ring.reverse());
    }
    shell(pillarSections,lining,'windshield pillar trim');
    curve([[pillarFoot,-.237,footZ+sign*.020],[(pillarFoot+headerX)/2,(headerY-.237)/2,(footZ+topZ)/2+sign*.018],[headerX,headerY,topZ+sign*.017]],.006,rubber);
    const rail=box([1.20,.07,.072],[headerX-.59,headerY+.016,topZ],lining,root,.014,'roof side lining');
    rail.rotation.z=-.024;
    const shoulder=box([.104,.53,.063],[-.62,headerY-.255,topZ-sign*.01],lining,root,.012,'door post trim');
    shoulder.rotation.x=sign*.08;
  }
  const roofWidth=width+.11-roofInset*2;
  box([.145,.061,roofWidth],[headerX-.035,headerY+.015,center],lining,root,.014,'windscreen header lining');
  box([1.35,.049,roofWidth],[headerX-.71,headerY+.045,center],lining,root,.012,'headliner');
  for(const seatZ of [0,2*center]){
    box([.14,.019,passengerWidth*.78],[headerX-.115,headerY+.007,seatZ],lining,root,.008,'folded sun visor');
  }
  if(family==='beetle'){
    box([1.32,.15,.14],[.07,-.842,center],rubber,root,.035,'floor tunnel');
  }else{
    box([1.34,.22,.29],[.08,-.70,center],rubber,root,.05,'center tunnel');
    box([.66,.08,.27],[-.27,-.56,center],leather,root,.026,'center armrest');
    box([.55,.065,.25],[.36,-.60,center],glossy,root,.025,'console surround');
    if(!period)for(const x of [-.09,.08]){
      const rim=mesh(new THREE.TorusGeometry(.045,.005,6,24),satin,[x,-.55,center]);rim.rotation.x=-Math.PI/2;
      mesh(new THREE.CylinderGeometry(.042,.034,.042,20),rubber,[x,-.573,center]);
    }
  }
  box([1.85,.05,width*.96],[-.03,-.97,center],rubber,root,.008,'carpet floor');
  // Seat and footwell geometry lives below the calibrated eye point. Rails,
  // cushions and buckles share the lateral position of each seating place.
  const seatSpan=passengerWidth;
  for(const seatZ of [0,2*center]){
    const inside=Math.sign(center-seatZ)||1;
    for(const edge of [-1,1]){
      box([.53,.036,.034],[-.05,-.908,seatZ+edge*seatSpan*.35],satin,root,.006,'seat slide rail');
      box([.21,.05,.045],[-.11,-.868,seatZ+edge*seatSpan*.35],lower,root,.008,'seat carriage');
    }
    box([.53,.115,seatSpan],[-.075,-.80,seatZ],lower,root,.04,'seat cushion');
    for(const edge of [-1,1])box([.44,.09,.06],[-.07,-.724,seatZ+edge*seatSpan*.42],leather,root,.028,'seat side bolster');
    const back=box([.095,.49,seatSpan*.95],[-.32,-.52,seatZ],leather,root,.032,'contoured seat back');
    back.rotation.z=.15;
    for(const dz of [-.068,.068])rod([-.35,-.31,seatZ+dz],[-.367,-.22,seatZ+dz],.006,satin);
    box([.094,.15,.23],[-.37,-.20,seatZ],leather,root,.033,'head restraint');
    rod([-.19,-.83,seatZ+inside*seatSpan*.53],[-.18,-.70,seatZ+inside*seatSpan*.57],.014,rubber);
    box([.051,.028,.034],[-.18,-.684,seatZ+inside*seatSpan*.57],lower,root,.006,'seat belt buckle');
    const shoulder=seatZ-inside*seatSpan*.72;
    const strap=box([.007,.60,.042],[-.34,-.48,shoulder],rubber,root,.002,'stowed shoulder belt');
    strap.rotation.z=.12;
    box([.028,.044,.053],[-.37,-.18,shoulder],satin,root,.006,'belt shoulder guide');
  }
  box([.025,.21,.096],[.51,-.815,-.17],rubber,root,.008,'footrest').rotation.z=-.30;
  for(const pedal of [{name:'brake pedal',z:-.037,width:.105},{name:'accelerator pedal',z:.106,width:.061}]){
    rod([.784,-.602,pedal.z],[.701,-.843,pedal.z],.011,satin);
    const face=box([.020,.088,pedal.width],[.693,-.849,pedal.z],rubber,root,.007,pedal.name);
    face.rotation.z=-.25;
    for(let rib=-1;rib<=1;rib++){
      const y=rib*.018;
      box([.007,.005,pedal.width*.78],[.678+y*.25,-.849+y,pedal.z],satin,root,.001,'pedal tread');
    }
  }

  function vent(z,y=-.37,x=.685,hex=false){
    const group=new THREE.Group();root.add(group);group.name=hex?'hexagonal air vent':'air vent';group.position.set(x,y,z);
    if(hex){
      const shape=new THREE.Shape(),r=.058;for(let i=0;i<6;i++){const a=(i+.5)*Math.PI/3,px=Math.cos(a)*r,py=Math.sin(a)*r;(i?shape.lineTo(px,py):shape.moveTo(px,py));}shape.closePath();
      const frame=mesh(new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.004,bevelThickness:.003,bevelSegments:1}),satin,[.01,0,0],group);frame.rotation.y=-Math.PI/2;
      const inset=mesh(new THREE.CircleGeometry(r*.82,6),rubber,[-.014,0,0],group);inset.rotation.y=-Math.PI/2;inset.rotation.z=Math.PI/6;
    }else{box([.036,.064,.13],[0,0,0],satin,group,.01);box([.014,.049,.115],[-.024,0,0],rubber,group,.005);}
    for(let i=0;i<4;i++)box([.012,.004,hex?.077:.102],[-.028,-.020+i*.013,0],lower,group,.001);
    box([.01,.023,.008],[-.037,0,0],satin,group,.002);
    return group;
  }
  if(!minimal&&family!=='beetle'){
    vent(left+.115,-.35,.68,family==='urus');vent(right-.11,-.36,.685,family==='urus');
  }

  const canvases=[];
  function display(width,height,pos,kind,bezel=.013,round=false){
    if(!round)box([.035,height+bezel*2,width+bezel*2],[pos[0]+.018,pos[1],pos[2]],glossy,root,.012,`${kind} display bezel`);
    const mat=displayMaterial();let canvas,ctx,texture;
    if(typeof document!=='undefined'){
      canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*height/width);ctx=canvas.getContext('2d');
      if(ctx){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;mat.map=texture;textures.add(texture);}
    }
    if(!ctx)mat.color.setHex(0x10191e);
    const surface=round?mesh(new THREE.CircleGeometry(width/2,48),mat,pos,root,`${kind} live screen`):plane(width,height,pos,mat,root,`${kind} live screen`);
    if(round)surface.rotation.y=-Math.PI/2;
    surface.userData.instrument=kind;
    const entry={canvas,ctx,texture,kind,surface,last:'',lastDraw:-Infinity};canvases.push(entry);return entry;
  }
  function hood(){
    if(classic){
      box([.26,.027,.42],[.91,-.158,0],leather,root,.012,'instrument cowl top');
      for(const z of [-.21,.21])box([.20,.14,.026],[.88,-.22,z],leather,root,.01,'instrument cowl side');
      box([.09,.18,.42],[.91,-.25,0],rubber,root,.026,'instrument binnacle');
    }else{
      const arch=new THREE.Shape();arch.moveTo(-.223,-.325);arch.lineTo(-.218,-.225);arch.quadraticCurveTo(-.211,-.162,-.145,-.162);arch.lineTo(.145,-.162);arch.quadraticCurveTo(.211,-.162,.218,-.225);arch.lineTo(.223,-.325);arch.lineTo(.197,-.325);arch.lineTo(.192,-.226);arch.quadraticCurveTo(.187,-.187,.14,-.187);arch.lineTo(-.14,-.187);arch.quadraticCurveTo(-.187,-.187,-.192,-.226);arch.lineTo(-.197,-.325);arch.closePath();
      const cowl=mesh(new THREE.ExtrudeGeometry(arch,{depth:.17,steps:1,bevelEnabled:true,bevelSize:.006,bevelThickness:.006,bevelSegments:2,curveSegments:10}),leather,[.79,0,0],root,'integrated rounded instrument cowl');cowl.rotation.y=Math.PI/2;
      box([.12,.158,.398],[.875,-.252,0],rubber,root,.025,'instrument binnacle');
    }
  }
  const needles=[];
  function analogGauge(z,r,kind,x=.795,y=-.255){
    const ring=mesh(new THREE.TorusGeometry(r+.003,.004,7,40),satin,[x,y,z]);ring.rotation.y=-Math.PI/2;
    const face=display(r*2,r*2,[x-.007,y,z],kind,0,true);
    const needle=new THREE.Group();needle.position.set(x-.011,y,z);needle.name=`${kind} needle`;root.add(needle);
    box([.002,r*.64,.0028],[0,r*.26,0],material({color:family==='e30'?0xf47c28:0xed4b32,emissive:family==='e30'?0x9b350b:0x501009,emissiveIntensity:.7,roughness:.6}),needle,.001);
    const cap=mesh(new THREE.CircleGeometry(.0065,14),rubber,[-.002,0,0],needle);cap.rotation.y=-Math.PI/2;
    needles.push({object:needle,kind,face});
  }

  if(family==='beetle'){
    box([.105,.186,width*.95],[.844,-.302,center],painted,root,.027,'painted metal instrument panel');
    analogGauge(0,.07,'speed',.783,-.278);
    const gloveZ=center+width*.235;
    box([.010,.117,width*.26],[.786,-.306,gloveZ],rubber,root,.003,'glove compartment seal');
    box([.012,.106,width*.25],[.777,-.306,gloveZ],painted,root,.005,'glove compartment door');
    box([.012,.012,.044],[.768,-.276,gloveZ],satin);
    for(let i=0;i<9;i++)box([.013,.054,.005],[.778,-.301,center*.32+i*.011],rubber,root,.001,'speaker grille slot');
    rod([.32,-.775,center],[.265,-.474,center],.007,satin);
    mesh(new THREE.SphereGeometry(.025,16,12),leather,[.265,-.474,center],root,'floor gear lever');
  }else if(family==='911'){
    hood();
    // The outer instruments carry simulated quantities for which telemetry is available.
    display(.352,.095,[.775,-.255,0],'dial-bank',.005);
    analogGauge(0,.061,'power',.76,-.242);
    const ignition=mesh(new THREE.CylinderGeometry(.015,.015,.015,16),satin,[.675,-.40,left+.15],root,'left ignition switch');ignition.rotation.z=Math.PI/2;
    vent(center-.085,-.34,.688);vent(center+.077,-.34,.688);
    const is930=/930|1975/.test(vehicle.assetInfo?.title||vehicle.title||'')||vehicle.profileId==='porsche-911';
    display(.228,is930?.048:.104,[.647,-.449,center],is930?'radio':'navigation',.006);
    rod([.36,-.599,center],[.32,-.47,center],.009,satin);
    box([.051,.048,.05],[.319,-.46,center],leather,root,.014,'shift knob');
  }else if(family==='458'){
    hood();
    display(.114,.080,[.782,-.25,-.14],'cluster',.004);
    display(.114,.080,[.782,-.25,.14],'navigation',.004);
    analogGauge(0,.071,'power',.77,-.245);
    for(const dz of [-1,1]){
      const pod=box([.105,.105,.064],[.704,-.34,dz*.24],glossy,root,.014,'driver instrument control pod');
      pod.rotation.y=dz*.20;
      for(let i=0;i<3;i++)box([.016,.010,.032],[.649,-.31-i*.025,dz*.24],satin,root,.002);
    }
    for(const x of [.29,.36,.43]){
      mesh(new THREE.CylinderGeometry(.016,.019,.012,18),satin,[x,-.54,center],root,'transmission bridge button');
    }
  }else if(family==='prius'){
    box([.18,.089,.52],[1.00,-.198,center-.04],leather,root,.014,'center meter visor');
    display(.465,.061,[.902,-.198,center-.04],'hybrid-meter',.004);
    const bridge=box([.54,.074,.255],[.50,-.502,center],lower,root,.027,'raised console bridge');
    bridge.rotation.z=.32;
    display(.227,.119,[.66,-.366,center],'navigation',.007);
    rod([.535,-.445,center],[.505,-.41,center],.011,satin);
    box([.038,.027,.04],[.499,-.403,center],glossy,root,.009,'hybrid selector');
  }else if(classic){
    hood();analogGauge(-.112,.064,'speed');analogGauge(.025,.070,'power');analogGauge(.145,.044,'fuel');
    vent(.36,-.335,.69);vent(.52,-.335,.70);
    const console=box([.13,.30,.31],[.78,-.54,.46],lower,root,.025,'driver-oriented center stack');console.rotation.y=-.11;
    display(.245,.064,[.695,-.435,.46],'radio',.008);
    for(let i=0;i<3;i++){
      const knob=mesh(new THREE.CylinderGeometry(.019,.019,.023,16),rubber,[.686,-.532,.37+i*.085]);knob.rotation.z=Math.PI/2;
      rod([.669,-.532,.37+i*.085],[.666,-.519,.37+i*.085],.0018,stitch);
    }
    for(let i=0;i<4;i++)box([.017,.018,.037],[.678,-.584,.365+i*.063],glossy,root,.003,'console switch');
    const boot=mesh(new THREE.ConeGeometry(.061,.085,5),leather,[.40,-.562,.46]);boot.scale.z=.85;
    rod([.40,-.56,.46],[.36,-.459,.46],.010,satin);
    box([.052,.045,.046],[.357,-.445,.46],leather,root,.018,'manual gear knob');
    rod([.02,-.59,.63],[.23,-.53,.63],.012,leather);
    if(family==='supra')curve([[.85,-.17,-.20],[.80,-.16,.13],[.71,-.24,.31],[.68,-.40,.61],[.65,-.62,.63]],.014,leather);
  }else if(minimal){
    const landscape=family!=='roadster';
    const screenWidth=family==='cybertruck'?.45:landscape?.40:.202;
    const screenHeight=family==='cybertruck'?.255:landscape?.238:.30;
    const screen=display(screenWidth,screenHeight,[landscape?.74:.665,landscape?-.24:-.363,center],'tablet',.008);
    if(!landscape){
      const frame=root.getObjectByName('tablet display bezel'),pitch=.38;
      screen.surface.rotateOnWorldAxis(new THREE.Vector3(0,0,1),-pitch);
      frame.rotation.z=-pitch;
      frame.position.copy(screen.surface.position).add(new THREE.Vector3(.021*Math.cos(pitch),-.021*Math.sin(pitch),0));
      box([.105,.054,.17],[.743,-.417,center],lower,root,.014,'console screen support');
    }else{
      box([.104,.073,.093],[.824,-.285,center],glossy,root,.010,'tablet mounting pedestal');
    }
    if(family==='cybertruck')box([.025,.012,width*.92],[.74,-.365,center],satin,root,.002);
    else box([.035,.008,width*.94],[.72,-.37,center],rubber,root,.002,'concealed horizontal air slot');
    box([.38,.023,.23],[.42,-.56,.45],rubber,root,.01,'charging tray');
  }else{
    hood();display(.354,.126,[.784,-.255,0],'cluster',.005);
    if(family==='urus'){
      vent(.37,-.245,.795,true);vent(.64,-.245,.825,true);
      const upperZ=center+.045;
      box([.099,.32,.321],[.747,-.447,upperZ],glossy,root,.02,'dual center display housing');
      display(.285,.153,[.690,-.373,upperZ],'navigation');
      display(.275,.118,[.682,-.539,upperZ],'climate');
      curve([[.70,-.37,left+.07],[.70,-.42,.18],[.71,-.365,.30],[.755,-.295,.50],[.79,-.365,right-.05]],.006,satin);
      box([.16,.024,.21],[.34,-.534,.48],satin,root,.012,'Tamburo controls');
      box([.068,.03,.042],[.36,-.510,.48],material({color:0x962d27,roughness:.4,metalness:.25}),root,.009,'starter cover');
      for(const z of [.40,.56])box([.098,.026,.028],[.34,-.506,z],rubber,root,.006,'drive selector');
    }else if(family==='sports'){
      const spine=box([.53,.085,.196],[.56,-.517,center],lower,root,.025,'sloped sports console');
      spine.rotation.z=.47;
      display(.19,.112,[.635,-.35,center],'navigation',.007);
      for(const z of [center-.14,center+.14])curve([[.33,-.55,z],[.49,-.49,z],[.63,-.401,z],[.73,-.354,z]],.009,satin);
      for(const x of [.32,.37,.42])box([.035,.014,.074],[x,-.507+(x-.32)*.52,center],satin,root,.003,'transmission switch');
    }else if(family==='utility'){
      display(.302,.141,[.71,-.265,center],'navigation',.009);
      vent(center-.082,-.40,.648);vent(center+.082,-.40,.648);
      box([.045,.109,.268],[.667,-.505,center],lower,root,.014,'climate control face');
      for(const z of [center-.087,center+.087]){
        const knob=mesh(new THREE.CylinderGeometry(.026,.026,.025,20),satin,[.637,-.50,z],root,'climate rotary knob');knob.rotation.z=Math.PI/2;
      }
      curve([[.65,-.425,right-.40],[.622,-.419,right-.36],[.615,-.413,right-.13],[.649,-.425,right-.09]],.014,lower).name='passenger dashboard handle';
    }else{
      display(.31,.167,[.81,-.295,.47],'navigation');vent(.37,-.435,.68);vent(.56,-.435,.69);
      display(.255,.067,[.688,-.53,.47],'climate',.007);
      box([.075,.11,.045],[.36,-.49,.46],glossy,root,.015,'drive selector');
      box([.04,.023,.07],[.36,-.43,.46],satin,root,.009);
    }
  }

  // Wheel rim, padded hub, spokes, switch packs and stalks occupy physical space.
  const column=new THREE.Group();column.name='steering column inclination';
  column.position.set(upright?.535:sports?.575:.55,upright?-.316:sports?-.277:-.301,0);
  column.rotation.z=-(upright?.38:sports?.20:.29);root.add(column);
  const steering=new THREE.Group();steering.name='reference steering wheel';column.add(steering);
  if(angular){
    const points=family==='cybertruck'?[[0,.12,-.14],[0,.145,-.08],[0,.145,.08],[0,.12,.14],[0,-.10,.145],[0,-.13,.10],[0,-.13,-.10],[0,-.10,-.145]]:[[0,.155,-.05],[0,.125,-.13],[0,.02,-.178],[0,-.10,-.145],[0,-.14,-.08],[0,-.14,.08],[0,-.10,.145],[0,.02,.178],[0,.125,.13],[0,.155,.05]];
    if(family==='roadster'){
      for(const sign of [-1,1]){
        curve([[0,.084,sign*.103],[0,.093,sign*.145],[0,.05,sign*.163],[0,-.035,sign*.156],[0,-.09,sign*.135],[0,-.103,sign*.08],[0,-.103,0]],.015,leather,steering).name='open steering grip';
      }
    }else curve(points,.0165,leather,steering,true);
  }else{const rim=mesh(new THREE.TorusGeometry(family==='beetle'?.194:.177,period?.0125:.017,12,64),leather,[0,0,0],steering);rim.rotation.y=-Math.PI/2;}
  for(const side of [-1,1]){
    const spoke=box([.019,.027,.105],[0,-.012,side*.100],satin,steering,.008);spoke.rotation.x=side*-.18;
    if(!period)box([.018,.033,.067],[-.018,-.009,side*.098],rubber,steering,.007,'wheel switch pod');
    if(!period){
      const scroll=mesh(new THREE.CylinderGeometry(.007,.007,.019,10),satin,[-.030,-.006,side*.101],steering);scroll.rotation.x=Math.PI/2;
      for(const dy of [-.009,.009])box([.002,.004,.012],[-.029,dy,side*.125],stitch,steering,.001);
    }
  }
  if(family!=='beetle'){
    box([.025,.086,.041],[0,-.093,0],rubber,steering,.011,'lower wheel spoke');
    box([.006,.064,.022],[-.016,-.095,0],satin,steering,.005,'lower spoke satin inset');
  }else{
    curve([[0,.0,-.17],[-.011,-.04,-.12],[-.02,-.059,0],[-.011,-.04,.12],[0,.0,.17]],.004,satin,steering).name='chrome horn bar';
  }
  box([.045,.083,.112],[-.016,-.012,0],leather,steering,.025,'padded wheel hub');
  box([.002,.017,.024],[-.041,-.008,0],satin,steering,.004,'hub badge');
  const columnMount=[column.position.x+.016,column.position.y-.008,0];
  rod(columnMount,[.91,-.42,0],.038,lower);
  for(const sign of [-1,1]){
    rod([.69,-.32,sign*.035],[.67,-.31,sign*.143],.007,rubber);
    box([.031,.023,.046],[.666,-.31,sign*.155],rubber,root,.009,'column stalk');
    if(sports&&!minimal||family==='urus'){const paddle=box([.014,.097,.031],[column.position.x+.072,column.position.y+.026,sign*.125],satin,root,.01,'fixed shift paddle');paddle.rotation.x=sign*.16;}
  }
  if(family==='458'){
    const button=material({color:0x9f2821,roughness:.48});
    for(const side of [-1,1]){
      const control=mesh(new THREE.CylinderGeometry(.012,.012,.007,20),button,[-.035,-.04,side*.080],steering,side<0?'wheel ignition button':'wheel mode selector');
      control.rotation.z=Math.PI/2;
    }
  }

  const mirrorAnchor=new THREE.Group();mirrorAnchor.position.set(headerX+.09,headerY-.093,center*.85);mirrorAnchor.name='interior rear-view mirror';root.add(mirrorAnchor);
  box([.035,.075,.215],[0,0,0],rubber,mirrorAnchor,.017);
  const mirrorMat=displayMaterial();mirrorMat.color.setHex(0x678087);
  const mirrorSurface=plane(.190,.055,[-.021,0,0],mirrorMat,mirrorAnchor,'rear-view mirror surface');
  mirrorAnchor.mirrorSurface=mirrorSurface;
  rod([.012,.018,0],[.022,.064,0],.009,rubber,mirrorAnchor);
  box([.044,.021,.04],[.022,.071,0],rubber,mirrorAnchor,.003,'mirror windshield shoe');
  mirrorAnchor.rotation.y=-.12;

  function paintDisplay(entry,data){
    const {ctx:c,canvas,kind}=entry;if(!c)return;
    const w=canvas.width,h=canvas.height;const amber=family==='e30'?'#efa15b':'#e5edf0';
    c.clearRect(0,0,w,h);c.fillStyle='#080c10';c.fillRect(0,0,w,h);
    c.textAlign='center';c.textBaseline='middle';
    if(['speed','power','fuel'].includes(kind)){
      c.fillStyle='#090c0d';c.beginPath();c.arc(w/2,h/2,w*.49,0,Math.PI*2);c.fill();
      c.strokeStyle=amber;c.fillStyle=amber;c.lineWidth=3;
      const max=kind==='speed'?260:kind==='fuel'?1:data.rpm!==null?8:400,steps=kind==='fuel'?4:8;
      for(let i=0;i<=steps*4;i++){
        const a=-2.3+(i/(steps*4))*4.6,major=i%4===0,r=w*.43,inner=r-(major?19:9);
        c.beginPath();c.moveTo(w/2+Math.sin(a)*r,h/2-Math.cos(a)*r);c.lineTo(w/2+Math.sin(a)*inner,h/2-Math.cos(a)*inner);c.stroke();
        if(major){c.font=`500 ${w*.069}px sans-serif`;c.fillText(kind==='fuel'?(i===0?'E':i===steps*4?'F':''):String(Math.round(i/(steps*4)*max)),w/2+Math.sin(a)*w*.30,h/2-Math.cos(a)*w*.30);}
      }
      c.font=`500 ${w*.068}px sans-serif`;c.fillText(kind==='speed'?'km/h':kind==='fuel'?'AIR':data.rpm!==null?'RPM ×1000':'POWER kW',w/2,h*.68);
      if(kind==='speed'){c.fillStyle='#252c2c';c.fillRect(w*.32,h*.77,w*.36,h*.12);c.fillStyle=amber;c.font=`500 ${w*.085}px monospace`;c.fillText(String(Math.round(data.speed)).padStart(3,'0'),w/2,h*.83);}
    }else if(kind==='hybrid-meter'){
      c.fillStyle='#a9dfd1';c.textAlign='left';c.font=`500 ${h*.66}px monospace`;c.fillText(String(Math.round(data.speed)),w*.05,h*.45);
      c.font=`500 ${h*.20}px sans-serif`;c.fillText('km/h',w*.25,h*.74);
      c.font=`500 ${h*.36}px sans-serif`;c.fillText(data.gear,w*.41,h*.42);
      c.font=`500 ${h*.19}px sans-serif`;c.fillText('POWER',w*.54,h*.29);
      c.fillStyle='#263f3a';c.fillRect(w*.54,h*.53,w*.40,h*.14);
      c.fillStyle='#98cdba';c.fillRect(w*.54,h*.53,w*.40*clamp(Math.abs(data.powerKW)/400,0,1),h*.14);
    }else if(kind==='dial-bank'){
      // Speed, drive power and air are instrumented in this conversion.
      // The centre dial is a physical needle rendered over this display.
      for(const [fraction,radius,f,label] of [[.10,.32,null,''],[.30,.40,Math.abs(data.powerKW)/400,'kW'],[.70,.40,data.speed/260,'km/h'],[.90,.32,data.gasFraction,'AIR']]){
        const x=w*fraction,y=h*.52,r=radius*h;
        c.strokeStyle='#9b9d9c';c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.stroke();
        for(let i=0;i<=8;i++){
          const a=-2.25+i*.5625;c.beginPath();c.moveTo(x+Math.sin(a)*r*.74,y-Math.cos(a)*r*.74);c.lineTo(x+Math.sin(a)*r*.9,y-Math.cos(a)*r*.9);c.stroke();
        }
        if(f!==null){
          const a=-2.25+4.5*clamp(f,0,1);
          c.strokeStyle='#eb6c46';c.lineWidth=3;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.sin(a)*r*.76,y-Math.cos(a)*r*.76);c.stroke();
        }
        c.font=`500 ${r*.33}px sans-serif`;c.fillStyle='#dde3e4';c.fillText(label,x,y+r*.48);
      }
    }else if(kind==='cluster'){
      c.fillStyle='#26313a';c.beginPath();c.moveTo(0,h);c.lineTo(w*.16,0);c.lineTo(w*.84,0);c.lineTo(w,h);c.closePath();c.fill();
      c.strokeStyle=family==='urus'?'#d2b475':'#5caead';c.lineWidth=8;c.beginPath();c.arc(w*.5,h*.62,h*.48,Math.PI*.86,Math.PI*2.14);c.stroke();
      c.fillStyle='#f0f4f7';c.font=`500 ${h*.40}px sans-serif`;c.fillText(String(Math.round(data.speed)),w*.5,h*.52);c.font=`400 ${h*.09}px sans-serif`;c.fillText('km/h',w*.5,h*.78);
      c.fillStyle='#b8c8d0';c.font=`500 ${h*.17}px sans-serif`;c.fillText(data.gear,w*.17,h*.48);
      c.font=`400 ${h*.075}px sans-serif`;c.fillText(`${Math.round(data.powerKW)} kW`,w*.83,h*.49);c.fillText(`${Math.round(data.gasFraction*100)}%`,w*.83,h*.69);
    }else if(kind==='tablet'||kind==='navigation'){
      const unit=Math.min(w,h),light=family==='model3'||family==='cybertruck';
      c.fillStyle=light?'#e5e7e6':'#142026';c.fillRect(0,0,w,h);
      c.fillStyle=light?'#252e30':'#e7eeef';c.textAlign='left';
      c.font=`500 ${unit*.082}px sans-serif`;c.fillText('DRIVE',w*.069,h*.13);
      c.font=`500 ${unit*.32}px sans-serif`;c.fillText(String(Math.round(data.speed)),w*.065,h*.44);
      c.font=`400 ${unit*.075}px sans-serif`;c.fillText('km/h',w*.069,h*.65);
      c.textAlign='right';c.font=`500 ${unit*.14}px sans-serif`;c.fillText(data.gear,w*.93,h*.2);
      c.font=`400 ${unit*.069}px sans-serif`;c.fillText(`${Math.round(data.powerKW)} kW`,w*.93,h*.65);
      c.fillStyle=light?'#b4bbba':'#475659';c.fillRect(w*.07,h*.82,w*.86,h*.021);
      c.fillStyle=light?'#49857f':'#80bcae';c.fillRect(w*.07,h*.82,w*.86*clamp(Math.abs(data.powerKW)/400,0,1),h*.021);
    }else if(kind==='climate'){
      c.fillStyle='#cbd7df';c.font=`400 ${h*.28}px sans-serif`;c.fillText('22.0°',w*.19,h*.40);c.fillText('22.0°',w*.81,h*.40);c.font=`400 ${h*.12}px sans-serif`;c.fillText('AUTO',w*.50,h*.35);
      for(let i=0;i<5;i++){c.fillStyle=i<3?'#adbdc7':'#303c43';c.fillRect(w*(.37+i*.055),h*.64,w*.035,h*.07);}
    }else if(kind==='radio'){
      c.fillStyle=amber;c.font=`500 ${h*.31}px monospace`;c.textAlign='left';c.fillText('FM',w*.07,h*.42);c.textAlign='right';c.fillText('STANDBY',w*.93,h*.43);c.fillStyle='#3c3b32';for(let i=0;i<5;i++)c.fillRect(w*(.07+i*.185),h*.77,w*.12,h*.04);
    }
    entry.texture.needsUpdate=true;
  }

  function update(input={}){
    if(disposed)return;
    const finite=(v,f=0)=>Number.isFinite(v)?v:f;
    const data={speed:Math.abs(finite(input.speed)),gear:String(input.gear||'N'),powerKW:finite(input.powerKW),rpm:Number.isFinite(input.rpm)?Math.max(0,input.rpm):null,gasFraction:clamp(finite(input.gasFraction,1),0,1),height:finite(input.height)};
    root.userData.telemetry=data;
    for(const {object,kind} of needles){const fraction=kind==='speed'?data.speed/260:kind==='fuel'?data.gasFraction:data.rpm!==null?data.rpm/8000:Math.abs(data.powerKW)/400;object.rotation.x=-2.3+clamp(fraction,0,1)*4.6;}
    const now=typeof performance!=='undefined'?performance.now():Date.now();
    for(const entry of canvases){
      const kind=entry.kind;
      const fixed=['climate','fuel','radio'].includes(kind);
      const key=fixed?'fixed':kind==='power'?(data.rpm===null?'power':'rpm'):[Math.round(data.speed),data.gear,Math.round(data.powerKW),Math.round(data.gasFraction*100)].join('|');
      // Mesh needles update every physics view; texture uploads are capped at 12.5 Hz.
      if(key!==entry.last&&now-entry.lastDraw>=80){entry.last=key;entry.lastDraw=now;paintDisplay(entry,data);}
    }
  }
  update();
  function dispose(){
    if(disposed)return;disposed=true;
    seam.dispose();for(const geometry of geometries)geometry.dispose();for(const mat of materials)mat.dispose();for(const texture of textures)texture.dispose();
    root.removeFromParent();root.clear();canvases.length=0;needles.length=0;
  }
  return {root,steering,steeringAxis:'x',paintMaterials:[painted],mirrorAnchor,mirrorSurface,update,dispose};
}
