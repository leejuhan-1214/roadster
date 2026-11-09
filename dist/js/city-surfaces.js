import {TextureLoader,DataTexture,RGBAFormat,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,SRGBColorSpace,NoColorSpace} from 'three';

// City geometry already shares world-aligned UVs: u=x/4, v=z/4. Preserve that
// alignment through junctions; these repeats restore each scan's physical size.
export const CITY_SURFACE_ASSETS=Object.freeze([
  {file:'asphalt_02_diff_1k.jpg',kind:'road',slot:'map',metres:3,color:true},
  {file:'asphalt_02_nor_gl_1k.jpg',kind:'road',slot:'normalMap',metres:3,color:false},
  {file:'asphalt_02_rough_1k.jpg',kind:'road',slot:'roughnessMap',metres:3,color:false},
  {file:'concrete_pavement_02_diff_1k.jpg',kind:'walk',slot:'map',metres:1.8,color:true}
].map(Object.freeze));
const loads=new WeakMap();

// Match the existing 64px facade color map exactly. G=roughness, B=metalness;
// one linear texture supplies both slots, including the opaque center mullion.
function facadeSurfaceMap(){
  const size=64,bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const glass=x>9&&x<54&&y>13&&y<55&&x!==32,index=(y*size+x)*4;
    bytes[index]=255;bytes[index+1]=glass?51:230;bytes[index+2]=glass?31:0;bytes[index+3]=255;
  }
  const texture=new DataTexture(bytes,size,size,RGBAFormat);texture.name='facade glass and masonry surface response';
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=NoColorSpace;
  texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

/**
 * Add locally bundled photographed materials without moving collision surfaces.
 * Failed downloads leave the existing procedural materials fully usable.
 * Dispose this handle before city.dispose() to release both old and new maps.
 */
export function applyCitySurfaces(city,renderer,{loader=new TextureLoader()}={}){
  if(loads.has(city))return loads.get(city);
  const promise=(async()=>{
    const meshes={road:city.root.getObjectByName('OSM road network'),walk:city.root.getObjectByName('real road sidewalks')};
    if(!meshes.road?.material||!meshes.walk?.material)return {loaded:false,error:new Error('City pavement meshes are unavailable')};
    const results=await Promise.allSettled(CITY_SURFACE_ASSETS.map(asset=>loader.loadAsync(new URL('../assets/environment/road/'+asset.file,import.meta.url).href)));
    const failure=results.find(result=>result.status==='rejected');
    if(failure){
      for(const result of results)if(result.status==='fulfilled')result.value.dispose();
      return {loaded:false,error:failure.reason};
    }
    const originals={road:meshes.road.material,walk:meshes.walk.material};
    const materials={road:originals.road.clone(),walk:originals.walk.clone()};
    const textures=results.map(result=>result.value);
    const anisotropy=Math.min(8,renderer?.capabilities?.getMaxAnisotropy?.()||1);
    CITY_SURFACE_ASSETS.forEach((asset,index)=>{
      const texture=textures[index];texture.name=asset.file;
      texture.wrapS=texture.wrapT=RepeatWrapping;texture.repeat.set(4/asset.metres,4/asset.metres);
      texture.colorSpace=asset.color?SRGBColorSpace:NoColorSpace;texture.anisotropy=anisotropy;
      texture.needsUpdate=true;materials[asset.kind][asset.slot]=texture;
    });
    for(const material of Object.values(materials)){
      material.color.set(0xffffff);material.vertexColors=false;material.metalness=0;material.needsUpdate=true;
    }
    materials.road.color.set(0xb5b5b5);materials.road.roughness=1;materials.road.normalScale.set(.65,.65);
    materials.walk.roughness=.92;
    meshes.road.material=materials.road;meshes.walk.material=materials.walk;
    const facade=city.root.getObjectByName('OSM building facades');
    if(facade?.material){
      meshes.facade=facade;originals.facade=facade.material;materials.facade=facade.material.clone();
      const surface=facadeSurfaceMap();surface.anisotropy=anisotropy;textures.push(surface);
      materials.facade.roughnessMap=surface;materials.facade.metalnessMap=surface;
      materials.facade.roughness=1;materials.facade.metalness=1;materials.facade.needsUpdate=true;
      facade.material=materials.facade;
    }
    let disposed=false;
    return {loaded:true,textures,materials,dispose(){
      if(disposed)return;disposed=true;
      for(const kind of Object.keys(materials)){
        if(meshes[kind].material===materials[kind])meshes[kind].material=originals[kind];
        materials[kind].dispose();
      }
      for(const texture of textures)texture.dispose();loads.delete(city);
    }};
  })();
  loads.set(city,promise);
  promise.then(result=>{if(!result.loaded)loads.delete(city);},()=>loads.delete(city));
  return promise;
}
