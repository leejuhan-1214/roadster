import * as THREE from 'three';

// Reusable, deterministic micro-surface maps. These change shading only: road
// height and tire contact still come from sampleRoadSurface in the physics model.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function hash(x,y,seed){
  let n=Math.imul(x+seed*127,374761393)^Math.imul(y+seed*43,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;
}
export function periodicNoise(u,v,cells,seed=17){
  const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y);
  const fx=x-ix,fy=y-iy,s=fx*fx*(3-2*fx),t=fy*fy*(3-2*fy);
  const sample=(a,b)=>hash(((a%cells)+cells)%cells,((b%cells)+cells)%cells,seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(ix,iy),sample(ix+1,iy),s),THREE.MathUtils.lerp(sample(ix,iy+1),sample(ix+1,iy+1),s),t);
}

export function surfacePixels(kind,size=512){
  const color=new Uint8Array(size*size*4),data=new Uint8Array(size*size*4);
  const settings={asphalt:[58,64,66],concrete:[129,132,128],painted:[44,57,64],aluminum:[176,182,181],paint:[211,212,199]};
  const base=settings[kind];if(!base)throw new Error('Unknown surface material: '+kind);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size,grain=periodicNoise(u,v,128,19),fine=hash(x,y,31),mottle=periodicNoise(u,v,8,7),broad=periodicNoise(u,v,3,29);
    let light=0,height=.5,roughness=.9;
    if(kind==='asphalt'){
      const aggregate=Math.max(0,grain-.57)*65;
      light=(fine-.5)*19+(mottle-.5)*12+(broad-.5)*7+aggregate;
      height=.36+.26*grain+.12*fine;roughness=.83+.14*grain;
    }else if(kind==='concrete'){
      const pore=fine<.025?-20:0;
      light=(mottle-.5)*20+(broad-.5)*12+(fine-.5)*10+pore;
      height=.47+.08*grain+(fine<.025?-.15:0);roughness=.82+.12*mottle;
    }else if(kind==='painted'){
      light=(fine-.5)*4+(broad-.5)*4;
      height=.5+.06*grain;roughness=.56+.12*mottle;
    }else if(kind==='aluminum'){
      const brush=periodicNoise(u,v,256,89);
      light=(hash(y,0,91)-.5)*13+(brush-.5)*5;
      height=.5+(hash(y,0,91)-.5)*.13;roughness=.3+.12*brush;
    }else{
      light=(fine-.5)*11+(mottle-.5)*9;
      height=.5+.12*grain;roughness=.84+.11*grain;
    }
    const i=(y*size+x)*4;
    color[i]=clamp(base[0]+light,0,255);color[i+1]=clamp(base[1]+light,0,255);color[i+2]=clamp(base[2]+light,0,255);color[i+3]=255;
    // R = height; G = roughness. The standard material uses the appropriate
    // channel from this shared data texture without a third texture allocation.
    data[i]=clamp(height*255,0,255);data[i+1]=clamp(roughness*255,0,255);data[i+2]=255;data[i+3]=255;
  }
  return {color,data};
}

function texture(bytes,size,color,anisotropy){
  const t=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;
  t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.anisotropy=anisotropy;t.needsUpdate=true;return t;
}

/** Metre-scale planar UVs on each dominant face; no geometry displacement. */
export function surfaceUV(geometry,metresPerTile=2){
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
  if(!p||!n)return geometry;
  const values=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){
    const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    values[i*2]=(ax>ay&&ax>az?p.getZ(i):p.getX(i))/metresPerTile;
    values[i*2+1]=(ay>ax&&ay>az?p.getZ(i):p.getY(i))/metresPerTile;
  }
  geometry.setAttribute('uv',new THREE.BufferAttribute(values,2));return geometry;
}

export function createEnvironmentMaterials(renderer){
  const anisotropy=Math.min(4,renderer?.capabilities?.getMaxAnisotropy?.()||1);
  const make=(kind,{metalness=0,bumpScale=.002,tileMetres=2}={})=>{
    const size=kind==='asphalt'||kind==='concrete'?512:256;
    const pixels=surfacePixels(kind,size),map=texture(pixels.color,size,true,anisotropy),detail=texture(pixels.data,size,false,anisotropy);
    const material=new THREE.MeshStandardMaterial({map,bumpMap:detail,roughnessMap:detail,roughness:1,bumpScale,metalness});
    material.name='environment '+kind;material.userData.tileMetres=tileMetres;return material;
  };
  const asphalt=make('asphalt',{bumpScale:.004,tileMetres:2});
  const concrete=make('concrete',{bumpScale:.002,tileMetres:4});
  const painted=make('painted',{metalness:.3,bumpScale:.0005,tileMetres:2});
  const aluminum=make('aluminum',{metalness:.88,bumpScale:.0003,tileMetres:1});
  const lanePaint=make('paint',{bumpScale:.0005,tileMetres:1});lanePaint.transparent=true;lanePaint.opacity=.88;

  // Identical world-space shading on the flat ground and the existing physical
  // road-relief overlay prevents roughness ON from covering the pad/runway finish.
  const pavement=asphalt.clone();pavement.name='world pavement';
  pavement.onBeforeCompile=shader=>{
    shader.uniforms.padMap={value:concrete.map};
    shader.vertexShader='varying vec3 vSurfaceWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vSurfaceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      #ifdef USE_BUMPMAP
        vBumpMapUv=vSurfaceWorld.xz/2.0;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=vSurfaceWorld.xz/2.0;
      #endif`);
    shader.fragmentShader='varying vec3 vSurfaceWorld;\nuniform sampler2D padMap;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      float deck=1.0-smoothstep(27.96,28.0,length(vSurfaceWorld.xz));
      float runway=(1.0-smoothstep(9.8,10.2,abs(vSurfaceWorld.z)))*smoothstep(-61.0,-60.0,vSurfaceWorld.x)*(1.0-smoothstep(189.0,190.0,vSurfaceWorld.x));
      vec3 asphaltColor=texture2D(map,vSurfaceWorld.xz/2.0).rgb*mix(1.12,.82,runway);
      vec3 padColor=texture2D(padMap,vSurfaceWorld.xz/4.0).rgb;
      diffuseColor.rgb*=mix(asphaltColor,padColor,deck);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.88,deck);');
  };
  pavement.customProgramCacheKey=()=> 'roadster-world-pavement-v1';
  return {pavement,asphalt,concrete,painted,aluminum,lanePaint};
}
