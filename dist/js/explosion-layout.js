import * as THREE from 'three';

const axes=['x','y','z'];
const sign=(v,threshold=.06)=>Math.abs(v)<threshold?0:Math.sign(v);
const boxAt=(group,center)=>new THREE.Box3().setFromCenterAndSize(center,group.size);

function wheelIndex(object,vehicle){
  for(let p=object;p;p=p.parent){const i=vehicle.wheels.indexOf(p);if(i>=0)return i;}
  return -1;
}

// Material primitives belonging to one source object are one rigid component.
// A few assets export the entire body under a generic parent; separate those
// into shell, cabin and glazing assemblies, never into scattered material tiles.
function logicalGroups(entries,vehicle,assemblyBounds){
  const sourceGroups=new Map(),size=assemblyBounds.getSize(new THREE.Vector3()),mid=assemblyBounds.getCenter(new THREE.Vector3());
  for(const entry of entries){
    entry.wheelIndex=wheelIndex(entry.object,vehicle);
    const key=entry.wheelIndex>=0?'wheel-'+entry.wheelIndex:entry.kind==='hypothesis'?entry.id:entry.sourceKey;
    if(!sourceGroups.has(key))sourceGroups.set(key,[]);sourceGroups.get(key).push(entry);
  }
  const result=new Map();
  const add=(id,members)=>{
    if(!result.has(id))result.set(id,{id,entries:[],bounds:new THREE.Box3(),category:members[0].category,wheelIndex:members[0].wheelIndex,kind:members[0].kind});
    const g=result.get(id);for(const entry of members){g.entries.push(entry);g.bounds.union(entry.bounds);}
  };
  for(const [key,members]of sourceGroups){
    if(members[0].wheelIndex>=0||members[0].kind==='hypothesis'){add(key,members);continue;}
    const bounds=new THREE.Box3();members.forEach(e=>bounds.union(e.bounds));
    const sourceSize=bounds.getSize(new THREE.Vector3());
    // A generic scene parent may contain a complete car. It is not a physical
    // part: retain its material primitives in their local anatomical assemblies.
    const batches=sourceSize.x>size.x*.67&&members.length>1?members.map(e=>[e]):[members];
    for(const batch of batches){
      const box=new THREE.Box3();batch.forEach(e=>box.union(e.bounds));
      const c=box.getCenter(new THREE.Vector3()),s=box.getSize(new THREE.Vector3());
      const category=batch[0].category;
      let region;
      if(s.x>size.x*.65&&(s.z>size.z*.58||Math.abs(c.z-mid.z)<size.z*.2))region=category==='glazing'?'canopy':category==='interior'?'cabin':'shell';
      else if(Math.abs(c.z-mid.z)>size.z*.23&&s.z<size.z*.63)region=c.z>mid.z?'right-side':'left-side';
      else if(c.x>mid.x+size.x*.22)region='front';
      else if(c.x<mid.x-size.x*.22)region='rear';
      else if(category==='glazing'||c.y>mid.y+size.y*.18)region='canopy';
      else if(category==='interior')region='cabin';
      else region=c.y<mid.y-size.y*.18?'underbody':'cabin';
      add('body-'+region,batch);
    }
  }
  return [...result.values()].map(g=>{
    g.center=g.bounds.getCenter(new THREE.Vector3());g.size=g.bounds.getSize(new THREE.Vector3());
    g.size.addScalar(g.kind==='hypothesis'?.08:.035);return g;
  });
}

function candidateDirections(group,bodyBounds){
  const center=group.center,size=bodyBounds.getSize(new THREE.Vector3()),mid=bodyBounds.getCenter(new THREE.Vector3());
  const sx=sign(center.x,.12),sz=sign(center.z,.12);
  if(group.wheelIndex>=0)return [new THREE.Vector3(sx*.12,0,sz).normalize()];
  const y=center.y-mid.y,sy=sign(y,.05)||(/battery|thrusters|suspension|drive/.test(group.id)?-1:1);
  const base=new THREE.Vector3(sx?center.x/(size.x*.5):0,sy*Math.max(.18,Math.abs(y)/(size.y*.5)),sz?center.z/(size.z*.5):0);
  // Shell-spanning central parts separate vertically; side and end components
  // retain their original side and end. No source geometry is rotated/scaled.
  if(group.size.x>size.x*.65&&group.size.z>size.z*.65){base.x*=.18;base.z*=.18;base.y=sy;}
  const candidates=[base.clone().normalize()];
  for(const vertical of [.25,.55,1.3,2.2]){
    const d=base.clone();d.y=sy*vertical;candidates.push(d.normalize());
  }
  if(sx)candidates.push(new THREE.Vector3(sx,sy*.12,base.z*.25).normalize());
  if(sz)candidates.push(new THREE.Vector3(base.x*.25,sy*.12,sz).normalize());
  return candidates;
}

// A source assembly may sit below another part even when its material category
// suggests an upward detachment. Search other outward directions only when the
// preferred anatomical rays would introduce a crossing. Keep wheels on their
// original axle plane and every side/end component in its original quadrant.
function clearanceDirections(group){
  const sx=sign(group.center.x,.12),sz=sign(group.center.z,.12),wheel=group.wheelIndex>=0;
  const xs=sx?[0,sx*.35,sx]:[-1,0,1],zs=sz?[0,sz*.35,sz]:[-1,0,1];
  const ys=wheel?[0]:[-1,-.35,0,.35,1],directions=[];
  for(const x of xs)for(const y of ys)for(const z of zs){
    if(wheel&&(!z||!sz||Math.sign(z)!==sz))continue;
    const d=new THREE.Vector3(x,y,z);if(d.lengthSq())directions.push(d.normalize());
  }
  return directions;
}

// Forbidden ray intervals are the Minkowski-expanded stationary boxes. Moving
// beyond their union gives strict clearance without iteration or random jitter.
function rayDistance(group,direction,placed,start){
  const intervals=[];
  for(const other of placed){
    const half=group.size.clone().multiplyScalar(.5),b=other.box;
    let enter=-Infinity,exit=Infinity;
    for(const axis of axes){
      const lo=b.min[axis]-half[axis]-.065,hi=b.max[axis]+half[axis]+.065,c=group.center[axis],d=direction[axis];
      if(Math.abs(d)<1e-8){if(c<lo||c>hi){enter=Infinity;exit=-Infinity;break;}}
      else{const a=(lo-c)/d,z=(hi-c)/d;enter=Math.max(enter,Math.min(a,z));exit=Math.min(exit,Math.max(a,z));}
    }
    if(enter<=exit&&exit>=start)intervals.push([enter,exit]);
  }
  intervals.sort((a,b)=>a[0]-b[0]);let t=start;
  for(const [enter,exit]of intervals)if(t>=enter&&t<=exit)t=exit+.001;
  return t;
}

// Reject a newly introduced crossing between components that start apart.
// Components already fitted together at zero separate from that contact.
function crossesDuringSeparation(group,delta,other){
  if(group.bounds.intersectsBox(other.group.bounds))return false;
  const relative=delta.clone().sub(other.group.delta),a=group.bounds,b=other.group.bounds;
  let enter=0,exit=1;
  for(const axis of axes){
    const d=relative[axis];
    if(Math.abs(d)<1e-9){if(a.max[axis]<b.min[axis]||a.min[axis]>b.max[axis])return false;}
    else{const lo=(b.min[axis]-a.max[axis])/d,hi=(b.max[axis]-a.min[axis])/d;enter=Math.max(enter,Math.min(lo,hi));exit=Math.min(exit,Math.max(lo,hi));}
  }
  return enter<exit&&exit>1e-7&&enter<1-1e-7;
}

/** Natural, deterministic disassembly in chassis coordinates. */
export function createNaturalExplosionLayout(entries,vehicle){
  const assemblyBounds=new THREE.Box3();entries.forEach(e=>assemblyBounds.union(e.bounds));
  const groups=logicalGroups(entries,vehicle,assemblyBounds);
  const shells=groups.filter(g=>g.kind==='model'&&g.wheelIndex<0&&g.category!=='interior'&&g.category!=='glazing');
  const volume=g=>g.size.x*g.size.y*g.size.z;
  const anchor=(shells.length?shells:groups).reduce((best,g)=>!best||volume(g)>volume(best)?g:best,null);
  anchor.isAnchor=true;
  const remaining=groups.filter(g=>g!==anchor).sort((a,b)=>volume(b)-volume(a)||a.id.localeCompare(b.id));
  // A descending underbody can block a wheel that is deliberately constrained
  // to its axle plane. If the usual compact layout has no valid path, reserve
  // those four wheel routes first, then route the flexible body assemblies.
  const orders=[],orderKeys=new Set();
  const queueOrder=order=>{
    const key=order.map(g=>g.id).join('|');
    if(!orderKeys.has(key)){orderKeys.add(key);orders.push(order);}
  };
  queueOrder([anchor,...remaining]);
  queueOrder([anchor,...remaining.filter(g=>g.wheelIndex>=0),...remaining.filter(g=>g.wheelIndex<0)]);
  let placed,bounds,blocked;
  // A compact newly fitted tank/duct can change which small assembly has the
  // narrowest exit route. A volume-first greedy order may trap that assembly
  // despite a valid simultaneous separation. Reserve its route sooner rather
  // than dropping collision tests, rotating parts, or spreading them in a row.
  // Retries are deterministic and bounded; already successful layouts are kept.
  for(let attempt=0;attempt<orders.length&&attempt<16;attempt++){
    const order=orders[attempt];
    placed=[];bounds=new THREE.Box3();blocked=null;
    for(const group of order){
    let target=group.center.clone(),delta=new THREE.Vector3();
    if(!group.isAnchor){
      let best=Infinity;
      const consider=direction=>{
        const t=rayDistance(group,direction,placed,group.wheelIndex>=0?.55:.32),candidate=group.center.clone().addScaledVector(direction,t);
        const envelope=bounds.clone().union(boxAt(group,candidate)).getSize(new THREE.Vector3());
        const pathDelta=direction.clone().multiplyScalar(t);
        if(placed.some(other=>crossesDuringSeparation(group,pathDelta,other)))return;
        const score=t*t+envelope.x*envelope.x*.012+envelope.y*envelope.y*.05+envelope.z*envelope.z*.015;
        if(score<best){best=score;target=candidate;delta=direction.clone().multiplyScalar(t);}
      };
      candidateDirections(group,assemblyBounds).forEach(consider);
      if(!Number.isFinite(best))clearanceDirections(group).forEach(consider);
      if(!Number.isFinite(best)){blocked=group.id;break;}
    }
    group.target=target;group.delta=delta;const box=boxAt(group,target);bounds.union(box);placed.push({group,box});
    }
    if(!blocked)break;
    const constrained=groups.find(g=>g.id===blocked),others=order.filter(g=>g!==anchor&&g!==constrained);
    queueOrder([anchor,constrained,...others]);
    if(constrained.wheelIndex<0)queueOrder([anchor,...others.filter(g=>g.wheelIndex>=0),constrained,...others.filter(g=>g.wheelIndex<0)]);
  }
  if(blocked)throw new Error('No collision-free disassembly path for '+blocked);
  const groundLift=Math.max(0,.15-bounds.min.y);
  for(const group of groups){
    group.delta.y+=groundLift;group.target.y+=groundLift;
    for(const entry of group.entries){entry.delta=group.delta.clone();entry.target=entry.center.clone().add(entry.delta);entry.logicalGroup=group.id;}
  }
  bounds.translate(new THREE.Vector3(0,groundLift,0));
  return {logicalGroups:groups,assemblyBounds,explosionBounds:bounds,groundLift,gap:.065};
}
