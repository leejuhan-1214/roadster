import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CITY_VEHICLES} from '../dist/js/city-fleet-profiles.js';

test('new city cars have source-specific licensed assets and explicit simulation assumptions',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../dist/assets/vehicles/city-fleet-provenance.json',import.meta.url),'utf8'));
  const byId=new Map(manifest.models.map(record=>[record.id,record]));
  assert.equal(byId.size,CITY_VEHICLES.length);
  assert.equal(new Set(CITY_VEHICLES.map(profile=>profile.id)).size,CITY_VEHICLES.length);
  const hashes=new Set();
  for(const profile of CITY_VEHICLES){
    const record=byId.get(profile.id);
    assert.equal(profile.cityOnly,true,profile.id+' is excluded from measured landing comparison');
    assert.match(profile.massBasis,/assumption.*not a published or measured/i);
    assert.match(profile.dimensionBasis,/not OEM CAD/);
    assert.equal(profile.dryMass,profile.referenceMass+profile.rigMass);
    for(const key of ['dryMass','length','width','height','wheelbase'])assert.ok(Number.isFinite(profile[key])&&profile[key]>0,profile.id+': finite '+key);
    assert.equal(record.apiStatus,200);
    assert.equal(record.apiLicense.slug,'by');
    assert.equal(profile.source,record.credit.sourceUrl);
    assert.ok(profile.author.includes(record.apiAuthor));
    assert.ok(record.orientationEvidence);
    const bytes=await readFile(new URL('../dist/assets/vehicles/'+profile.id+'.glb',import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),'glTF');
    assert.equal(bytes.length,record.actualBytes);
    const hash=createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash,record.sha256,profile.id+': pinned source bytes');
    assert.equal(hashes.has(hash),false,profile.id+': distinct model rather than a duplicate/recolor');
    hashes.add(hash);
  }
});
