import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {Box3,Vector3} from 'three';
import {VEHICLES} from '../dist/js/vehicle-profiles.js';
import {loadModelGeometry} from './model-loader-helper.mjs';

const wheelPositions=['FrontLeft','FrontRight','RearLeft','RearRight'];
const classics=VEHICLES.filter(p=>p.id.startsWith('sd-36gp-'));

function wheelGeometry(scene,role,position){
  let geometry;
  scene.traverse(mesh=>{
    if(mesh.isMesh&&mesh.name.startsWith(role+'_'+position+'_'))geometry=mesh.geometry;
  });
  assert.ok(geometry,'missing '+position+' '+role);
  return geometry;
}

for(const profile of classics)test(profile.id+' maps the complete wire-spoke image around each wheel axis',async()=>{
  const buffer=await readFile(new URL('../dist/assets/vehicles/'+profile.id+'.glb',import.meta.url));
  const jsonSize=buffer.readUInt32LE(12);
  const json=JSON.parse(buffer.subarray(20,20+jsonSize));
  const atlas=json.images.find(image=>image.name==='wheel3d-0.png');
  assert.equal(atlas?.mimeType,'image/png');
  const pngStart=28+jsonSize+(json.bufferViews[atlas.bufferView].byteOffset||0);
  assert.deepEqual([buffer.readUInt32BE(pngStart+16),buffer.readUInt32BE(pngStart+20)],[512,256],
    'the stationary spoke pattern occupies the complete left square of this atlas');

  const {scene}=await loadModelGeometry(profile);
  for(const position of wheelPositions){
    const tire=wheelGeometry(scene,'Tire',position);
    const rim=wheelGeometry(scene,'Rim',position);
    const bounds=new Box3().setFromBufferAttribute(tire.attributes.position);
    const center=bounds.getCenter(new Vector3());
    const radius=(bounds.max.y-bounds.min.y)/2;
    let samples=0,cosine=0,sine=0;
    for(let i=0;i<rim.attributes.position.count;i++){
      const uv=rim.attributes.uv,p=rim.attributes.position;
      const x=p.getX(i)-center.x,y=p.getY(i)-center.y;
      const u=uv.getX(i),v=uv.getY(i);
      // Ignore the hub at the centre and the brake/tread artwork on the right.
      if(u>=.5||Math.hypot(x,y)<radius*.40)continue;
      const faceAngle=Math.atan2(y,position.endsWith('Left')?x:-x);
      const imageAngle=Math.atan2(.5-v,(u-.25)*2);
      cosine+=Math.cos(faceAngle-imageAngle);
      sine+=Math.sin(faceAngle-imageAngle);
      samples++;
    }
    assert.ok(samples>=12,position+' has a complete ring of spoke samples');
    assert.ok(Math.hypot(cosine,sine)/samples>.995,position+' spoke angles share the physical hub centre');
  }
});

test('911 GT1-98 has separate authored rims and tire treads at all four wheel positions',async()=>{
  const profile=VEHICLES.find(p=>p.id==='sd-sgtp-boxer-gt98');
  const {scene}=await loadModelGeometry(profile);
  for(const position of wheelPositions){
    const rim=wheelGeometry(scene,'Rim',position);
    const tire=wheelGeometry(scene,'Tire',position);
    const bounds=g=>new Box3().setFromBufferAttribute(g.attributes.position).getSize(new Vector3());
    const outer=bounds(tire),inner=bounds(rim);
    assert.ok(inner.x<outer.x*.90&&inner.x>outer.x*.70,position+' rim fits inside the sidewall');
    assert.ok(inner.z>outer.z*.50,position+' rim has depth inside the tire');
    assert.ok(rim.attributes.position.count>300,position+' authored three-dimensional spoke assembly');
  }
});
