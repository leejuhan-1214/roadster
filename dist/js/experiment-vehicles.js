// A fixed, mass-spaced experiment cohort. The city garage can grow independently.
// These selectors never change the vehicle or simulation mass parameters.
export const EXPERIMENT_VEHICLE_IDS=Object.freeze([
  'mazda-miata-mx-5','bmw','toyota-supra-mk','roadster','tesla-cybertruck',
]);
export const EXPERIMENT_DEFAULT_ID='roadster';
export const EXPERIMENT_INITIAL_GAS_KG=375;
const ids=new Set(EXPERIMENT_VEHICLE_IDS);
const BASIS=Object.freeze({
  'mazda-miata-mx-5':{label:'NA6CE 5MT 기준 + 가상 장치',assumed:false},
  bmw:{label:'E30 DIN 공차 기준 + 가상 장치',assumed:false},
  'toyota-supra-mk':{label:'JZA80 RZ 6MT 공차 기준 + 가상 장치',assumed:false},
  roadster:{label:'차체·장치 합산 실험 가정',assumed:true},
  'tesla-cybertruck':{label:'2019 콘셉트 질량 실험 가정',assumed:true},
});

export const isExperimentVehicle=id=>ids.has(id);

/** Keep all five required profiles, in increasing experimental mass order. */
export function experimentVehicles(vehicles){
  const byId=new Map(vehicles.map(profile=>[profile.id,profile]));
  return EXPERIMENT_VEHICLE_IDS.map(id=>{
    const profile=byId.get(id);
    if(!profile)throw new Error('실험 차체를 찾을 수 없습니다: '+id);
    return profile;
  });
}

/** All values are kg. `dry` means gas-excluded simulation mass, not OEM dry mass.
 * A null body/rig means the existing profile does not define that decomposition;
 * in particular Roadster's 1,900 kg already includes its hypothetical hardware.
 */
export function experimentMass(profile,initialGas=EXPERIMENT_INITIAL_GAS_KG){
  const dry=Number(profile.dryMass),gas=Number(initialGas);
  if(!Number.isFinite(dry)||dry<=0||!Number.isFinite(gas)||gas<0)
    throw new TypeError('질량은 양의 차체 질량과 0 이상의 기체 질량이어야 합니다.');
  const body=Number.isFinite(profile.referenceMass)?profile.referenceMass:null;
  const rig=Number.isFinite(profile.rigMass)?profile.rigMass:null;
  const metadata=BASIS[profile.id];
  return Object.freeze({dry,body,rig,gas,total:dry+gas,
    assumed:metadata?.assumed??(profile.massBasis==='assumed'||body===null),
    basis:metadata?.label||profile.massBasis||'시뮬레이션 질량',
  });
}

const kg=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
export function experimentMassLabel(profile,initialGas=EXPERIMENT_INITIAL_GAS_KG){
  const mass=experimentMass(profile,initialGas);
  return (profile.short||profile.title)+' · '+kg.format(mass.total)+' kg'+(mass.assumed?' · 가정':'');
}
