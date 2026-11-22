// Bounded, asynchronous real-map streaming. No geometry is generated in update().
export function createTileScheduler({manifest,load,hydrate,onActivate=()=>{},onEvict=()=>{},now=()=>performance.now(),budgetMs=2,radius=2,concurrency=2}){
  const size=manifest.tileSize,entries=manifest.tiles,chunks=new Map(),pending=new Map(),staging=new Map(),failures=new Map();
  const retiring=new Set(),reservations=new Map();
  let reservationsChanged=false;
  let wanted=new Set(),keep=new Set(),ordered=[],disposed=false,revision=0,requests=0;
  let anchorX,anchorZ,forwardX,forwardZ,needsPump=true,nextRetry=Infinity;
  const keyAt=(x,z)=>Math.floor(x/size)+'_'+Math.floor(z/size);
  function release(key){const chunk=chunks.get(key);if(!chunk)return;onEvict(key,chunk);chunk.dispose();chunks.delete(key);revision++;}
  function pump(){
    if(disposed)return;
    needsPump=false;nextRetry=Infinity;
    const time=failures.size?now():0;
    for(const key of ordered){
      if(pending.size>=concurrency||pending.size+staging.size>=3)break;
      if(chunks.has(key)||pending.has(key)||staging.has(key))continue;
      const retry=failures.get(key)?.retryAt;
      if(retry>time){nextRetry=Math.min(nextRetry,retry);continue;}
      const controller=new AbortController(),request={controller};pending.set(key,request);requests++;
      Promise.resolve().then(()=>load(entries[key],key,controller.signal)).then(payload=>{
        if(disposed||controller.signal.aborted||!wanted.has(key))return;
        staging.set(key,hydrate(payload,key));failures.delete(key);
      }).catch(error=>{
        if(disposed||controller.signal.aborted)return;
        const attempts=(failures.get(key)?.attempts||0)+1;
        failures.set(key,{attempts,retryAt:now()+Math.min(30000,1000*2**attempts),message:String(error.message||error)});
      }).finally(()=>{if(pending.get(key)===request){pending.delete(key);needsPump=true;}});
    }
  }
  function update(x,z,vx=0,vz=0){
    if(disposed||!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(vx)||!Number.isFinite(vz))return;
    const tx=Math.floor(x/size),tz=Math.floor(z/size);
    // One extra forward row is fetched early at driving/flying speeds.
    const dx=Math.abs(vx)>8?Math.sign(vx):0,dz=Math.abs(vz)>8?Math.sign(vz):0;
    if(tx!==anchorX||tz!==anchorZ||dx!==forwardX||dz!==forwardZ||reservationsChanged){
      reservationsChanged=false;
      anchorX=tx;anchorZ=tz;forwardX=dx;forwardZ=dz;needsPump=true;wanted=new Set();keep=new Set();
      for(let a=-radius-1;a<=radius+1;a++)for(let b=-radius-1;b<=radius+1;b++){
        const key=(tx+a)+'_'+(tz+b);if(!entries[key])continue;
        keep.add(key);if(Math.abs(a)<=radius&&Math.abs(b)<=radius)wanted.add(key);
      }
      if(dx||dz)for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        const key=(tx+a+dx)+'_'+(tz+b+dz);if(entries[key])wanted.add(key);
      }
      const aheadX=x+vx*2,aheadZ=z+vz*2;
      ordered=[...wanted].map(key=>{
        const b=entries[key].bounds;
        return {key,distance:((b.minX+b.maxX)/2-aheadX)**2+((b.minZ+b.maxZ)/2-aheadZ)**2};
      }).sort((a,b)=>a.distance-b.distance).map(item=>item.key);
      // Warp preparation shares the normal worker queue and hydration budget.
      // The car's current tiles stay resident while the destination is prepared.
      if(reservations.size){
        ordered=[...reservations.keys(),...ordered.filter(key=>!reservations.has(key))];
        for(const key of reservations.keys())wanted.add(key);
      }
      for(const [key,p]of pending)if(!wanted.has(key))p.controller.abort();
      for(const [key,h]of staging)if(!wanted.has(key)){h.dispose();staging.delete(key);}
      retiring.clear();
      for(const key of chunks.keys())if(!keep.has(key)&&!wanted.has(key))retiring.add(key);
    }
    if(!retiring.size&&!staging.size){
      if(needsPump||(nextRetry<Infinity&&now()>=nextRetry))pump();
      return;
    }
    const start=now();let steps=0;
    // Disposing a whole trailing row at a 512 m boundary can stall drawing.
    // Retire at most one per frame. This also caps resident chunks because
    // at most one ready tile can be activated per update.
    if(retiring.size){
      const key=retiring.values().next().value;retiring.delete(key);release(key);
      if(now()-start>=budgetMs){if(needsPump)pump();return;}
    }
    for(const key of ordered){
      const h=staging.get(key);if(!h)continue;
      try{
        const done=h.step();steps++;
        if(done){onActivate(key,h);chunks.set(key,h);staging.delete(key);revision++;needsPump=true;break;}
      }catch(error){h.dispose();staging.delete(key);needsPump=true;failures.set(key,{attempts:1,retryAt:now()+5000,message:String(error.message||error)});}
      if(steps>=2||now()-start>=budgetMs)break;
    }
    if(needsPump||(nextRetry<Infinity&&now()>=nextRetry))pump();
  }
  return {update,chunks,pending,staging,failures,keyAt,
    reserve(keys){
      const held=new Set(keys);
      for(const key of held)reservations.set(key,(reservations.get(key)||0)+1);
      if(held.size)reservationsChanged=true;
      return ()=>{
        for(const key of held){
          const remaining=reservations.get(key)-1;
          if(remaining)reservations.set(key,remaining);else reservations.delete(key);
        }
        if(held.size)reservationsChanged=true;
        held.clear();
      };
    },
    get revision(){return revision;},get requests(){return requests;},get wanted(){return wanted;},
    hasAt(x,z){return chunks.has(keyAt(x,z));},
    contains(x,z){const b=manifest.bounds;return x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ;},
    dispose(){disposed=true;for(const p of pending.values())p.controller.abort();pending.clear();for(const h of staging.values())h.dispose();staging.clear();for(const key of [...chunks.keys()])release(key);}
  };
}
