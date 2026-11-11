import test from 'node:test';
import assert from 'node:assert/strict';
import {LandingUI,landingResearchPlot,landingResultColor} from '../dist/js/landing-ui.js';

const base={groupId:'batch',groupSize:3,vehicleId:'roadster',vehicleTitle:'Roadster',height:3,targetSpeed:.5,springK:75000,damperC:6000,initialMass:2275,initialGas:375,tankVolume:.9,tankPressureMPa:35.875,initialTemperature:300,status:'landed',settled:true,touchdownTime:.8,touchdownSpeed:.5,contactPeakG:2,maxCompression:.1,bodyStrike:false,bottomedOut:false,manualLiftUsed:false};
const rows=[
  {...base,id:'batch-0',method:'free',brakeHeight:1.5,gasUsed:0,peakEquivalentGroundForceN:1700000,bodyStrike:true},
  {...base,id:'batch-1',method:'brake',brakeHeight:2.25,gasUsed:60,peakEquivalentGroundForceN:27500},
  {...base,id:'batch-2',method:'gentle',brakeHeight:1.5,gasUsed:130,peakEquivalentGroundForceN:30000}
].map(row=>({...row,samples:[{time:.8,equivalentGroundForceN:row.peakEquivalentGroundForceN}]}));
const nodes=()=>{const values=new Map();return selector=>{if(!values.has(selector))values.set(selector,{innerHTML:'',textContent:'',value:'',hidden:false});return values.get(selector);};};
function colorOfPoint(svg,text){const group=[...svg.matchAll(/<g class="landing-research-point"[\s\S]*?<\/g>/g)].find(match=>match[0].includes(text));assert.ok(group,'expected trial point '+text);return group[0].match(/(?:fill|stroke)="(#[0-9a-f]{6})"/)[1];}

test('one trial keeps its color in table, force trace, both scatter plots and stable-only zoom',()=>{
  const querySelector=nodes(),ui={results:rows,selectedGroup:'batch',dialog:{querySelector},renderChart(){}};
  LandingUI.prototype.renderResults.call(ui);
  const tableColors=[...querySelector('#landing-result-rows').innerHTML.matchAll(/<i style="background:(#[0-9a-f]{6})"/g)].map(match=>match[1]);
  LandingUI.prototype.renderChart.call(ui,rows);
  const traceColors=[...querySelector('#landing-force-chart').innerHTML.matchAll(/<polyline fill="none" stroke="(#[0-9a-f]{6})"/g)].map(match=>match[1]);
  assert.deepEqual(tableColors,traceColors);
  const brakeColor=tableColors[1],label='지면 전 추력 제동 · 2.25 m;';
  assert.equal(colorOfPoint(landingResearchPlot(rows,{kind:'gas'}),label),brakeColor);
  assert.equal(colorOfPoint(landingResearchPlot(rows,{kind:'height',baseline:rows[0]}),label),brakeColor);
  assert.equal(colorOfPoint(landingResearchPlot(rows.slice(1),{kind:'gas',candidates:[rows[1]]}),label),brakeColor);
  assert.equal(colorOfPoint(landingResearchPlot([rows[1]],{kind:'height'}),label),brakeColor);
  assert.equal(colorOfPoint(landingResearchPlot(rows,{kind:'gas'}),'자유 낙하;'),tableColors[0],'unsafe cross shape retains trial identity too');
});

test('trial colors remain deterministic for cloned records and records without ids',()=>{
  assert.equal(landingResultColor(rows[1]),landingResultColor({...rows[1]}));
  const {id,...withoutId}=rows[1];
  assert.equal(landingResultColor(withoutId),landingResultColor({...withoutId,samples:[]}));
  assert.match(landingResultColor({id:'<script>'}),/^#[a-f0-9]{6}$/);
});

test('standalone history traces identify release height and mass, point tooltips identify the trial',()=>{
  const querySelector=nodes(),other={...rows[1],id:'another-0',groupId:'another',height:8,initialMass:2200};
  LandingUI.prototype.renderChart.call({dialog:{querySelector}},[rows[1],other],true);
  const legend=querySelector('#landing-chart-legend').innerHTML;
  assert.match(legend,/h 3 m · 2275 kg/);assert.match(legend,/h 8 m · 2200 kg/);
  const plot=landingResearchPlot([other]);assert.match(plot,/Roadster; 출발 8 m; 지면 전 추력 제동/);
});