import * as THREE from 'three';
import {CITY_ROAD_LEVELS as surfaceY} from './city-road-levels.js?v=20261122-wheel-repair';
import {sampleCourse} from './station-race-course.js?v=20261119-ai158';

export const CIRCUIT_BASIN={minX:165,maxX:505,minZ:-58,maxZ:82,waterY:-4.6};

// Indexed, flat-shaded faces share a draw across a whole architectural section.
// In X/Z a positive winding faces down, hence the reversal on prism roofs.
function batch(){
  const positions=[],colors=[],normals=[],indices=[],palette=new Map();
  function face(points,color){
    const start=positions.length/3;
    let tint=palette.get(color);
    if(!tint){tint=new THREE.Color(color);palette.set(color,tint);}
    const [a,b,c]=points;
    const ax=b[0]-a[0],ay=b[1]-a[1],az=b[2]-a[2],bx=c[0]-a[0],by=c[1]-a[1],bz=c[2]-a[2];
    const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,length=Math.hypot(nx,ny,nz);
    for(const p of points){
      positions.push(p[0],p[1],p[2]);colors.push(tint.r,tint.g,tint.b);
      normals.push(nx/length,ny/length,nz/length);
    }
    for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
  }
  function finish(root,name,material){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    g.setIndex(indices);g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);
    mesh.name=name;mesh.receiveShadow=true;root.add(mesh);
    return mesh;
  }
  return {face,finish};
}

const steel=0x526376,alloy=0x8b9aaa,copper=0xbe8155,brass=0xd5a681;
const fascia=0x283849,concrete=0x788292,glazing=0x305061;
const trimMaterials=()=>[
  new THREE.MeshStandardMaterial({vertexColors:true,metalness:.42,roughness:.43}),
  new THREE.MeshBasicMaterial({vertexColors:true})
];

function solid(section,foot,base,top,color,obstacles,id){
  const area=foot.reduce((n,a,i)=>{const b=foot[(i+1)%foot.length];return n+a[0]*b[1]-b[0]*a[1];},0);
  const ring=area>0?foot:[...foot].reverse();
  const lower=ring.map(([x,z])=>[x,base,z]),upper=ring.map(([x,z])=>[x,top,z]);
  section.face(lower,color);section.face([...upper].reverse(),color);
  for(let i=0;i<ring.length;i++){
    const j=(i+1)%ring.length;
    section.face([lower[i],upper[i],upper[j],lower[j]],color);
  }
  if(!id)return;
  const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  obstacles.push({id,kind:'prism',footprint:ring,center:[(x0+x1)/2,(top+base)/2,(z0+z1)/2],
    size:[x1-x0,top-base,z1-z0]});
}

function rect(x0,z0,x1,z1){return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]];}

function tidalWater(root){
  const {minX,maxX,minZ,maxZ,waterY}=CIRCUIT_BASIN;
  // Project the reflected view ray onto the two quay elevations and bridge
  // arch. This single surface pass needs no secondary camera or scene render.
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    tideTime:{value:0},banks:{value:new THREE.Vector2(minZ,maxZ)},waterHeight:{value:waterY}
  }]);
  const material=new THREE.ShaderMaterial({uniforms,fog:true,
    vertexShader:`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 worldWater;
      void main(){
        worldWater=(modelMatrix*vec4(position,1.)).xyz;
        vec4 mvPosition=viewMatrix*vec4(worldWater,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`
      #include <common>
      #include <fog_pars_fragment>
      uniform float tideTime,waterHeight;
      uniform vec2 banks;
      varying vec3 worldWater;
      void main(){
        vec2 p=worldWater.xz;
        float longWave=sin(p.y*1.46+p.x*.22+tideTime+sin(p.x*.19));
        float shortWave=sin(p.y*3.1-p.x*.43-tideTime*1.44+longWave*.7);
        float across=sin(p.x*.52+p.y*.71+tideTime*.67);
        vec3 normal=normalize(vec3(.030*across+.015*longWave,1.,.064*longWave+.025*shortWave));
        vec3 viewRay=normalize(cameraPosition-worldWater);
        vec3 ray=reflect(-viewRay,normal);
        float fresnel=.12+.88*pow(1.-clamp(dot(normal,viewRay),0.,1.),4.);
        vec3 sky=mix(vec3(.095,.177,.244),vec3(.27,.39,.47),smoothstep(.33,1.,1.-ray.y));
        float bank=ray.z<0.?banks.x:banks.y;
        float bankT=abs(bank-p.y)/max(abs(ray.z),.045);
        float hitX=p.x+ray.x*bankT,hitY=waterHeight+ray.y*bankT;
        float cell=fract((hitX-176.)/17.+.5)-.5;
        float bankLength=smoothstep(162.,171.,hitX)*(1.-smoothstep(499.,508.,hitX));
        float pool=bankLength*exp(-cell*cell*34.)*exp(-abs(hitY-1.2)*.22);
        float ripple=.38+.62*smoothstep(-.6,.7,longWave+.48*shortWave);
        vec3 lamp=bank<0.?vec3(.25,.82,1.):vec3(1.,.54,.26);
        vec3 reflection=mix(vec3(.026,.065,.083),sky,smoothstep(-.7,2.2,hitY));
        reflection+=lamp*pool*ripple*.88;
        // Copper arch and dark hangers break up the reflection near the deck.
        float girderZ=p.y<0.?-13.75:13.75;
        float archT=(girderZ-p.y)/(abs(ray.z)>.045?ray.z:.045);
        float archX=p.x+ray.x*archT,u=(archX-179.)/312.;
        if(archT>0.&&u>0.&&u<1.){
          float h=.56+172.*u*(1.-u),y=waterHeight+ray.y*archT;
          float arch=1.-smoothstep(.55,1.7,abs(y-h-.75));
          float hanger=abs(fract(25.*u+.5)-.5);
          if(y>1.3&&y<h)reflection*=.56+.44*smoothstep(.015,.07,hanger);
          reflection=mix(reflection,vec3(.53,.31,.18),arch*.76);
        }
        vec3 water=mix(vec3(.014,.087,.098),reflection,.38+.62*fresnel);
        gl_FragColor=vec4(water,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const surface=new THREE.Mesh(new THREE.PlaneGeometry(maxX-minX,maxZ-minZ),material);
  surface.rotation.x=-Math.PI/2;surface.position.set((minX+maxX)/2,waterY,(minZ+maxZ)/2);
  surface.name='Tidal basin water';root.add(surface);
  surface.onBeforeRender=()=>{uniforms.tideTime.value=(performance.now()*.00067)%6283.1853;};
}

function* tideBridge(root,obstacles,metal,lights){
  const frame=batch(),trim=batch(),{minX,maxX,minZ,maxZ}=CIRCUIT_BASIN;
  const box=(x0,z0,x1,z1,b,t,c,id)=>solid(frame,rect(x0,z0,x1,z1),b,t,c,obstacles,id);
  // Abutments sit inside all four edges of the opening. The service walk
  // continues above the arched box girders to the expansion joint at each bank.
  for(const x of [minX,maxX])box(x-.5,minZ,x+.5,maxZ,-8.2,-.13,concrete);
  for(const z of [minZ,maxZ]){
    const side=Math.sign(z),front=z-side*.58;
    box(minX,z-.5,maxX,z+.5,-8.2,-.13,0x425b65);
    box(minX,z-.78,maxX,z+.78,-.17,.40,steel,'tidal-quay-coping-'+side);
    for(let x=176;x<maxX-2;x+=17){
      box(x-.32,z-.68,x+.32,z+.68,-6.4,-.17,alloy);
      box(x-.9,z-.47,x+.9,z+.47,.40,1.62,fascia,'tidal-quay-lamp-'+side+'-'+x);
      const f=[[x-.75,.85,front],[x+.75,.85,front],[x+.75,1.50,front],[x-.75,1.50,front]];
      trim.face(side>0?[...f].reverse():f,side<0?0xa7e0ee:0xffbb81);
    }
  }
  box(minX-1,-15,maxX+1,15,-1.15,-.055,steel);
  for(const side of [-1,1]){
    const z=side*13.75;
    box(minX,z-1,maxX,z+1,-2.65,-1.15,fascia);
    box(minX,z-1.12,maxX,z+1.12,-2.72,-2.49,alloy);
    // An outboard girder with an aligned handrail makes the envelope of the
    // deck apparent even from a driver's low viewing position.
    box(minX,z-.55,maxX,z+.55,-.055,.56,steel,'tide-bridge-edge-'+side);
    box(minX,z-.27,maxX,z+.27,1.13,1.31,brass,'tide-bridge-handrail-'+side);
    for(let x=minX+1;x<maxX;x+=5){
      box(x-.08,z-.13,x+.08,z+.13,.56,1.13,alloy,'tide-bridge-baluster-'+side+'-'+x);
    }
  }
  for(const x of [181,250,335,420,489]){
    box(x-2,-14.75,x+2,14.75,-2.8,-1.15,steel);
    for(const side of [-1,1]){
      const z=side*8;
      solid(frame,[[x-3,z],[x-1.1,z-2],[x+1.1,z-2],[x+3,z],[x+1.1,z+2],[x-1.1,z+2]],
        -9,-2.75,concrete);
      box(x-3.1,z-3.2,x+3.1,z+3.2,-3.8,-2.75,alloy);
    }
  }
  yield;
  // A pair of parallel lenticular steel ribs carries vertical hangers above
  // the deck. Each collision slice follows the same sloped beam surfaces
  // within 0.22 m vertically, without blocking the space below the arch.
  const start=179,end=491,span=end-start;
  const level=x=>{const u=(x-start)/span;return .56+43*4*u*(1-u);};
  for(const side of [-1,1]){
    const z=side*13.75,thickness=1.5;
    for(let i=0;i<64;i++){
      const x=start+span*i/64,next=start+span*(i+1)/64,h=level(x),k=level(next);
      const corners=(px,base)=>[[px,base,z-.61],[px,base,z+.61],[px,base+thickness,z+.61],[px,base+thickness,z-.61]];
      const a=corners(x,h),b=corners(next,k);
      for(let j=0;j<4;j++){
        const l=(j+1)%4;
        frame.face([a[j],b[j],b[l],a[l]],j===1||j===3?copper:brass);
      }
      if(i===0)frame.face(a,brass);
      if(i===63)frame.face([...b].reverse(),brass);
      const slices=Math.max(1,Math.ceil(Math.abs(h-k)/.43));
      for(let n=0;n<slices;n++){
        const l=x+(next-x)*n/slices,r=x+(next-x)*(n+1)/slices;
        const mid=h+(k-h)*(n+.5)/slices;
        obstacles.push({id:'tide-bridge-arch-'+side+'-'+i+'-'+n,
          center:[(l+r)/2,mid+thickness/2,z],size:[r-l,thickness,1.22]});
      }
    }
    // Dark alloy hangers, copper wear shoes and short luminous mounting tabs
    // sit directly on the same rail centerline as the arch.
    for(let n=1;n<25;n++){
      const x=start+span*n/25,h=level(x);
      box(x-.105,z-.14,x+.105,z+.14,1.31,h,steel,'tide-bridge-hanger-'+side+'-'+n);
      box(x-.46,z-.27,x+.46,z+.27,1.31,1.91,copper,'tide-bridge-shoe-'+side+'-'+n);
      const inner=z-side*.28;
      const f=[[x-.38,1.62,inner],[x+.38,1.62,inner],[x+.38,1.75,inner],[x-.38,1.75,inner]];
      trim.face(side>0?[...f].reverse():f,side>0?0xffb58c:0xbce8ed);
    }
    yield;
  }
  // The shallow transverse wind braces are all above the 24 m flight band.
  for(const x of [249,291,335,379,421]){
    const h=level(x)+.67;
    box(x-.48,-13.75,x+.48,13.75,h,h+.68,steel,'tide-bridge-crossbeam-'+x);
    box(x-.54,-13.75,x+.54,13.75,h+.62,h+.77,brass,'tide-bridge-crossbeam-cap-'+x);
  }
  // Expansion joints and the recessed longitudinal service strips are paint
  // within the surface envelope and do not add a step to the wheel solver.
  for(const x of [166,249,335,421,504]){
    for(const dx of [-.13,.13]){
      const f=rect(x+dx-.045,-7.92,x+dx+.045,7.92).map(([a,b])=>[a,surfaceY.lane,b]);
      trim.face(f.reverse(),fascia);
    }
  }
  for(const side of [-1,1]){
    const z=side*7.55;
    for(let x=169;x<503;x+=4.8){
      const f=rect(x,z-.15,x+1.5,z+.15).map(([a,b])=>[a,surfaceY.centreLine,b]);
      trim.face(f.reverse(),side>0?0x92735f:0x798e9b);
    }
  }
  frame.finish(root,'Tide bridge steel arches, deck and quay',metal);
  // The deck markings share the hanger-inlay draw and its decal depth bias.
  lights.polygonOffset=true;lights.polygonOffsetFactor=-1;lights.polygonOffsetUnits=-2;
  trim.finish(root,'Tide bridge hanger inlays',lights);
  yield;
  tidalWater(root);
  yield;
}

function* stationGallery(root,obstacles,metal,lights){
  const frame=batch(),trim=batch();
  const foot=(s,l)=>{const p=sampleCourse(s,l);return [p.x,p.z];};
  const deck=(s0,s1,lo0,hi0,lo1,hi1)=>[foot(s0,lo0),foot(s1,lo1),foot(s1,hi1),foot(s0,hi0)];
  const start=878,length=138;
  function inner(t){return 17.3-11.8*Math.sin(Math.PI*t)**.8;}
  function outer(t){return 25.2+5.2*Math.sin(Math.PI*t)**.65;}
  for(const side of [-1,1]){
    for(let i=0;i<24;i++){
      const p=i/24,q=(i+1)/24,s0=start+p*length,s1=start+q*length;
      const a=inner(p),b=inner(q),c=outer(p),d=outer(q);
      const ring=(lo0,hi0,lo1,hi1)=>deck(s0,s1,side*lo0,side*hi0,side*lo1,side*hi1);
      const slab=(lo0,hi0,lo1,hi1,base,top,color,part)=>
        solid(frame,ring(lo0,hi0,lo1,hi1),base,top,color,obstacles,'station-gallery-'+side+'-'+part+'-'+i);
      // A continuous lens-shaped roof tapers into two fine tips. Its dark
      // fascia, stepped copper coping and illuminated lip are visible below.
      slab(a,c,b,d,9.32,10.00,fascia,'canopy');
      slab(a+.3,c-.35,b+.3,d-.35,10,10.32,copper,'coping');
      const [x,z]=foot(s0,side*(a-.013)),[u,v]=foot(s1,side*(b-.013));
      const face=[[x,9.52,z],[u,9.52,v],[u,9.65,v],[x,9.65,z]];
      trim.face(side>0?[...face].reverse():face,0xffd7a5);
    }
    for(let i=0;i<8;i++){
      const s=start+10+i*16.8,l=side*25.7;
      const plinth=deck(s-1.4,s+1.4,l-.85,l+.85,l-.85,l+.85);
      const leg=deck(s-.76,s+.76,l-.54,l+.54,l-.54,l+.54);
      solid(frame,plinth,0,.65,alloy,obstacles,'station-gallery-base-'+side+'-'+i);
      solid(frame,leg,.65,9.32,brass,obstacles,'station-gallery-column-'+side+'-'+i);
      // A single tram gallery behind the colonnade is glazed down to a
      // continuous sill. Its opaque glass can share the static steel draw.
      if(i>=7)continue;
      const bay=deck(s+.77,s+16.03,l+side*.34,l+side*.59,l+side*.34,l+side*.59);
      solid(frame,bay,.15,6.52,glazing,obstacles,'station-gallery-glass-'+side+'-'+i);
      for(const height of [1.02,4.82,6.52]){
        const band=deck(s+.76,s+16.04,l+side*.24,l+side*.62,l+side*.24,l+side*.62);
        solid(frame,band,height,height+.13,steel,obstacles,'station-gallery-transom-'+side+'-'+i+'-'+height);
      }
    }
    yield;
  }
  frame.finish(root,'Copper station gallery canopies and glazing',metal);
  trim.finish(root,'Station gallery soffit edge',lights);
}

export function* circuitUrbanTrackStages(root,obstacles){
  const [metal,lights]=trimMaterials();
  yield* tideBridge(root,obstacles,metal,lights);
  yield* stationGallery(root,obstacles,metal,lights);
}
