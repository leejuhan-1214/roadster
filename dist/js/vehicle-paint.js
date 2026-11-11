import * as THREE from 'three';
import {PAINT_OVERRIDES} from './vehicle-paint-profiles.js?v=20261111-paint1';

const clamp=THREE.MathUtils.clamp;
/** Explicit exterior bindings take precedence over the imported catalog hints. */
export function vehiclePaintRule(profile,mesh,material,isWheel=false){
  if(isWheel||/steer|driving_wheel|pedal|seat|interior|cockpit|carpet/i.test(mesh.name))return null;
  const overrides=PAINT_OVERRIDES[profile.id];
  const rules=overrides||[{materials:profile.paintMaterials||[profile.paint],mode:'surface'}];
  for(const rule of rules){
    if(rule.materials&&!rule.materials.includes(material.name))continue;
    if(rule.meshPattern&&!new RegExp(rule.meshPattern).test(mesh.name))continue;
    if(rule.excludePattern&&new RegExp(rule.excludePattern).test(mesh.name))continue;
    if(/glass|windscreen|windshield/i.test(material.name))continue;
    return rule;
  }
  return null;
}

// Small one-time sampling preserves texture shading without multiplying the new
// paint by the old red/blue pigment. Images remain shared, read-only GPU assets.
function textureBrightness(texture){
  if(!texture?.image)return 1;
  try{
    let pixels=texture.image.data;
    if(!pixels&&typeof document!=='undefined'){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=48;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(texture.image,0,0,48,48);pixels=ctx.getImageData(0,0,48,48).data;
    }
    if(!pixels)return 1;
    const values=[];const step=Math.max(4,Math.floor(pixels.length/4096/4)*4);
    for(let i=0;i<pixels.length;i+=step){if(pixels[i+3]<32)continue;const peak=Math.max(pixels[i],pixels[i+1],pixels[i+2])/255;if(peak>.07)values.push(peak);}
    if(!values.length)return 1;values.sort((a,b)=>a-b);
    const srgb=values[Math.floor(values.length*.72)];return texture.colorSpace===THREE.SRGBColorSpace?new THREE.Color().setRGB(srgb,srgb,srgb,THREE.SRGBColorSpace).r:srgb;
  }catch{return 1;}
}

function installPaintShader(material){
  const config=material.userData.vehiclePaint;if(!config?.shader)return;
  const rects=(config.uvRects||[]).slice(0,4).map(r=>new THREE.Vector4(...r));while(rects.length<4)rects.push(new THREE.Vector4(-2,-2,-1,-1));
  const source=new THREE.Color().fromArray(config.base),colors=(config.sourceColors||[]).map(c=>new THREE.Color(c));
  while(colors.length<4)colors.push(colors.at(-1)?.clone()||source.clone());
  material.onBeforeCompile=shader=>{
    shader.uniforms.vehiclePaintBase={value:source};
    shader.uniforms.vehiclePaintUV={value:rects};shader.uniforms.vehiclePaintUseUV={value:config.uvRects?.length?1:0};
    shader.uniforms.vehiclePaintReference={value:config.reference};
    shader.uniforms.vehiclePaintColors={value:colors.slice(0,4)};
    shader.uniforms.vehiclePaintAtlas={value:config.mode==='atlas'?1:0};
    shader.uniforms.vehiclePaintTolerance={value:config.tolerance??.27};
    shader.uniforms.vehiclePaintMaxBrightness={value:config.maxBrightness??2};
    shader.fragmentShader=`uniform float vehiclePaintMaxBrightness;
uniform vec4 vehiclePaintUV[4];
uniform float vehiclePaintUseUV;
uniform vec3 vehiclePaintBase;
uniform float vehiclePaintReference;
uniform vec3 vehiclePaintColors[4];
uniform float vehiclePaintAtlas;
uniform float vehiclePaintTolerance;
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 vehicleSelectedColor=diffuseColor.rgb;
      diffuseColor.rgb=vehiclePaintBase;
      #include <map_fragment>
    `).replace('#include <color_fragment>',`
      #include <color_fragment>
      vec3 vehicleSourceColor=diffuseColor.rgb;
      float vehiclePeak=max(max(vehicleSourceColor.r,vehicleSourceColor.g),vehicleSourceColor.b);
      float vehicleMask=1.0;
      if(vehiclePaintAtlas>0.5){
        vehicleMask=0.0;
        vec3 chroma=vehicleSourceColor/max(vehiclePeak,0.001);
        for(int i=0;i<4;i++){
          vec3 ref=vehiclePaintColors[i];
          ref/=max(max(max(ref.r,ref.g),ref.b),0.001);
          float distanceToPaint=length(chroma-ref);
          vehicleMask=max(vehicleMask,1.0-smoothstep(vehiclePaintTolerance*.55,vehiclePaintTolerance,distanceToPaint));
        }
        vehicleMask*=smoothstep(0.012,0.045,vehiclePeak);
        vehicleMask*=1.0-smoothstep(vehiclePaintMaxBrightness*.8,vehiclePaintMaxBrightness,vehiclePeak);
      }
      #ifdef USE_MAP
      if(vehiclePaintUseUV>0.5){
        float uvMask=0.0;
        for(int i=0;i<4;i++){
          vec4 r=vehiclePaintUV[i];
          uvMask=max(uvMask,step(r.x,vMapUv.x)*step(r.y,vMapUv.y)*step(vMapUv.x,r.z)*step(vMapUv.y,r.w));
        }
        vehicleMask*=uvMask;
      }
      #endif
      float vehicleShade=clamp(vehiclePeak/max(vehiclePaintReference,0.015),0.0,1.15);
      diffuseColor.rgb=mix(vehicleSourceColor,vehicleSelectedColor*vehicleShade,vehicleMask);
    `);
  };
  material.customProgramCacheKey=()=> 'vehicle-paint-v1';
  material.needsUpdate=true;
}

/** Configure only a cloned material belonging to a known painted body surface. */
export function prepareVehiclePaint(material,rule={mode:'surface'}){
  const base=material.color.clone();
  const referenceColor=rule.sourceColor?new THREE.Color(rule.sourceColor):base;
  const reference=rule.referenceBrightness??Math.max(referenceColor.r,referenceColor.g,referenceColor.b)*(rule.sourceColor?1:textureBrightness(material.map));
  material.userData.vehiclePaint={mode:rule.mode||'surface',uvRects:rule.uvRects,maxBrightness:rule.maxBrightness,base:base.toArray(),reference:clamp(reference,.015,1),sourceColors:rule.sourceColors||(rule.sourceColor?[rule.sourceColor]:[]),tolerance:rule.tolerance,shader:!!(material.map||material.vertexColors||rule.mode==='atlas')};
  material.metalness=.65;material.roughness=.27;material.opacity=1;material.transparent=false;material.depthWrite=true;
  if('transmission'in material)material.transmission=0;
  installPaintShader(material);return material;
}

/** Three.js Material.clone omits shader callbacks; reinstall with owned uniforms. */
export function copyVehiclePaint(source,target){
  if(source.userData.vehiclePaint){target.userData.vehiclePaint=structuredClone(source.userData.vehiclePaint);installPaintShader(target);}
  return target;
}
