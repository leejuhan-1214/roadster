import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Group,Mesh,PlaneGeometry,MeshStandardMaterial,Texture,SRGBColorSpace,NoColorSpace} from 'three';
import {applyCitySurfaces,CITY_SURFACE_ASSETS} from '../dist/js/city-surfaces.js';

function fixture(){
  const root=new Group();
  for(const name of ['OSM road network','real road sidewalks']){
    const mesh=new Mesh(new PlaneGeometry(4,4),new MeshStandardMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}));
    mesh.name=name;root.add(mesh);
  }
  return {root};
}

test('photographed pavement files match original publisher hashes and fit the download budget',async()=>{
  const dir=new URL('../dist/assets/environment/road/',import.meta.url);
  const metadata=JSON.parse(await fs.readFile(new URL('provenance.json',dir)));
  let total=0;
  assert.equal(metadata.license,'CC0-1.0');
  assert.equal(metadata.files.length,4);
  for(const file of metadata.files){
    const bytes=await fs.readFile(new URL(file.file,dir));total+=bytes.length;
    assert.equal(bytes.length,file.bytes);assert.equal(bytes.readUInt16BE(0),0xffd8);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    assert.equal(createHash('md5').update(bytes).digest('hex'),file.publisherMd5);
  }
  assert.ok(total<4_000_000);assert.equal(total,3_568_770);
});

test('road maps preserve shared world scale and correct color spaces without changing geometry',async()=>{
  const city=fixture(),original=city.root.children.map(mesh=>({material:mesh.material,geometry:mesh.geometry}));
  let requests=0;
  const loader={async loadAsync(){requests++;return new Texture();}};
  const pending=applyCitySurfaces(city,{capabilities:{getMaxAnisotropy:()=>16}},{loader});
  assert.equal(applyCitySurfaces(city,null,{loader}),pending,'concurrent loads share one request');
  const result=await pending;assert.equal(result.loaded,true);assert.equal(requests,4);
  CITY_SURFACE_ASSETS.forEach((asset,i)=>{
    const texture=result.textures[i];assert.equal(texture.repeat.x,4/asset.metres);
    assert.equal(texture.colorSpace,asset.color?SRGBColorSpace:NoColorSpace);assert.equal(texture.anisotropy,8);
  });
  city.root.children.forEach((mesh,i)=>{assert.equal(mesh.geometry,original[i].geometry);assert.equal(mesh.material.polygonOffsetUnits,-4);});
  result.dispose();
  city.root.children.forEach((mesh,i)=>assert.equal(mesh.material,original[i].material));
});

test('partial asset failure releases loaded maps and leaves playable fallback materials intact',async()=>{
  const city=fixture(),original=city.root.children.map(mesh=>mesh.material);let requests=0,disposed=0;
  const result=await applyCitySurfaces(city,null,{loader:{async loadAsync(){
    if(requests++===1)throw new Error('download unavailable');
    const texture=new Texture();texture.addEventListener('dispose',()=>disposed++);return texture;
  }}});
  assert.equal(result.loaded,false);assert.equal(disposed,3);
  city.root.children.forEach((mesh,i)=>assert.equal(mesh.material,original[i]));
});

test('four-storey bay maps align albedo, dielectric glass, metal frames and recessed jambs',async()=>{
  const city=fixture(),original=new MeshStandardMaterial({vertexColors:true,roughness:.68});
  const facade=new Mesh(new PlaneGeometry(3.2,3.4),original);facade.name='OSM building facades';city.root.add(facade);
  const curtain=facade.clone();curtain.name='office curtain walls';city.root.add(curtain);
  const result=await applyCitySurfaces(city,null,{loader:{async loadAsync(){return new Texture();}}});
  const surface=facade.material.roughnessMap;
  for(const {material} of [facade,curtain]){
    const packed=material.roughnessMap,at=(x,y)=>(y*packed.image.width+x)*4;
    assert.equal(material.metalnessMap,packed);assert.equal(material.bumpMap,packed);
    assert.equal(packed.colorSpace,NoColorSpace);assert.equal(material.map.colorSpace,SRGBColorSpace);
    assert.equal(packed.image.width,192);assert.deepEqual(packed.repeat.toArray(),[.25,.25]);
    assert.deepEqual(packed.repeat.toArray(),material.map.repeat.toArray());
    assert.equal(material.vertexColors,true,'retain per-building facade colors');
    const glass=at(15,20),frame=at(23,20),bytes=packed.image.data;
    assert.equal(bytes[glass+2],0,'glass is dielectric');assert.ok(bytes[frame+2]>120);
    assert.ok(bytes[glass]<bytes[frame],'astragals project in front of glazing');
    assert.ok(bytes[glass+1]<bytes[frame+1],'polished glass has a narrower reflection');
    assert.notEqual(material.map.image.data[glass],material.map.image.data[at(15+48,20+48)],'adjacent bays have independent interiors');
  }
  assert.ok(surface.image.data[(20*192+2)*4+1]>200,'the masonry around the reveal is rough');
  let disposed=0;surface.addEventListener('dispose',()=>disposed++);
  result.dispose();assert.equal(facade.material,original);assert.equal(curtain.material,original);assert.equal(disposed,1);
});
