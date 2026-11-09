import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const page=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const main=await readFile(new URL('../dist/js/main.js',import.meta.url),'utf8');

test('assessment entry exposes landing and structure, without retired driving controls',()=>{
  assert.deepEqual([...page.matchAll(/data-mode="([^"]+)"/g)].map(m=>m[1]),['lab','inspect']);
  for(const id of ['level-demo','collision-demo','stage-start','coast-test','brake-test','model-file','params-open','drive-panel'])assert.ok(!page.includes('id="'+id+'"'),id+' must not remain an interactive feature');
  assert.ok(!page.includes('data-key='),'manual propulsion controls are removed');
  for(const source of ['controls.js','flight-plan.js','friction-experiment.js','stage.js'])assert.ok(!main.includes("from './"+source),'retired controllers are not loaded by the entry');
  assert.match(main,/landingRun&&!vehicleLoading&&!paused&&mode==='lab'/,'only a controlled landing trial advances physics');
  assert.match(main,/sim\.step\(LANDING_STEP,landingRunInput\(landingRun,sim\)\)/,'landing controller is the sole active input source');
});

test('retained static controls have unique IDs and entry bindings resolve',()=>{
  const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const bindings=[...main.matchAll(/(?<!\$)\$\('([\w-]+)'\)/g)].map(m=>m[1]);
  for(const id of bindings)assert.ok(ids.includes(id),'missing element '+id);
  for(const id of ['landing-lab','vehicle-select','explode','part-buttons','ground-force','peak-force','touchdown-speed'])assert.ok(ids.includes(id));
});
