// Bounded, asynchronous real-map streaming. No geometry is generated in update().
export function createTileScheduler({manifest,load,hydrate,onActivate=()=>{},onEvict=()=>{},now=()=>performance.now(),budgetMs=2,radius=2,concurrency=2}){
  const size=manifest.tileSize,entries=manifest.tiles,chunks=new Map(),pending=new Map(),staging=new Map(),failures=new Map();
  let wanted=new Set(),keep=new Set(),ordered=[],anchor='',disposed=false,revision=0,requests=0;
  const keyAt=(x,z)=>Math.floor(x/size)+'_'+Math.floor(z/size);
  function release(key){const chunk=chunks.get(key);if(!chunk)return;onEvict(key,chunk);chunk.dispose();chunks.delete(key);revision++;}
  function pump(){
    if(disposed)return;
    for(const key of ordered){
      if(pending.size>=concurrency||pending.size+staging.size>=3)break;
      if(chunks.has(key)||pending.has(key)||staging.has(key)||(failures.get(key)?.retryAt||0)>now())continue;
      const controller=new AbortController(),request={controller};pending.set(key,request);requests++;
      Promise.resolve().then(()=>load(entries[key],key,controller.signal)).then(payload=>{
        if(disposed||controller.signal.aborted||!wanted.has(key))return;
        staging.set(key,hydrate(payload,key));failures.delete(key);
      }).catch(error=>{
        if(disposed||controller.signal.aborted)return;
        const attempts=(failures.get(key)?.attempts||0)+1;
        failures.set(key,{attempts,retryAt:now()+Math.min(30000,1000*2**attempts),message:String(error.message||error)});
      }).finally(()=>{if(pending.get(key)===request)pending.delete(key);});
    }
  }
  function update(x,z,vx=0,vz=0){
    if(disposed||![x,z,vx,vz].every(Number.isFinite))return;
    const tx=Math.floor(x/size),tz=Math.floor(z/size);
    // One extra forward row is fetched early at driving/flying speeds.
    const dx=Math.abs(vx)>8?Math.sign(vx):0,dz=Math.abs(vz)>8?Math.sign(vz):0;
    const next=tx+'_'+tz+'_'+dx+'_'+dz;
    if(anchor!==next){
      anchor=next;wanted=new Set();keep=new Set();
      for(let a=-radius-1;a<=radius+1;a++)for(let b=-radius-1;b<=radius+1;b++){
        const key=(tx+a)+'_'+(tz+b);if(!entries[key])continue;
        keep.add(key);if(Math.abs(a)<=radius&&Math.abs(b)<=radius)wanted.add(key);
      }
      if(dx||dz)for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        const key=(tx+a+dx)+'_'+(tz+b+dz);if(entries[key])wanted.add(key);
      }
      ordered=[...wanted].sort((a,b)=>{
        const score=k=>{const e=entries[k],cx=(e.bounds.minX+e.bounds.maxX)/2,cz=(e.bounds.minZ+e.bounds.maxZ)/2;return Math.hypot(cx-x-vx*2,cz-z-vz*2);};
        return score(a)-score(b);
      });
      for(const [key,p]of pending)if(!wanted.has(key))p.controller.abort();
      for(const [key,h]of staging)if(!wanted.has(key)){h.dispose();staging.delete(key);}
      for(const key of chunks.keys())if(!keep.has(key)&&!wanted.has(key))release(key);
    }
    const start=now();let steps=0;
    for(const key of ordered){
      const h=staging.get(key);if(!h)continue;
      try{
        const done=h.step();steps++;
        if(done){onActivate(key,h);chunks.set(key,h);staging.delete(key);revision++;break;}
      }catch(error){h.dispose();staging.delete(key);failures.set(key,{attempts:1,retryAt:now()+5000,message:String(error.message||error)});}
      if(steps>=2||now()-start>=budgetMs)break;
    }
    pump();
  }
  return {update,chunks,pending,staging,failures,keyAt,
    get revision(){return revision;},get requests(){return requests;},get wanted(){return wanted;},
    hasAt(x,z){return chunks.has(keyAt(x,z));},
    contains(x,z){const b=manifest.bounds;return x>=b.minX&&x<b.maxX&&z>=b.minZ&&z<b.maxZ;},
    dispose(){disposed=true;for(const p of pending.values())p.controller.abort();pending.clear();for(const h of staging.values())h.dispose();staging.clear();for(const key of [...chunks.keys()])release(key);}
  };
}
