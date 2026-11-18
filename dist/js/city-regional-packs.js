// A pack covers 4×4 cells. Only the cell entering the existing streaming queue
// becomes meshes/colliders; the other fifteen share its cached source bytes.
export function indexRegionalTiles(manifest) {
  const region=manifest.regional;
  if(!region)return;
  const {bounds,tileSize}=manifest, n=region.packTiles;
  const overrides=new Set(region.waterOverrides);
  const packPath=(i,j)=>{
    const label=Math.floor(i/n)+'_'+Math.floor(j/n);
    const hash=region.packs[label];
    return hash?'region/'+label+'.bin?v='+hash:null;
  };
  const offset=(i,j)=>((j%n+n)%n)*n+((i%n+n)%n);
  for(const key of overrides){
    const record=manifest.tiles[key];
    if(!record)continue;
    record.waterPack=packPath(record.ix,record.iz);
    record.cell=offset(record.ix,record.iz);
  }
  // Instantiate the small record on first visit, not thousands on city entry.
  const known=manifest.tiles;
  manifest.tiles=new Proxy(known,{get(stored,key){
    if(Object.hasOwn(stored,key))return stored[key];
    if(typeof key!=='string'||!/^[-]?\d+_[-]?\d+$/.test(key))return undefined;
    const [ix,iz]=key.split('_').map(Number);
    const minX=ix*tileSize,minZ=iz*tileSize;
    if(minX<bounds.minX||minX>=bounds.maxX||minZ<bounds.minZ||minZ>=bounds.maxZ)return undefined;
    const entry={ix,iz,bounds:{minX,minZ,maxX:minX+tileSize,maxZ:minZ+tileSize},pack:packPath(ix,iz),cell:offset(ix,iz)};
    stored[key]=entry;
    return entry;
  }});
}

function points(encoded){
  const pairs=[];let x=0,z=0;
  for(let i=0;i<encoded.length;i+=2){
    x+=encoded[i];z+=encoded[i+1];pairs.push([x/100,z/100]);
  }
  return pairs;
}

const blank=()=>({roads:[],buildings:[],contextBuildings:[],landuse:[],water:[],buildingsOwned:true});

export function decodeRegionalPack(records){
  const cells=Array.from({length:16},blank);
  for(const [kind,mask,owner,raw] of records){
    let feature;
    if(kind==='r'){
      const [id,fields,track]=raw;
      feature={...fields,id:'bb:'+id,points:points(track)};
    }else{
      const paths=(kind==='b'?raw[2]:kind==='g'?raw[1]:raw).map(points);
      feature={points:paths[0]};
      if(paths.length>1)feature.holes=paths.slice(1);
      if(kind==='b')Object.assign(feature,raw[1],{id:'bb:'+raw[0]});
      if(kind==='g')feature.type=raw[0];
    }
    for(let i=0;i<16;i++){
      const bit=1<<i;if(!(mask&bit))continue;
      const field=kind==='r'?'roads':kind==='g'?'landuse':kind==='w'?'water':owner&bit?'buildings':'contextBuildings';
      cells[i][field].push(feature);
    }
  }
  return cells;
}

// Neighboring cell jobs may cancel independently while waiting for the same pack.
export function createRegionalPackLoader({fetchPack=fetch,capacity=8}={}){
  const ready=new Map(),inflight=new Map();
  async function read(url,signal){
    const response=await fetchPack(url,{signal});
    if(!response.ok)throw new Error('Seoul pack HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    // GitHub Pages normally serves .bin as opaque bytes. Some other static hosts
    // set Content-Encoding, in which case fetch has already decoded the payload.
    const raw=bytes[0]===31&&bytes[1]===139
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(bytes);
    signal.throwIfAborted();
    return decodeRegionalPack(JSON.parse(raw));
  }
  return async function load(url,cell,signal){
    if(!url)return blank();
    signal.throwIfAborted();
    if(ready.has(url)){
      const pack=ready.get(url);ready.delete(url);ready.set(url,pack);return pack[cell];
    }
    let job=inflight.get(url);
    if(!job){
      const controller=new AbortController();
      job={controller,users:0};
      const current=job;
      job.promise=read(url,controller.signal).then(pack=>{
        controller.signal.throwIfAborted();
        ready.set(url,pack);
        if(ready.size>capacity)ready.delete(ready.keys().next().value);
        return pack;
      }).finally(()=>{if(inflight.get(url)===current)inflight.delete(url);});
      inflight.set(url,job);
    }
    job.users++;
    let active=true;
    function release(){
      if(!active)return;
      active=false;job.users--;
      if(!job.users&&inflight.get(url)===job){
        inflight.delete(url);job.controller.abort();
      }
    }
    signal.addEventListener('abort',release,{once:true});
    try{const pack=await job.promise;signal.throwIfAborted();return pack[cell];}
    finally{signal.removeEventListener('abort',release);release();}
  };
}
