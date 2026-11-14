// A fictional pneumatic retrofit fitted to each imported car's actual skin.
// Exterior meshes, paint materials, wheel rigs and OEM dimensions stay intact.
// Call after assessment preparation, before the one-time surface fit.
export function prepareRocketRetrofit(vehicle){
  if(vehicle.rocketRetrofit)return vehicle;
  if(vehicle.fitLayout)throw new Error('Rocket retrofit must precede vehicle fitting');
  const rig=vehicle.parts?.get('thrusters');
  if(!rig||vehicle.gimbalNozzles?.length!==4)throw new Error('Four lift mounts are required for the pneumatic retrofit');
  const liftMounts=new Set(vehicle.gimbalNozzles.map(p=>p.parent));
  const oldRear=rig.children.filter(n=>n.isGroup&&!liftMounts.has(n)&&!vehicle.fans?.includes(n)).slice(0,2);
  if(oldRear.length!==2)throw new Error('Two source rear mounts are required for the pneumatic retrofit');
  const rear=[oldRear[0],oldRear[0].clone(true),oldRear[1].clone(true),oldRear[1]];
  for(let i=0;i<rear.length;i++){
    rear[i].name='retrofit rear nozzle '+i;
    rear[i].userData.rocketRear=true;
    if(!rear[i].parent)rig.add(rear[i]);
  }
  vehicle.rearNozzles=rear;
  vehicle.rocketRetrofit=true;
  vehicle.fixedNozzleLayout=false;
  vehicle.geometryParams??={};
  vehicle.geometryParams.propulsionProfile='rocket10';
  const entry=vehicle.catalog?.find(p=>p.id==='thrusters');
  if(entry){
    entry.title='후방 4개·하부 4개·측면 2개 분사구·흡입 팬';
    entry.description='차체 표면에 맞춘 가상 압축공기 장치입니다. 후방 네 주추진기와 하부 네 분사구, 앞쪽 측면 두 분사구는 같은 물리 좌표를 사용합니다. 실제 해당 차종의 순정 장치가 아닙니다.';
  }
  return vehicle;
}
