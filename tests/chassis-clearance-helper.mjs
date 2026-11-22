import assert from 'node:assert/strict';
import * as THREE from 'three';

// Inspect rendered source vertices in the solved chassis pose. A collision
// envelope alone cannot catch mesh registration errors or unrigged wheel patches.
export function assertChassisClearance(vehicle,profile,sim,parked){
  vehicle.root.updateMatrixWorld(true);
  const inverse=vehicle.root.matrixWorld.clone().invert();
  const pose=new THREE.Matrix4().compose(sim.bodyPosition,sim.state.q,new THREE.Vector3(1,1,1));
  const wheelbase=vehicle.geometryParams.wheelbase;
  let outer=Infinity,centre=Infinity;
  for(const partId of ['body','cabin','thrusters']){
    vehicle.parts.get(partId)?.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const geometry=mesh.geometry,position=geometry.attributes.position,index=geometry.index;
      const toChassis=inverse.clone().multiply(mesh.matrixWorld);
      const local=toChassis.elements,world=pose.clone().multiply(toChassis).elements;
      for(let i=0,count=index?.count??position.count;i<count;i++){
        const k=index?index.getX(i):i,x=position.getX(k),y=position.getY(k),z=position.getZ(k);
        const height=world[1]*x+world[5]*y+world[9]*z+world[13];
        outer=Math.min(outer,height);
        const fore=local[0]*x+local[4]*y+local[8]*z+local[12];
        const side=local[2]*x+local[6]*y+local[10]*z+local[14];
        if(partId!=='thrusters'&&Math.abs(fore)<wheelbase*.38&&Math.abs(side)<.35)centre=Math.min(centre,height);
      }
    });
  }
  const posture=parked?'parked':'driving';
  assert.ok(Number.isFinite(outer)&&outer>(parked?.012:.008),
    profile.id+' '+posture+' chassis and fitted hardware must clear asphalt and paint, measured '+outer+' m');
  if(profile.id.startsWith('sd-')){
    assert.ok(profile.adapter?.axleRideHeights?.every(h=>Number.isFinite(h)&&h>0),'source XML axle heights are required');
    const threshold=parked?.035:.015;
    assert.ok(Number.isFinite(centre)&&centre>threshold,
      profile.id+' '+posture+' central floor must clear the road, measured '+centre+' m');
  }
}
