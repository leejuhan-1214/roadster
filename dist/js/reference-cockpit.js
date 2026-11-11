import * as THREE from 'three';
import {RoundedBoxGeometry} from '../vendor/addons/geometries/RoundedBoxGeometry.js';

const clamp=THREE.MathUtils.clamp;
const UP=new THREE.Vector3(0,1,0);

/** Reference-derived interiors for assets without a usable cabin; not OEM CAD. */
export function referenceCockpitFamily(vehicle={}){
  const id=[vehicle.profileId,vehicle.id,vehicle.title,vehicle.assetInfo?.title].filter(Boolean).join(' ').toLowerCase();
  if(/urus/.test(id))return 'urus';
  if(/(^|\s)bmw($|\s)|e30/.test(id))return 'e30';
  if(/supra/.test(id)&&!/gr-supra|a90|mk5/.test(id))return 'supra';
  if(/cybertruck/.test(id))return 'cybertruck';
  if(/model.?3/.test(id))return 'model3';
  if(/miata|mx-5|mx5|countach|f40|240z|rx-7|rx7|skyline|silvia|ae86|beetle|classic/.test(id))return 'classic';
  if(/tesla|ioniq|ev6|taycan|polestar/.test(id))return 'electric';
  return 'modern';
}

function leatherGrain(){
  const size=64,data=new Uint8Array(size*size*4);let seed=72837;
  for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=165+(seed>>>27);data.set([n,n,n,255],i*4);}
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,4);texture.needsUpdate=true;return texture;
}

export function createReferenceCockpit(vehicle={},seat={width:1.9,eye:new THREE.Vector3(0,.8,-.44)}){
  const family=referenceCockpitFamily(vehicle),classic=['e30','supra','classic'].includes(family),minimal=['cybertruck','model3'].includes(family),angular=family==='urus'||family==='cybertruck';
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
  const width=clamp(seat.width||1.9,1.3,2.7)*.88,center=-(seat.eye?.z??-.44),left=center-width/2,right=center+width/2;
  const dashShape=new THREE.Shape();dashShape.moveTo(.71,-.46);dashShape.quadraticCurveTo(.70,-.35,.80,-.30);dashShape.quadraticCurveTo(.94,-.22,1.15,-.23);dashShape.lineTo(1.34,-.28);dashShape.lineTo(1.30,-.58);dashShape.lineTo(.77,-.59);dashShape.quadraticCurveTo(.69,-.56,.71,-.46);
  mesh(new THREE.ExtrudeGeometry(dashShape,{depth:width,steps:1,bevelEnabled:true,bevelSegments:2,bevelSize:.012,bevelThickness:.012,curveSegments:12}),leather,[0,0,left],root,'sculpted dashboard');
  box([.27,.18,width*.97],[.80,-.49,center],lower,root,.026,'lower dashboard fascia');
  curve([[.716,-.365,left+.02],[.718,-.368,center-.2],[.745,-.38,center+.3],[.79,-.39,right-.02]],.004,stitch);
  // Seams are one instanced draw call, rather than many separate stitch meshes.
  const seamGeo=new THREE.BoxGeometry(.003,.0025,.008);geometries.add(seamGeo);const seam=new THREE.InstancedMesh(seamGeo,stitch,56);const matrix=new THREE.Matrix4();
  for(let i=0;i<56;i++){matrix.makeTranslation(.742,-.333,left+.035+(width-.07)*i/55);seam.setMatrixAt(i,matrix);}root.add(seam);
  box([.035,.024,width*.9],[.699,-.408,center],family==='model3'?wood:satin,root,.005,'continuous dashboard trim');

  // Doors, windscreen frame, and the tunnel give the view a connected cabin.
  for(const [z,sign] of [[left-.055,1],[right+.055,-1]]){
    box([1.65,.46,.095],[-.12,-.48,z],lower,root,.036,'door inner panel');
    box([1.6,.064,.1],[-.10,-.235,z],leather,root,.022,'window sill');
    box([.70,.083,.13],[-.15,-.46,z+sign*.055],leather,root,.026,'door armrest');
    box([.27,.026,.025],[.20,-.345,z+sign*.063],satin,root,.008,'door pull handle');
    box([.16,.022,.055],[-.24,-.405,z+sign*.1],glossy);
    for(let j=0;j<2;j++)box([.047,.008,.024],[-.28+j*.065,-.390,z+sign*.1],satin,root,.002,'window switch');
    curve([[.62,-.31,z+sign*.051],[.22,-.34,z+sign*.06],[-.42,-.365,z+sign*.06]],.003,stitch);
    rod([1.20,-.23,z],[.25,.46,z-sign*.01],.035,leather);
    rod([.26,.46,z-sign*.01],[-.64,.46,z-sign*.01],.027,leather);
  }
  rod([.25,.46,left-.055],[.25,.46,right+.055],.034,leather);
  box([1.34,.22,.29],[.08,-.70,.45],rubber,root,.05,'center tunnel');
  box([.66,.08,.27],[-.27,-.56,.45],leather,root,.026,'center armrest');
  box([.55,.065,.25],[.36,-.60,.45],glossy,root,.025,'console surround');
  for(const x of [-.09,.08]){
    const rim=mesh(new THREE.TorusGeometry(.045,.005,6,24),satin,[x,-.55,.45]);rim.rotation.x=-Math.PI/2;
    const cup=mesh(new THREE.CylinderGeometry(.042,.034,.042,20),rubber,[x,-.573,.45]);
  }
  box([1.85,.05,width*.96],[-.03,-.97,center],rubber,root,.008,'carpet floor');

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
  vent(left+.115,-.35,.71,family==='urus');vent(right-.11,-.36,.735,family==='urus');

  const canvases=[];
  function display(width,height,pos,kind,bezel=.013){
    box([.035,height+bezel*2,width+bezel*2],[pos[0]+.023,pos[1],pos[2]],glossy,root,.012,`${kind} display bezel`);
    const mat=displayMaterial();let canvas,ctx,texture;
    if(typeof document!=='undefined'){
      canvas=document.createElement('canvas');canvas.width=768;canvas.height=Math.round(768*height/width);ctx=canvas.getContext('2d');
      if(ctx){texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;mat.map=texture;textures.add(texture);}
    }
    if(!ctx)mat.color.setHex(0x10191e);
    const surface=plane(width,height,pos,mat,root,`${kind} live screen`);surface.userData.instrument=kind;
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
  function analogGauge(z,r,kind){
    const x=.795,y=-.255;
    const ring=mesh(new THREE.TorusGeometry(r+.003,.004,7,40),satin,[x,y,z]);ring.rotation.y=-Math.PI/2;
    const face=display(r*2,r*2,[x-.007,y,z],kind,0);
    const needle=new THREE.Group();needle.position.set(x-.011,y,z);needle.name=`${kind} needle`;root.add(needle);
    box([.002,r*.64,.0028],[0,r*.26,0],material({color:family==='e30'?0xf47c28:0xed4b32,emissive:family==='e30'?0x9b350b:0x501009,emissiveIntensity:.7,roughness:.6}),needle,.001);
    const cap=mesh(new THREE.CircleGeometry(.0065,14),rubber,[-.002,0,0],needle);cap.rotation.y=-Math.PI/2;
    needles.push({object:needle,kind,face});
  }

  if(classic){
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
    display(family==='cybertruck'?.45:.40,family==='cybertruck'?.255:.238,[.77,-.235,.43],'tablet',.008);
    if(family==='cybertruck')box([.025,.012,width*.92],[.74,-.365,center],satin,root,.002);
    else box([.035,.008,width*.94],[.72,-.37,center],rubber,root,.002,'concealed horizontal air slot');
    box([.38,.023,.23],[.42,-.56,.45],rubber,root,.01,'charging tray');
  }else{
    hood();display(.354,.126,[.784,-.255,0],'cluster',.005);
    if(family==='urus'){
      vent(.37,-.245,.795,true);vent(.64,-.245,.825,true);
      display(.285,.153,[.795,-.378,.51],'navigation');
      display(.275,.118,[.675,-.545,.51],'climate');
      curve([[.70,-.37,left+.07],[.70,-.42,.18],[.71,-.365,.30],[.755,-.295,.50],[.79,-.365,right-.05]],.006,satin);
      box([.16,.024,.21],[.34,-.534,.48],satin,root,.012,'Tamburo controls');
      box([.068,.03,.042],[.36,-.510,.48],material({color:0x962d27,roughness:.4,metalness:.25}),root,.009,'starter cover');
      for(const z of [.40,.56])box([.098,.026,.028],[.34,-.506,z],rubber,root,.006,'drive selector');
    }else{
      display(.31,.167,[.81,-.295,.47],'navigation');vent(.37,-.435,.68);vent(.56,-.435,.69);
      display(.255,.067,[.688,-.53,.47],'climate',.007);
      box([.075,.11,.045],[.36,-.49,.46],glossy,root,.015,'drive selector');
      box([.04,.023,.07],[.36,-.43,.46],satin,root,.009);
    }
  }

  // Wheel rim, padded hub, spokes, switch packs and stalks occupy physical space.
  const steering=new THREE.Group();steering.name='reference steering wheel';steering.position.set(.58,-.30,0);root.add(steering);
  if(angular){
    const points=family==='cybertruck'?[[0,.12,-.14],[0,.145,-.08],[0,.145,.08],[0,.12,.14],[0,-.10,.145],[0,-.13,.10],[0,-.13,-.10],[0,-.10,-.145]]:[[0,.155,-.05],[0,.125,-.13],[0,.02,-.178],[0,-.10,-.145],[0,-.14,-.08],[0,-.14,.08],[0,-.10,.145],[0,.02,.178],[0,.125,.13],[0,.155,.05]];
    curve(points,.0165,leather,steering,true);
  }else{const rim=mesh(new THREE.TorusGeometry(.177,.017,10,56),leather,[0,0,0],steering);rim.rotation.y=-Math.PI/2;}
  for(const side of [-1,1]){
    const spoke=box([.019,.027,.105],[0,-.012,side*.100],satin,steering,.008);spoke.rotation.x=side*-.18;
    box([.018,.033,.067],[-.018,-.009,side*.098],rubber,steering,.007,'wheel switch pod');
    if(!classic){
      const scroll=mesh(new THREE.CylinderGeometry(.007,.007,.019,10),satin,[-.030,-.006,side*.101],steering);scroll.rotation.x=Math.PI/2;
      for(const dy of [-.009,.009])box([.002,.004,.012],[-.029,dy,side*.125],stitch,steering,.001);
    }
  }
  box([.025,.086,.041],[0,-.093,0],rubber,steering,.011,'lower wheel spoke');
  box([.006,.064,.022],[-.016,-.095,0],satin,steering,.005,'lower spoke satin inset');
  box([.045,.083,.112],[-.016,-.012,0],leather,steering,.025,'padded wheel hub');
  box([.002,.017,.024],[-.041,-.008,0],satin,steering,.004,'hub badge');
  rod([.61,-.32,0],[.89,-.42,0],.030,lower);
  for(const sign of [-1,1]){
    rod([.69,-.32,sign*.035],[.67,-.31,sign*.143],.007,rubber);
    box([.031,.023,.046],[.666,-.31,sign*.155],rubber,root,.009,'column stalk');
    if(!classic&&!minimal){const paddle=box([.014,.084,.031],[.612,-.278,sign*.13],satin,root,.01,'fixed shift paddle');paddle.rotation.x=sign*.16;}
  }

  const mirrorAnchor=new THREE.Group();mirrorAnchor.position.set(.83,.19,.39);mirrorAnchor.name='interior rear-view mirror';root.add(mirrorAnchor);
  box([.035,.075,.215],[0,0,0],rubber,mirrorAnchor,.017);
  const mirrorMat=displayMaterial();mirrorMat.color.setHex(0x678087);
  const mirrorSurface=plane(.190,.055,[-.021,0,0],mirrorMat,mirrorAnchor,'rear-view mirror surface');
  mirrorAnchor.mirrorSurface=mirrorSurface;rod([.05,.025,0],[.13,.115,0],.009,rubber,mirrorAnchor);
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
      c.font=`500 ${w*.068}px sans-serif`;c.fillText(kind==='speed'?'km/h':kind==='fuel'?'TANK':data.rpm!==null?'RPM ×1000':'POWER kW',w/2,h*.68);
      if(kind==='speed'){c.fillStyle='#252c2c';c.fillRect(w*.32,h*.77,w*.36,h*.12);c.fillStyle=amber;c.font=`500 ${w*.085}px monospace`;c.fillText(String(Math.round(data.speed)).padStart(3,'0'),w/2,h*.83);}
    }else if(kind==='cluster'){
      c.fillStyle='#26313a';c.beginPath();c.moveTo(0,h);c.lineTo(w*.16,0);c.lineTo(w*.84,0);c.lineTo(w,h);c.closePath();c.fill();
      c.strokeStyle=family==='urus'?'#d2b475':'#5caead';c.lineWidth=8;c.beginPath();c.arc(w*.5,h*.62,h*.48,Math.PI*.86,Math.PI*2.14);c.stroke();
      c.fillStyle='#f0f4f7';c.font=`500 ${h*.40}px sans-serif`;c.fillText(String(Math.round(data.speed)),w*.5,h*.52);c.font=`400 ${h*.09}px sans-serif`;c.fillText('km/h',w*.5,h*.78);
      c.fillStyle='#b8c8d0';c.font=`500 ${h*.17}px sans-serif`;c.fillText(data.gear,w*.17,h*.48);
      c.font=`400 ${h*.075}px sans-serif`;c.fillText(`${Math.round(data.powerKW)} kW`,w*.83,h*.49);c.fillText(`${Math.round(data.gasFraction*100)}%`,w*.83,h*.69);
    }else if(kind==='tablet'||kind==='navigation'){
      c.fillStyle=kind==='tablet'?'#e1e4e1':'#172126';c.fillRect(0,0,w,h);
      const start=kind==='tablet'?w*.35:0;
      c.strokeStyle=kind==='tablet'?'#bec8c4':'#334348';c.lineWidth=14;
      for(let i=0;i<6;i++){c.beginPath();c.moveTo(start+i*w*.15,0);c.lineTo(start+i*w*.15-w*.1,h);c.stroke();}
      for(let i=0;i<5;i++){c.beginPath();c.moveTo(start,i*h*.26);c.lineTo(w,i*h*.26+h*.16);c.stroke();}
      c.fillStyle='#4385ab';c.beginPath();c.moveTo(w*.68,h*.43);c.lineTo(w*.65,h*.62);c.lineTo(w*.72,h*.62);c.closePath();c.fill();
      c.fillStyle=kind==='tablet'?'#f4f5f3':'#11191f';c.fillRect(0,0,kind==='tablet'?start:w*.32,h);
      c.fillStyle=kind==='tablet'?'#20282d':'#e8eef0';c.font=`500 ${h*.31}px sans-serif`;c.fillText(String(Math.round(data.speed)),w*.16,h*.30);c.font=`500 ${h*.075}px sans-serif`;c.fillText('km/h',w*.16,h*.51);c.font=`500 ${h*.095}px sans-serif`;c.fillText(data.gear,w*.16,h*.76);
      c.fillStyle=kind==='tablet'?'#c3ccc8':'#435157';c.fillRect(w*.04,h*.91,w*.24,h*.012);
    }else if(kind==='climate'){
      c.fillStyle='#cbd7df';c.font=`400 ${h*.28}px sans-serif`;c.fillText('22.0°',w*.19,h*.40);c.fillText('22.0°',w*.81,h*.40);c.font=`400 ${h*.12}px sans-serif`;c.fillText('AUTO',w*.50,h*.35);
      for(let i=0;i<5;i++){c.fillStyle=i<3?'#adbdc7':'#303c43';c.fillRect(w*(.37+i*.055),h*.64,w*.035,h*.07);}
    }else if(kind==='radio'){
      c.fillStyle=amber;c.font=`500 ${h*.33}px monospace`;c.textAlign='left';c.fillText(`${Math.round(data.speed)} km/h`,w*.07,h*.43);c.textAlign='right';c.fillText(data.gear,w*.93,h*.43);c.fillStyle='#3c3b32';for(let i=0;i<5;i++)c.fillRect(w*(.07+i*.185),h*.77,w*.12,h*.04);
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
      const key=kind==='climate'||kind==='fuel'?'fixed':kind==='power'?(data.rpm===null?'power':'rpm'):kind==='cluster'?[Math.round(data.speed),data.gear,Math.round(data.powerKW/5),Math.round(data.gasFraction*100)].join('|'):[Math.round(data.speed),data.gear].join('|');
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
