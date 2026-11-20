import test from 'node:test';
import assert from 'node:assert/strict';
import {landingConditionText,copyLandingConditions} from '../dist/js/landing-report.js';

const names={free:'자유 낙하',brake:'지정 높이 제동'};
const base={id:'1',groupId:'A',groupSize:3,vehicleTitle:'Roadster',method:'free',height:20,
  targetSpeed:.5,initialMass:2275,initialGas:375,tankVolume:.9,tankPressureMPa:35.875,
  initialTemperature:300,springK:75000,damperC:6000,modelVersion:'1.46.0',appVersion:'1.50.0',
  physicsStep:.002,releaseVelocity:[0,0,0],parameters:{gravity:9.80665,friction:1.15,
    rollingResistance:.015,roadRoughness:0,windX:0,windZ:0,aeroEnabled:false}};

test('condition sheet separates saved groups, vehicles and manual runs, and marks a partial batch',()=>{
  const text=landingConditionText([base,{...base,id:'2',vehicleTitle:'MX-5',method:'brake',brakeHeight:1.5,initialMass:1465},
    {...base,id:'3',groupId:'B',groupSize:1,height:8,method:'free',manualLiftUsed:true,manualLiftDuration:.25}],names);
  for(const field of ['2/3회','1/1회','20 m','8 m','900 L','35.875 MPa','375 kg','MX-5 · 초기 총질량 1465 kg',
    'Roadster · 초기 총질량 2275 kg','바퀴별 감쇠 6000','9.80665','2 ms','1.46.0','1.50.0','수동 분사 0.25 s','제동 설정 1.5 m'])assert.ok(text.includes(field),field);
  assert.doesNotMatch(text,/추가 질량/);
  assert.match(landingConditionText([{...base,physicsStep:undefined,releaseVelocity:undefined}],names),/초기 속력 미기록/);
  const audit={source:{id:base.id},rows:[{step:.002},{step:.001},{step:.0005}]};
  assert.match(landingConditionText([base],names,audit),/2 \/ 1 \/ 0.5 ms · 제어 주기 2 ms/);
  assert.doesNotMatch(landingConditionText([{...base,id:'different'}],names,audit),/계산 간격 검산/);
});

test('clipboard fallback keeps selected report text available inside the open dialog',async()=>{
  const nodes=new Map(),dialog={ownerDocument:{execCommand:()=>false},querySelector(id){
    if(!nodes.has(id))nodes.set(id,{focus(){},select(){this.selected=true;}});
    return nodes.get(id);
  }};
  await copyLandingConditions(dialog,[base],names);
  assert.equal(nodes.get('#landing-copy-text').hidden,false);
  assert.equal(nodes.get('#landing-copy-text').selected,true);
  assert.equal(nodes.get('#landing-copy-text').value,landingConditionText([base],names));
});
