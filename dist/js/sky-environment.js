import {EquirectangularReflectionMapping,PMREMGenerator,Vector3} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

// Photographed CC0 sky, bundled locally: no runtime request to an asset service.
// It supplies both the visible sky and the reflections on paint, glass and leaves.
export const SKY_ASSET_URL=new URL('../assets/environment/sky/kloppenheim_03_puresky_2k.hdr',import.meta.url).href;
export const SKY_SOURCE=Object.freeze({
  title:'Kloppenheim 03 (Pure Sky)',
  authors:'Greg Zaal, Jarod Guest',
  url:'https://polyhaven.com/a/kloppenheim_03_puresky',
  license:'CC0-1.0',
  // Brightest source pixel (1229,178), 2048×1024, HDRLoader flipY=true.
  sunDirection:Object.freeze([0.4198,0.8536,0.3085])
});

/**
 * Replace the fallback sky only after the HDR and filtered reflections are ready.
 * A scene background stays infinitely far away, including high-altitude drops.
 * Keep the old sphere hidden after success; it would otherwise cover this sky.
 */
export async function loadRealSky(scene,renderer,{backgroundIntensity=1,environmentIntensity=.7}={}){
  const background=await new HDRLoader().loadAsync(SKY_ASSET_URL);
  background.name=SKY_SOURCE.title;
  background.mapping=EquirectangularReflectionMapping;
  let generator,target;
  try{
    generator=new PMREMGenerator(renderer);
    target=generator.fromEquirectangular(background);
  }catch(error){
    background.dispose();throw error;
  }finally{generator?.dispose();}
  const previous={background:scene.background,environment:scene.environment,
    backgroundIntensity:scene.backgroundIntensity,environmentIntensity:scene.environmentIntensity,
    backgroundRotation:scene.backgroundRotation.clone(),environmentRotation:scene.environmentRotation.clone()};
  scene.background=background;scene.environment=target.texture;
  scene.backgroundIntensity=backgroundIntensity;scene.environmentIntensity=environmentIntensity;
  scene.backgroundRotation.set(0,0,0);scene.environmentRotation.set(0,0,0);
  let disposed=false;
  return {background,environment:target.texture,target,source:SKY_SOURCE,
    sunDirection:new Vector3(...SKY_SOURCE.sunDirection).normalize(),
    dispose(){
      if(disposed)return;disposed=true;
      if(scene.background===background){
        scene.background=previous.background;scene.backgroundIntensity=previous.backgroundIntensity;
        scene.backgroundRotation.copy(previous.backgroundRotation);
      }
      if(scene.environment===target.texture){
        scene.environment=previous.environment;scene.environmentIntensity=previous.environmentIntensity;
        scene.environmentRotation.copy(previous.environmentRotation);
      }
      target.dispose();background.dispose();
    }
  };
}
