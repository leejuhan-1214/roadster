import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {FloatType} from 'three';
import {HDRLoader} from '../dist/vendor/addons/loaders/HDRLoader.js';
import {SKY_ASSET_URL,SKY_SOURCE} from '../dist/js/sky-environment.js';

test('bundled photographed sky is a complete licensed HDR with its original checksum',async()=>{
  const metadata=JSON.parse(await fs.readFile(new URL('../dist/assets/environment/sky/provenance.json',import.meta.url)));
  const bytes=await fs.readFile(new URL(SKY_ASSET_URL));
  assert.equal(bytes.length,metadata.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
  assert.equal(createHash('md5').update(bytes).digest('hex'),metadata.publisherMd5);
  assert.equal(metadata.license,SKY_SOURCE.license);
  const hdr=new HDRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(hdr.width,2048);assert.equal(hdr.height,1024);
  let peak=0,peakPixel=0;
  for(let i=0;i<hdr.data.length;i+=4){
    const luminance=.2126*hdr.data[i]+.7152*hdr.data[i+1]+.0722*hdr.data[i+2];
    assert.ok(Number.isFinite(luminance)&&luminance>=0);
    if(luminance>peak){peak=luminance;peakPixel=i/4;}
  }
  assert.ok(peak>100,'unclipped source preserves sunlight rather than an LDR preview');
  // This also catches a flipped panorama or a stale shadow direction.
  const azimuth=((peakPixel%hdr.width+.5)/hdr.width-.5)*2*Math.PI;
  const elevation=(.5-(Math.floor(peakPixel/hdr.width)+.5)/hdr.height)*Math.PI;
  const direction=[Math.cos(elevation)*Math.cos(azimuth),Math.sin(elevation),Math.cos(elevation)*Math.sin(azimuth)];
  for(let i=0;i<3;i++)assert.ok(Math.abs(direction[i]-SKY_SOURCE.sunDirection[i])<.005);
});
